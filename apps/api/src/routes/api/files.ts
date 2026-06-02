import { Elysia, t } from 'elysia';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { FileMoveInput, FileReorderInput, FilePatchInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, galleryFolders, files } from '../../db/schema';
import type { FileType } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { uploadObject, uploadStream, deleteObject } from '../../services/storage';
import { enqueue } from '../../services/queue';
import { emit, trackBatch } from '../../services/events';
import { ensureDefaultFolder } from '../../services/folders';
import { detectImageMime, extForMime } from '../../lib/mime';
import { parseBody } from '../../lib/validation';
import { env } from '../../lib/config';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

const MAX_IMAGE_BYTES = (env.NODE_ENV === 'production' ? Number(process.env.MAX_UPLOAD_SIZE_MB ?? 80) : 100) * 1024 * 1024;
const MAX_FILE_BYTES = env.MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

function kindForMime(mime: string | null): FileType {
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'file';
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i <= 0 || i === filename.length - 1) return '';
  return filename.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function ownedGallery(galleryId: string, photographerId: string) {
  return db.query.galleries.findFirst({
    where: and(eq(galleries.id, galleryId), eq(galleries.photographerId, photographerId)),
  });
}

export const fileRoutes = new Elysia({ prefix: '/api/galleries/:galleryId/files' })
  .use(authContext)

  // GET / — all files in the gallery (any type).
  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }
    return db.query.files.findMany({
      where: eq(files.galleryId, gallery.id),
      orderBy: [asc(files.position), asc(files.createdAt)],
    });
  })

  // POST /?folderId= — multipart upload of any media. Images go through the
  // Sharp pipeline (type=image, processing); everything else is stored as-is
  // (type video/audio/file, ready immediately).
  .post('/', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    let folderId = ctx.query.folderId ?? null;
    if (folderId) {
      const folder = await db.query.galleryFolders.findFirst({
        where: and(eq(galleryFolders.id, folderId), eq(galleryFolders.galleryId, gallery.id)),
      });
      if (!folder) { ctx.set.status = 404; return { error: 'folder_not_found' }; }
    } else {
      folderId = await ensureDefaultFolder(gallery.id);
    }

    const incoming = ctx.body.files;
    const list: File[] = Array.isArray(incoming) ? incoming : [incoming];

    const batchId = newId();
    const fileIds: string[] = [];
    const rejections: { filename: string; reason: string }[] = [];
    const images: { fileId: string; filename: string; mime: 'image/jpeg' | 'image/png' | 'image/webp'; bytes: Uint8Array }[] = [];
    const others: { fileId: string; filename: string; file: File }[] = [];

    for (const file of list) {
      const filename = file.name || 'upload';
      // Peek the magic bytes to classify without buffering large videos.
      // (Bun's File has .slice at runtime; the bundled types don't expose it.)
      const head = new Uint8Array(await (file as unknown as { slice(s: number, e: number): Blob }).slice(0, 16).arrayBuffer());
      const imgMime = detectImageMime(head);
      const fileId = newId();

      if (imgMime) {
        if (file.size > MAX_IMAGE_BYTES) { rejections.push({ filename, reason: 'too_large' }); continue; }
        const bytes = new Uint8Array(await file.arrayBuffer());
        fileIds.push(fileId);
        images.push({ fileId, filename, mime: imgMime, bytes });
        await db.insert(files).values({
          id: fileId, galleryId: gallery.id, folderId, type: 'image',
          filenameOriginal: filename, mimeType: imgMime, fileSize: bytes.byteLength,
          uploadStatus: 'processing', createdAt: now(),
        });
      } else {
        if (file.size > MAX_FILE_BYTES) { rejections.push({ filename, reason: 'too_large' }); continue; }
        fileIds.push(fileId);
        others.push({ fileId, filename, file });
      }
    }

    // Total terminal events the batch will emit (images settle via processing;
    // non-images settle here; rejections are errors).
    trackBatch(batchId, images.length + others.length + rejections.length);
    for (const r of rejections) emit(batchId, { type: 'error', filename: r.filename, reason: r.reason });
    for (const a of images) emit(batchId, { type: 'queued', photoId: a.fileId, filename: a.filename });

    // Images: store original, enqueue processing.
    for (const a of images) {
      const key = `originals/${gallery.id}/${a.fileId}.${extForMime(a.mime)}`;
      try {
        await uploadObject(key, Buffer.from(a.bytes), a.mime);
        await db.update(files).set({ s3KeyOriginal: key }).where(eq(files.id, a.fileId));
        await enqueue('process_photo', {
          photoId: a.fileId, galleryId: gallery.id, batchId, s3KeyOriginal: key, filename: a.filename,
        }, gallery.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('file.image_upload_failed', { fileId: a.fileId, msg });
        await db.update(files).set({ uploadStatus: 'error', errorMessage: msg }).where(eq(files.id, a.fileId));
        emit(batchId, { type: 'error', photoId: a.fileId, filename: a.filename, reason: 'storage_error' });
      }
    }

    // Non-images: stream to S3, ready immediately.
    for (const o of others) {
      const mime = o.file.type || 'application/octet-stream';
      const ext = extOf(o.filename);
      const key = `files/${gallery.id}/${o.fileId}${ext ? '.' + ext : ''}`;
      try {
        const nodeStream = Readable.fromWeb(o.file.stream() as Parameters<typeof Readable.fromWeb>[0]);
        const bytes = await uploadStream(key, nodeStream, mime);
        await db.insert(files).values({
          id: o.fileId, galleryId: gallery.id, folderId, type: kindForMime(mime),
          filenameOriginal: o.filename, mimeType: mime, fileSize: bytes || o.file.size,
          s3KeyOriginal: key, uploadStatus: 'ready', createdAt: now(),
        });
        emit(batchId, { type: 'ready', photoId: o.fileId, filename: o.filename });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('file.upload_failed', { fileId: o.fileId, msg });
        emit(batchId, { type: 'error', photoId: o.fileId, filename: o.filename, reason: 'storage_error' });
      }
    }

    return { batchId, fileIds };
  }, {
    query: t.Object({ folderId: t.Optional(t.String()) }),
    body: t.Object({ files: t.Union([t.File(), t.Array(t.File())]) }),
  })

  // POST /move — bulk-assign files to a folder.
  .post('/move', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const parsed = parseBody(ctx, FileMoveInput);
    if (!parsed.ok) return parsed.error;
    const folder = await db.query.galleryFolders.findFirst({
      where: and(eq(galleryFolders.id, parsed.data.folderId), eq(galleryFolders.galleryId, gallery.id)),
    });
    if (!folder) { ctx.set.status = 404; return { error: 'folder_not_found' }; }

    await db.update(files).set({ folderId: parsed.data.folderId })
      .where(and(eq(files.galleryId, gallery.id), inArray(files.id, parsed.data.fileIds)));
    return { ok: true, moved: parsed.data.fileIds.length };
  })

  // POST /reorder — position becomes each id's index in the array.
  .post('/reorder', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const parsed = parseBody(ctx, FileReorderInput);
    if (!parsed.ok) return parsed.error;
    db.transaction((tx) => {
      parsed.data.fileIds.forEach((id, i) => {
        tx.update(files).set({ position: i })
          .where(and(eq(files.id, id), eq(files.galleryId, gallery.id))).run();
      });
    });
    return { ok: true, count: parsed.data.fileIds.length };
  })

  // PATCH /:fileId — rename / describe / move.
  .patch('/:fileId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const existing = await db.query.files.findFirst({
      where: and(eq(files.id, ctx.params.fileId), eq(files.galleryId, gallery.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'file_not_found' }; }

    const parsed = parseBody(ctx, FilePatchInput);
    if (!parsed.ok) return parsed.error;
    await db.update(files).set(parsed.data).where(eq(files.id, existing.id));
    return db.query.files.findFirst({ where: eq(files.id, existing.id) });
  })

  // DELETE /:fileId
  .delete('/:fileId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, ctx.params.fileId), eq(files.galleryId, gallery.id)),
    });
    if (!file) { ctx.set.status = 404; return { error: 'file_not_found' }; }

    // Best-effort S3 cleanup of all derivatives.
    for (const k of [file.s3KeyOriginal, file.s3KeyPreview, file.s3KeyThumbnail, file.s3KeyWatermarked]) {
      if (k) await deleteObject(k).catch(() => { /* best-effort */ });
    }
    await db.delete(files).where(eq(files.id, file.id));
    return { ok: true };
  });
