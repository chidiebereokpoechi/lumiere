import { Elysia, t } from 'elysia';
import { eq, and, asc } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { db } from '../../db';
import { galleries, files, favorites, downloads, galleryFolders } from '../../db/schema';
import { authContext } from '../../middleware/auth';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { clientIp } from '../../middleware/client-ip';
import { checkRateLimit } from '../../middleware/rate-limit';
import { presignDownload, presignGet } from '../../services/storage';
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

function hasGalleryAccess(g: typeof galleries.$inferSelect, ctx: AuthContext): boolean {
  if (ctx.currentPhotographer && g.photographerId === ctx.currentPhotographer.id) return true;
  if (isExpired(g)) return false;
  if (ctx.gallerySession?.galleryId === g.id) return true;
  return !g.passwordHash;
}

/**
 * `downloadMode` controls which derivative the client gets. Admin always gets
 * the original. Non-image files have no derivatives, so they always serve the
 * original (subject to downloads being enabled).
 */
async function resolveDownloadKey(
  gallery: typeof galleries.$inferSelect,
  file: typeof files.$inferSelect,
  ctx: AuthContext,
): Promise<{ ok: true; key: string } | { ok: false; status: number; error: string }> {
  if (ctx.currentPhotographer && gallery.photographerId === ctx.currentPhotographer.id) {
    if (!file.s3KeyOriginal) return { ok: false, status: 404, error: 'not_ready' };
    return { ok: true, key: file.s3KeyOriginal };
  }

  if (gallery.allowDownload !== 1) return { ok: false, status: 403, error: 'downloads_disabled' };
  const mode = gallery.downloadMode ?? 'watermarked';
  if (mode === 'none') return { ok: false, status: 403, error: 'downloads_disabled' };

  // Non-image media has no watermark/preview ladder — serve the original.
  if (file.type !== 'image' || mode === 'full') {
    if (!file.s3KeyOriginal) return { ok: false, status: 404, error: 'not_ready' };
    return { ok: true, key: file.s3KeyOriginal };
  }

  if (mode === 'selected' && ctx.gallerySession) {
    const fav = await db.query.favorites.findFirst({
      where: and(
        eq(favorites.galleryId, gallery.id),
        eq(favorites.fileId, file.id),
        eq(favorites.sessionToken, ctx.gallerySession.token),
      ),
    });
    if (fav && file.s3KeyOriginal) return { ok: true, key: file.s3KeyOriginal };
  }

  const fallback = file.s3KeyWatermarked ?? file.s3KeyPreview;
  if (!fallback) return { ok: false, status: 404, error: 'not_ready' };
  return { ok: true, key: fallback };
}

