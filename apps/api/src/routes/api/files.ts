import { Elysia, t } from 'elysia';
import { eq, and, asc, ne, inArray, max } from 'drizzle-orm';
import { Readable } from 'node:stream';
import {
  FileMoveInput, FileReorderInput, FilePatchInput,
  UploadInitInput, PartUrlsInput, UploadCompleteInput, UploadAbortInput,
} from '@lumiere/types';
import { db } from '../../db';
import { galleries, galleryFolders, files } from '../../db/schema';
import type { FileType } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import {
  uploadObject, uploadStream, deleteObject,
  createMultipartUpload, presignUploadPart, completeMultipartUpload, abortMultipartUpload,
} from '../../services/storage';
import { enqueue } from '../../services/queue';
import { emit, trackBatch } from '../../services/events';
import { ensureDefaultFolder } from '../../services/folders';
import { detectImageMime, extForMime, type SupportedMime } from '../../lib/mime';
import { parseBody } from '../../lib/validation';
import { env } from '../../lib/config';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

const MAX_IMAGE_BYTES = (env.NODE_ENV === 'production' ? Number(process.env.MAX_UPLOAD_SIZE_MB ?? 80) : 100) * 1024 * 1024;
const MAX_FILE_BYTES = env.MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

function kindForMime(mime: string | null): FileType {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'file';
}

