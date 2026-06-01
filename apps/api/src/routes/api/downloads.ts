import { Elysia } from 'elysia';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { galleries, photos, favorites, downloads } from '../../db/schema';
import { authContext } from '../../middleware/auth';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { clientIp } from '../../middleware/client-ip';
import { checkRateLimit } from '../../middleware/rate-limit';
import { presignDownload } from '../../services/storage';
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

    const url = await presignDownload(resolved.key, photo.filenameOriginal);
    log.info('download.single', { galleryId: gallery.id, photoId: photo.id });
    set.status = 302;
    set.headers['location'] = url;
    return '';
  });