export const downloadRoutes = new Elysia({ prefix: '/api/gallery' })
  .use(authContext)
  .use(gallerySessionContext)
  .use(clientIp)

  // GET /api/gallery/:slug/files/:fileId/stream — inline playback URL (no
  // attachment disposition; S3 Range handles seeking). Long TTL.
  .get('/:slug/files/:fileId/stream', async (ctx) => {
    const { params, currentPhotographer, gallerySession, set } = ctx;
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (!hasGalleryAccess(gallery, { currentPhotographer, gallerySession })) {
      set.status = isExpired(gallery) ? 410 : 401;
      return { error: isExpired(gallery) ? 'expired' : 'unauthenticated' };
    }
    const file = await db.query.files.findFirst({ where: eq(files.id, params.fileId) });
    if (!file || file.galleryId !== gallery.id || !file.s3KeyOriginal) {
      set.status = 404; return { error: 'file_not_found' };
    }
    const url = await presignGet(file.s3KeyOriginal, 6 * 3600);
    set.status = 302;
    set.headers['location'] = url;
    return '';
  })

  // GET /api/gallery/:slug/files/:fileId/download — single-file download (302 to
  // presigned URL with attachment Content-Disposition).
  .get('/:slug/files/:fileId/download', async (ctx) => {
    const { params, currentPhotographer, gallerySession, clientIp, set } = ctx;
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (!hasGalleryAccess(gallery, { currentPhotographer, gallerySession })) {
      set.status = isExpired(gallery) ? 410 : 401;
      return { error: isExpired(gallery) ? 'expired' : 'unauthenticated' };
    }

    const file = await db.query.files.findFirst({ where: eq(files.id, params.fileId) });
    if (!file || file.galleryId !== gallery.id) { set.status = 404; return { error: 'file_not_found' }; }

    const resolved = await resolveDownloadKey(gallery, file, { currentPhotographer, gallerySession });
    if (!resolved.ok) { set.status = resolved.status; return { error: resolved.error }; }

    await db.insert(downloads).values({
      id: newId(), galleryId: gallery.id, fileId: file.id, clientIp: clientIp ?? null,
      clientEmail: gallerySession?.clientEmail ?? null, createdAt: now(),
    });

    const isOwner = currentPhotographer && gallery.photographerId === currentPhotographer.id;
    if (!isOwner && checkRateLimit('email:download', `${gallery.id}:${clientIp ?? 'unknown'}`, 1, 3600)) {
      await notifyPhotographer(gallery.id, 'download', {
        isZip: false, clientName: gallery.clientName ?? null,
        filename: file.displayName ?? file.filenameOriginal,
      });
    }

    const url = await presignDownload(resolved.key, file.displayName ?? file.filenameOriginal);
    log.info('download.single', { galleryId: gallery.id, fileId: file.id });
    set.status = 302;
    set.headers['location'] = url;
    return '';
  })

  // GET /api/gallery/:slug/download?scope=all|favorites|selected[&ids=…] —
  // streaming ZIP of the chosen file set (store level 0).
  .get('/:slug/download', async (ctx) => {
    const { params, query, currentPhotographer, gallerySession, clientIp, set } = ctx;
    const selectedIds = query.ids
      ? new Set(query.ids.split(',').map((s) => s.trim()).filter(Boolean))
      : null;
    const folderIdList = query.folderIds
      ? query.folderIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const wantFavorites = query.favorites === '1';
    // 'multi' = the download-picker union (any of N sets + favorites + list
    // files passed as ids). Pure ids (no sets/favorites) stays the 'selected'
    // single-scope path used by the selection bar.
    const scope =
      folderIdList.length > 0 || wantFavorites
        ? 'multi'
        : selectedIds
          ? 'selected'
          : query.folderId
            ? 'folder'
            : (query.scope ?? 'all');

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (!hasGalleryAccess(gallery, { currentPhotographer, gallerySession })) {
      set.status = isExpired(gallery) ? 410 : 401;
      return { error: isExpired(gallery) ? 'expired' : 'unauthenticated' };
    }

    const isAdmin = currentPhotographer && gallery.photographerId === currentPhotographer.id;

    // Folder download: validate ownership; non-admins can't grab a hidden folder.
    let folderName: string | null = null;
    if (query.folderId) {
      const folder = await db.query.galleryFolders.findFirst({ where: eq(galleryFolders.id, query.folderId) });
      if (!folder || folder.galleryId !== gallery.id) { set.status = 404; return { error: 'folder_not_found' }; }
      if (!isAdmin && folder.hidden) { set.status = 404; return { error: 'folder_not_found' }; }
      folderName = folder.name;
    }
    if (!isAdmin && !checkRateLimit(`zip:${gallery.id}`, clientIp ?? 'unknown', 3, 3600)) {
      set.status = 429;
      return { error: 'too_many_zip_downloads' };
    }

    let fileRows = await db.query.files.findMany({
      where: and(eq(files.galleryId, gallery.id), eq(files.uploadStatus, 'ready')),
      orderBy: [asc(files.position), asc(files.createdAt)],
    });

    if (scope === 'favorites') {
      if (!gallerySession) { set.status = 401; return { error: 'no_session' }; }
      const favs = await db.query.favorites.findMany({
        where: and(eq(favorites.galleryId, gallery.id), eq(favorites.sessionToken, gallerySession.token)),
      });
      const favIds = new Set(favs.map((f) => f.fileId));
      fileRows = fileRows.filter((f) => favIds.has(f.id));
    } else if (scope === 'selected' && selectedIds) {
      fileRows = fileRows.filter((f) => selectedIds.has(f.id));
    } else if (scope === 'multi') {
      // Union of the requested sets (non-admins can't reach hidden ones) and,
      // when flagged, the client's favorites.
      let okFolders = new Set<string>();
      if (folderIdList.length > 0) {
        const folders = await db.query.galleryFolders.findMany({
          where: eq(galleryFolders.galleryId, gallery.id),
        });
        okFolders = new Set(
          folders
            .filter((f) => folderIdList.includes(f.id) && (isAdmin || !f.hidden))
            .map((f) => f.id),
        );
      }
      let favIds = new Set<string>();
      if (wantFavorites && gallerySession) {
        const favs = await db.query.favorites.findMany({
          where: and(eq(favorites.galleryId, gallery.id), eq(favorites.sessionToken, gallerySession.token)),
        });
        favIds = new Set(favs.map((f) => f.fileId));
      }
      fileRows = fileRows.filter(
        (f) =>
          (f.folderId && okFolders.has(f.folderId)) ||
          favIds.has(f.id) ||
          (selectedIds?.has(f.id) ?? false),
      );
    } else if (query.folderId) {
      fileRows = fileRows.filter((f) => f.folderId === query.folderId);
    }

    if (fileRows.length === 0) { set.status = 404; return { error: 'no_files_in_scope' }; }

    const entries: ZipEntry[] = [];
    for (const file of fileRows) {
      const resolved = await resolveDownloadKey(gallery, file, { currentPhotographer, gallerySession });
      if (!resolved.ok) continue;
      entries.push({ key: resolved.key, filename: file.displayName ?? file.filenameOriginal });
    }
    if (entries.length === 0) { set.status = 403; return { error: 'no_downloadable_files' }; }

    await db.insert(downloads).values({
      id: newId(), galleryId: gallery.id, fileId: null, clientIp: clientIp ?? null,
      clientEmail: gallerySession?.clientEmail ?? null, createdAt: now(),
    });

    if (!isAdmin && checkRateLimit('email:download', `${gallery.id}:${clientIp ?? 'unknown'}`, 1, 3600)) {
      await notifyPhotographer(gallery.id, 'download', {
        isZip: true, scope, photoCount: entries.length, one: entries.length === 1,
        clientName: gallery.clientName ?? null,
      });
    }

    const { archive } = buildZipStream(entries);
    const suffix = scope === 'favorites' ? '-favorites'
      : scope === 'selected' ? '-selected'
      : scope === 'multi' ? '-selection'
      : scope === 'folder' ? `-${slugify(folderName ?? 'folder')}`
      : '';
    const zipName = `${slugify(gallery.title) || 'gallery'}${suffix}.zip`;
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
      scope: t.Optional(t.Union([t.Literal('all'), t.Literal('favorites'), t.Literal('selected')])),
      ids: t.Optional(t.String()),
      folderId: t.Optional(t.String()),
      folderIds: t.Optional(t.String()),
      favorites: t.Optional(t.String()),
    }),
  });