const MIN_PART = 64 * 1024 * 1024; // 64 MiB
const MAX_PARTS = 9000;            // headroom under S3's 10,000 cap
function partSizeFor(total: number): number {
  return Math.max(MIN_PART, Math.ceil(total / MAX_PARTS / MIN_PART) * MIN_PART);
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

// Next free position in a folder, so new uploads append at the end in upload
// order (rather than all defaulting to 0 and shuffling to the front).
async function nextPosition(galleryId: string, folderId: string): Promise<number> {
  const rows = await db
    .select({ m: max(files.position) })
    .from(files)
    .where(and(eq(files.galleryId, galleryId), eq(files.folderId, folderId)));
  return (rows[0]?.m ?? -1) + 1;
}

export const fileRoutes = new Elysia({ prefix: '/api/galleries/:galleryId/files' })
  .use(authContext)

  // GET / — all files in the gallery (any type).
  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }
    // Exclude rows still mid multipart upload — the client tracks those itself.
    return db.query.files.findMany({
      where: and(eq(files.galleryId, gallery.id), ne(files.uploadStatus, 'uploading')),
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
    // Append in upload order: each accepted file takes the next position.
    let pos = await nextPosition(gallery.id, folderId);
    const fileIds: string[] = [];
    const rejections: { filename: string; reason: string }[] = [];
    const images: { fileId: string; filename: string; mime: SupportedMime; bytes: Uint8Array }[] = [];
    const others: { fileId: string; filename: string; file: File; position: number }[] = [];

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
          uploadStatus: 'processing', position: pos++, createdAt: now(),
        });
      } else {
        if (file.size > MAX_FILE_BYTES) { rejections.push({ filename, reason: 'too_large' }); continue; }
        fileIds.push(fileId);
        others.push({ fileId, filename, file, position: pos++ });
      }
    }

    // Total terminal events the batch will emit (images settle via processing;
    // non-images settle here; rejections are errors).
    trackBatch(batchId, images.length + others.length + rejections.length);
    for (const r of rejections) emit(batchId, { type: 'error', filename: r.filename, reason: r.reason });
    for (const a of images) emit(batchId, { type: 'queued', photoId: a.fileId, filename: a.filename });

    // Images: store original, enqueue processing. GIFs skip Sharp (it would
    // flatten the animation) — the original is served as its own thumb/preview.
    for (const a of images) {
      const key = `originals/${gallery.id}/${a.fileId}.${extForMime(a.mime)}`;
      try {
        await uploadObject(key, Buffer.from(a.bytes), a.mime);
        if (a.mime === 'image/gif') {
          await db.update(files).set({ s3KeyOriginal: key, s3KeyThumbnail: key, s3KeyPreview: key, uploadStatus: 'ready' }).where(eq(files.id, a.fileId));
          emit(batchId, { type: 'ready', photoId: a.fileId, filename: a.filename });
          continue;
        }
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
          s3KeyOriginal: key, uploadStatus: 'ready', position: o.position, createdAt: now(),
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

  // POST /upload/init — begin a multipart direct-to-storage upload. Browser
  // PUTs parts straight to RustFS; we only broker create/sign/complete/abort.
  .post('/upload/init', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const parsed = parseBody(ctx, UploadInitInput);
    if (!parsed.ok) return parsed.error;
    const { filename, mimeType, size } = parsed.data;

    let folderId = parsed.data.folderId ?? null;
    if (folderId) {
      const folder = await db.query.galleryFolders.findFirst({
        where: and(eq(galleryFolders.id, folderId), eq(galleryFolders.galleryId, gallery.id)),
      });
      if (!folder) { ctx.set.status = 404; return { error: 'folder_not_found' }; }
    } else {
      folderId = await ensureDefaultFolder(gallery.id);
    }

    const mime = mimeType || 'application/octet-stream';
    const type = kindForMime(mime);
    const fileId = newId();
    const ext = type === 'image' ? extForMime(mime as SupportedMime) : extOf(filename);
    const key = type === 'image'
      ? `originals/${gallery.id}/${fileId}.${ext || 'bin'}`
      : `files/${gallery.id}/${fileId}${ext ? '.' + ext : ''}`;

    const uploadId = await createMultipartUpload(key, mime);
    await db.insert(files).values({
      id: fileId, galleryId: gallery.id, folderId, type,
      filenameOriginal: filename, mimeType: mime, fileSize: size,
      s3KeyOriginal: key, s3UploadId: uploadId, uploadStatus: 'uploading',
      position: await nextPosition(gallery.id, folderId), createdAt: now(),
    });

    return { fileId, key, uploadId, partSize: partSizeFor(size) };
  })

  // POST /upload/part-urls — presign a batch of part PUT URLs.
  .post('/upload/part-urls', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const parsed = parseBody(ctx, PartUrlsInput);
    if (!parsed.ok) return parsed.error;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, parsed.data.fileId), eq(files.galleryId, gallery.id)),
    });
    if (!file || !file.s3UploadId || !file.s3KeyOriginal) {
      ctx.set.status = 404; return { error: 'upload_not_found' };
    }
    const urls = await Promise.all(parsed.data.partNumbers.map(async (n) => ({
      partNumber: n,
      url: await presignUploadPart(file.s3KeyOriginal!, file.s3UploadId!, n),
    })));
    return { urls };
  })

  // POST /upload/complete — finalize the multipart upload.
  .post('/upload/complete', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const parsed = parseBody(ctx, UploadCompleteInput);
    if (!parsed.ok) return parsed.error;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, parsed.data.fileId), eq(files.galleryId, gallery.id)),
    });
    if (!file || !file.s3UploadId || !file.s3KeyOriginal) {
      ctx.set.status = 404; return { error: 'upload_not_found' };
    }

    try {
      await completeMultipartUpload(file.s3KeyOriginal, file.s3UploadId, parsed.data.parts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('upload.complete_failed', { fileId: file.id, msg });
      ctx.set.status = 502; return { error: 'complete_failed' };
    }

    if (file.type === 'image' && file.mimeType !== 'image/gif') {
      await db.update(files).set({ uploadStatus: 'processing', s3UploadId: null }).where(eq(files.id, file.id));
      await enqueue('process_photo', {
        photoId: file.id, galleryId: gallery.id, batchId: newId(),
        s3KeyOriginal: file.s3KeyOriginal, filename: file.filenameOriginal,
      }, gallery.id);
    } else if (file.type === 'image') {
      // GIF: serve the original as its own derivatives (no Sharp flattening).
      await db.update(files).set({ s3KeyThumbnail: file.s3KeyOriginal, s3KeyPreview: file.s3KeyOriginal, uploadStatus: 'ready', s3UploadId: null }).where(eq(files.id, file.id));
    } else {
      await db.update(files).set({ uploadStatus: 'ready', s3UploadId: null }).where(eq(files.id, file.id));
    }
    return { ok: true, fileId: file.id, type: file.type };
  })

  // POST /upload/abort — cancel an in-flight upload and drop the row.
  .post('/upload/abort', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const gallery = await ownedGallery(ctx.params.galleryId, ctx.currentPhotographer!.id);
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const parsed = parseBody(ctx, UploadAbortInput);
    if (!parsed.ok) return parsed.error;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, parsed.data.fileId), eq(files.galleryId, gallery.id)),
    });
    if (!file) return { ok: true };
    if (file.s3UploadId && file.s3KeyOriginal) {
      await abortMultipartUpload(file.s3KeyOriginal, file.s3UploadId).catch(() => { /* best-effort */ });
    }
    await db.delete(files).where(eq(files.id, file.id));
    return { ok: true };
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
