import { Elysia, t } from 'elysia';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { PhotoMoveInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, galleryFolders, photos } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { uploadObject } from '../../services/storage';
import { enqueue } from '../../services/queue';
import { emit, trackBatch } from '../../services/events';
import { detectImageMime, extForMime } from '../../lib/mime';
import { parseBody } from '../../lib/validation';
import { env } from '../../lib/config';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

const MAX_BYTES = env.NODE_ENV === 'production'
  ? Number(process.env.MAX_UPLOAD_SIZE_MB ?? 80) * 1024 * 1024
  : 100 * 1024 * 1024;

export const photoRoutes = new Elysia({ prefix: '/api/galleries/:galleryId/photos' })
  .use(authContext)

  // GET /api/galleries/:galleryId/photos — list photos in the gallery
  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) {
      ctx.set.status = 404;
      return { error: 'gallery_not_found' };
    }

    const rows = await db.query.photos.findMany({
      where: eq(photos.galleryId, gallery.id),
      orderBy: [asc(photos.position), asc(photos.createdAt)],
    });
    return rows;
  })

  // POST /api/galleries/:galleryId/photos — multipart upload, enqueues processing jobs
  .post('/', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) {
      ctx.set.status = 404;
      return { error: 'gallery_not_found' };
    }

    // Elysia parses multipart for us; `files` is a File | File[] depending on count.
    const incoming = ctx.body.files;
    const files: File[] = Array.isArray(incoming) ? incoming : [incoming];

    const batchId = newId();
    const photoIds: string[] = [];
    const accepted: { photoId: string; filename: string; mime: 'image/jpeg' | 'image/png' | 'image/webp'; bytes: Uint8Array }[] = [];
    const rejections: { filename: string; reason: string }[] = [];

    for (const file of files) {
      const filename = file.name || 'upload';
      if (file.size > MAX_BYTES) {
        rejections.push({ filename, reason: 'too_large' });
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = detectImageMime(bytes);
      if (!mime) {
        rejections.push({ filename, reason: 'invalid_mime' });
        continue;
      }

      const photoId = newId();
      photoIds.push(photoId);
      accepted.push({ photoId, filename, mime, bytes });

      await db.insert(photos).values({
        id: photoId,
        galleryId: gallery.id,
        filenameOriginal: filename,
        mimeType: mime,
        fileSize: bytes.byteLength,
        uploadStatus: 'processing',
        createdAt: now(),
      });
    }

    // Tell the event bus how many per-photo terminal events to expect for
    // this batch BEFORE emitting anything — rejection errors count too.
    trackBatch(batchId, accepted.length + rejections.length);

    for (const r of rejections) {
      emit(batchId, { type: 'error', filename: r.filename, reason: r.reason });
    }
    for (const a of accepted) {
      emit(batchId, { type: 'queued', photoId: a.photoId, filename: a.filename });
    }

    // Write originals to S3 inline so the response only returns after the
    // bytes are persisted — the worker will read them back to process.
    for (const a of accepted) {
      const key = `originals/${gallery.id}/${a.photoId}.${extForMime(a.mime)}`;
      try {
        await uploadObject(key, Buffer.from(a.bytes), a.mime);
        await db.update(photos).set({ s3KeyOriginal: key }).where(eq(photos.id, a.photoId));
        await enqueue('process_photo', {
          photoId: a.photoId,
          galleryId: gallery.id,
          batchId,
          s3KeyOriginal: key,
          filename: a.filename,
        }, gallery.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('upload_original_failed', { photoId: a.photoId, msg });
        await db.update(photos).set({ uploadStatus: 'error', errorMessage: msg }).where(eq(photos.id, a.photoId));
        emit(batchId, { type: 'error', photoId: a.photoId, filename: a.filename, reason: 'storage_error' });
      }
    }

    return { batchId, photoIds };
  }, {
    body: t.Object({
      files: t.Union([
        t.File(),
        t.Array(t.File()),
      ]),
    }),
  })

  // POST /api/galleries/:galleryId/photos/move — bulk-assign photos to a folder
  // (folderId null moves them back to the gallery root).
  .post('/move', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const parsed = parseBody(ctx, PhotoMoveInput);
    if (!parsed.ok) return parsed.error;
    const { photoIds, folderId } = parsed.data;

    // A non-null target folder must belong to this gallery.
    if (folderId !== null) {
      const folder = await db.query.galleryFolders.findFirst({
        where: and(eq(galleryFolders.id, folderId), eq(galleryFolders.galleryId, gallery.id)),
      });
      if (!folder) { ctx.set.status = 404; return { error: 'folder_not_found' }; }
    }

    // Scope the update to photos that actually belong to this gallery.
    await db.update(photos)
      .set({ folderId })
      .where(and(eq(photos.galleryId, gallery.id), inArray(photos.id, photoIds)));

    return { ok: true, moved: photoIds.length };
  })

  // DELETE /api/galleries/:galleryId/photos/:photoId
  .delete('/:photoId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const photo = await db.query.photos.findFirst({ where: eq(photos.id, ctx.params.photoId) });
    if (!photo || photo.galleryId !== ctx.params.galleryId) {
      ctx.set.status = 404;
      return { error: 'photo_not_found' };
    }
    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, photo.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) {
      ctx.set.status = 404;
      return { error: 'gallery_not_found' };
    }

    await db.delete(photos).where(eq(photos.id, photo.id));
    // S3 cleanup is best-effort; deletePrefix on the whole gallery happens at gallery delete.
    return { ok: true };
  });
