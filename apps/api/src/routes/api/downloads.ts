import { Elysia, t } from 'elysia';
import { eq, and, asc } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { db } from '../../db';
import { galleries, photos, favorites, downloads, attachments } from '../../db/schema';
import { authContext } from '../../middleware/auth';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { clientIp } from '../../middleware/client-ip';
import { checkRateLimit } from '../../middleware/rate-limit';
import { presignDownload } from '../../services/storage';
import { buildZipStream, type ZipEntry } from '../../services/zip-builder';
import { slugify } from '../../services/slug';
import { notifyPhotographer } from '../../services/notify';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

function isExpired(g: typeof galleries.$inferSelect): boolean {
  if (!g.expiresAt) return false;
  const grace = (g.gracePeriodDays ?? 0) * 86_400;
  return g.expiresAt + grace < now();
}

interface AuthContext {
  currentPhotographer: { id: string } | null;
  gallerySession: { token: string; galleryId: string } | null;
}

/**
 * Resolves whether the caller is allowed to access the gallery contents.
 * Admin owner always yes. Otherwise: public/un-expired, or a valid
 * gallery_session scoped to this gallery.
 */
function hasGalleryAccess(g: typeof galleries.$inferSelect, ctx: AuthContext): boolean {
  if (ctx.currentPhotographer && g.photographerId === ctx.currentPhotographer.id) return true;
  if (isExpired(g)) return false;
  if (ctx.gallerySession?.galleryId === g.id) return true;
  return !g.passwordHash;
}

/**
 * Per v1.2 §5: `downloadMode` controls which derivative the client gets when
 * they hit /download. Admin always gets the original.
 *   none        → never (403)
 *   watermarked → watermarked derivative, falling back to preview
 *   full        → original
 *   selected    → original only if THIS session has favorited the photo;
 *                 otherwise fall back to watermarked/preview
 */
async function resolveDownloadKey(
  gallery: typeof galleries.$inferSelect,
  photo: typeof photos.$inferSelect,
  ctx: AuthContext,
): Promise<{ ok: true; key: string } | { ok: false; status: number; error: string }> {
  if (ctx.currentPhotographer && gallery.photographerId === ctx.currentPhotographer.id) {
    if (!photo.s3KeyOriginal) return { ok: false, status: 404, error: 'derivative_not_ready' };
    return { ok: true, key: photo.s3KeyOriginal };
  }

  if (gallery.allowDownload !== 1) return { ok: false, status: 403, error: 'downloads_disabled' };
  const mode = gallery.downloadMode ?? 'watermarked';
  if (mode === 'none') return { ok: false, status: 403, error: 'downloads_disabled' };

  if (mode === 'full') {
    if (!photo.s3KeyOriginal) return { ok: false, status: 404, error: 'derivative_not_ready' };
    return { ok: true, key: photo.s3KeyOriginal };
  }

  if (mode === 'selected') {
    if (ctx.gallerySession) {
      const fav = await db.query.favorites.findFirst({
        where: and(
          eq(favorites.galleryId, gallery.id),
          eq(favorites.photoId, photo.id),
          eq(favorites.sessionToken, ctx.gallerySession.token),
        ),
      });
      if (fav && photo.s3KeyOriginal) return { ok: true, key: photo.s3KeyOriginal };
    }
    // fall through to watermarked/preview
  }

  const fallback = photo.s3KeyWatermarked ?? photo.s3KeyPreview;
  if (!fallback) return { ok: false, status: 404, error: 'derivative_not_ready' };
  return { ok: true, key: fallback };
}

