import { Elysia } from 'elysia';
import { eq, and, asc, sql, max } from 'drizzle-orm';
import { FolderCreateInput, FolderPatchInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, galleryFolders, photos } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { parseBody } from '../../lib/validation';
import { newId } from '../../lib/ids';

// Admin folder CRUD. Folders group photos within a gallery; photos.folderId
// references these rows (ON DELETE SET NULL, so deleting a folder loosens its
// photos back to the gallery root rather than destroying them).
export const folderRoutes = new Elysia({ prefix: '/api/galleries/:galleryId/folders' })
  .use(authContext)

  // GET / — folders in the gallery with photo counts.
  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const rows = await db
      .select({
        id: galleryFolders.id,
        name: galleryFolders.name,
        position: galleryFolders.position,
        coverPhotoId: galleryFolders.coverPhotoId,
        photoCount: sql<number>`(SELECT COUNT(*) FROM photos WHERE photos.folder_id = ${galleryFolders.id})`.as('photoCount'),
      })
      .from(galleryFolders)
      .where(eq(galleryFolders.galleryId, gallery.id))
      .orderBy(asc(galleryFolders.position), asc(galleryFolders.name));

    return rows.map((r) => ({ ...r, photoCount: Number(r.photoCount) }));
  })

  // POST / — create a folder (appended after the last position).
  .post('/', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const parsed = parseBody(ctx, FolderCreateInput);
    if (!parsed.ok) return parsed.error;

    const last = await db
      .select({ m: max(galleryFolders.position) })
      .from(galleryFolders)
      .where(eq(galleryFolders.galleryId, gallery.id));
    const position = (last[0]?.m ?? -1) + 1;

    const id = newId();
    await db.insert(galleryFolders).values({ id, galleryId: gallery.id, name: parsed.data.name, position });
    return db.query.galleryFolders.findFirst({ where: eq(galleryFolders.id, id) });
  })

  // PATCH /:folderId — rename, reorder, or set folder cover.
  .patch('/:folderId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const existing = await db.query.galleryFolders.findFirst({
      where: and(eq(galleryFolders.id, ctx.params.folderId), eq(galleryFolders.galleryId, gallery.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'folder_not_found' }; }

    const parsed = parseBody(ctx, FolderPatchInput);
    if (!parsed.ok) return parsed.error;

    await db.update(galleryFolders).set(parsed.data).where(eq(galleryFolders.id, existing.id));
    return db.query.galleryFolders.findFirst({ where: eq(galleryFolders.id, existing.id) });
  })

  // DELETE /:folderId — photos in it fall back to the gallery root (FK SET NULL).
  .delete('/:folderId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const existing = await db.query.galleryFolders.findFirst({
      where: and(eq(galleryFolders.id, ctx.params.folderId), eq(galleryFolders.galleryId, gallery.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'folder_not_found' }; }

    // Defensive: also clear folderId on photos in case FK cascade is off.
    await db.update(photos).set({ folderId: null }).where(eq(photos.folderId, existing.id));
    await db.delete(galleryFolders).where(eq(galleryFolders.id, existing.id));
    return { ok: true };
  });