export const downloadRoutes = new Elysia({ prefix: '/api/gallery' })
  .use(authContext)
  .use(gallerySessionContext)
  .use(clientIp)

  // GET /api/gallery/:slug/download/:photoId — single-photo download (302 to
  // presigned URL with attachment Content-Disposition).
  .get('/:slug/download/:photoId', async (ctx) => {
    const { params, currentPhotographer, gallerySession, clientIp, set } = ctx;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (!hasGalleryAccess(gallery, { currentPhotographer, gallerySession })) {
      set.status = isExpired(gallery) ? 410 : 401;
      return { error: isExpired(gallery) ? 'expired' : 'unauthenticated' };
    }

    const photo = await db.query.photos.findFirst({ where: eq(photos.id, params.photoId) });
    if (!photo || photo.galleryId !== gallery.id) {
      set.status = 404;
      return { error: 'photo_not_found' };
    }

    const resolved = await resolveDownloadKey(gallery, photo, { currentPhotographer, gallerySession });
    if (!resolved.ok) { set.status = resolved.status; return { error: resolved.error }; }

    await db.insert(downloads).values({
      id: newId(),
      galleryId: gallery.id,
      photoId: photo.id,
      clientIp: clientIp ?? null,
      createdAt: now(),
    });

    // Don't notify on admin downloads (they're the photographer themselves)
    // and rate-limit non-admin notifications to one email per hour per gallery
    // per IP — clients often re-download multiple times.
    const isOwner = currentPhotographer && gallery.photographerId === currentPhotographer.id;
    if (!isOwner && checkRateLimit(
      'email:download', `${gallery.id}:${clientIp ?? 'unknown'}`, 1, 3600,
    )) {
      await notifyPhotographer(gallery.id, 'download', {
        isZip: false,
        clientName: gallery.clientName ?? null,
        filename: photo.filenameOriginal,
      });
    }

    const url = await presignDownload(resolved.key, photo.filenameOriginal);
    log.info('download.single', { galleryId: gallery.id, photoId: photo.id });
    set.status = 302;
    set.headers['location'] = url;
    return '';
  })

  // GET /api/gallery/:slug/download?scope=all|favorites — streaming ZIP of the
  // chosen photo set. Uses store (level 0); inputs are already-compressed
  // JPEG/WebP so deflate would burn CPU for ~0% gain (v1.2 §9).
  .get('/:slug/download', async (ctx) => {
    const { params, query, currentPhotographer, gallerySession, clientIp, set } = ctx;
    const scope = query.scope ?? 'all';

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (!hasGalleryAccess(gallery, { currentPhotographer, gallerySession })) {
      set.status = isExpired(gallery) ? 410 : 401;
      return { error: isExpired(gallery) ? 'expired' : 'unauthenticated' };
    }

    // v1.2 §14: 3 ZIP initiations per IP per gallery per hour. Admin bypass —
    // photographers downloading their own galleries shouldn't be throttled.
    const isAdmin = currentPhotographer && gallery.photographerId === currentPhotographer.id;
    if (!isAdmin && !checkRateLimit(`zip:${gallery.id}`, clientIp ?? 'unknown', 3, 3600)) {
      set.status = 429;
      return { error: 'too_many_zip_downloads' };
    }

    let photoRows = await db.query.photos.findMany({
      where: and(eq(photos.galleryId, gallery.id), eq(photos.uploadStatus, 'ready')),
      orderBy: [asc(photos.position), asc(photos.createdAt)],
    });

    if (scope === 'favorites') {
      if (!gallerySession) { set.status = 401; return { error: 'no_session' }; }
      const favs = await db.query.favorites.findMany({
        where: and(eq(favorites.galleryId, gallery.id), eq(favorites.sessionToken, gallerySession.token)),
      });
      const favIds = new Set(favs.map((f) => f.photoId));
      photoRows = photoRows.filter((p) => favIds.has(p.id));
    }

    if (photoRows.length === 0) {
      set.status = 404;
      return { error: 'no_photos_in_scope' };
    }

    const entries: ZipEntry[] = [];
    for (const photo of photoRows) {
      const resolved = await resolveDownloadKey(gallery, photo, { currentPhotographer, gallerySession });
      if (!resolved.ok) continue; // skip photos without a usable derivative
      entries.push({ key: resolved.key, filename: `photos/${photo.filenameOriginal}` });
    }

    // Include gallery attachments alongside photos under a separate prefix.
    // Skip when scope is "favorites" — favorites are per-photo, not per-file.
    if (scope !== 'favorites') {
      const attRows = await db.query.attachments.findMany({
        where: eq(attachments.galleryId, gallery.id),
        orderBy: [asc(attachments.position), asc(attachments.createdAt)],
      });
      for (const att of attRows) {
        entries.push({
          key: att.s3Key,
          filename: `files/${att.displayName ?? att.filenameOriginal}`,
        });
      }
    }

    if (entries.length === 0) {
      set.status = 403;
      return { error: 'no_downloadable_photos' };
    }

    await db.insert(downloads).values({
      id: newId(),
      galleryId: gallery.id,
      photoId: null,
      clientIp: clientIp ?? null,
      createdAt: now(),
    });

    if (!isAdmin && checkRateLimit(
      'email:download', `${gallery.id}:${clientIp ?? 'unknown'}`, 1, 3600,
    )) {
      await notifyPhotographer(gallery.id, 'download', {
        isZip: true,
        scope,
        photoCount: entries.length,
        one: entries.length === 1,
        clientName: gallery.clientName ?? null,
      });
    }

    const { archive } = buildZipStream(entries);
    const zipName = `${slugify(gallery.title) || 'gallery'}${scope === 'favorites' ? '-favorites' : ''}.zip`;
    log.info('download.zip', { galleryId: gallery.id, scope, count: entries.length });

    return new Response(
      Readable.toWeb(archive) as unknown as ReadableStream,
      {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipName}"`,
          'Cache-Control': 'no-store',
        },
      },
    );
  }, {
    query: t.Object({
      scope: t.Optional(t.Union([t.Literal('all'), t.Literal('favorites')])),
    }),
  });
