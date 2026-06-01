import { Elysia, t } from 'elysia';
import { eq, and, asc } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { AttachmentPatchInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, attachments } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { uploadStream, deleteObject } from '../../services/storage';
import { parseBody } from '../../lib/validation';
import { env } from '../../lib/config';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

const MAX_BYTES = env.MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

function extOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) return '';
  return filename.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const attachmentRoutes = new Elysia({ prefix: '/api/galleries/:galleryId/attachments' })
  .use(authContext)

  // GET /api/galleries/:galleryId/attachments — admin list
  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const rows = await db.query.attachments.findMany({
      where: eq(attachments.galleryId, gallery.id),
      orderBy: [asc(attachments.position), asc(attachments.createdAt)],
    });
    return rows;
  })

  // POST /api/galleries/:galleryId/attachments — multipart upload, streamed to S3.
  // Accepts arbitrary file types; size capped by MAX_ATTACHMENT_SIZE_MB.
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

    const incoming = ctx.body.files;
    const files: File[] = Array.isArray(incoming) ? incoming : [incoming];

    const created: Array<typeof attachments.$inferSelect> = [];
    const rejected: Array<{ filename: string; reason: string }> = [];

    for (const file of files) {
      const filename = file.name || 'attachment';
      if (file.size > MAX_BYTES) {
        rejected.push({ filename, reason: 'too_large' });
        continue;
      }

      const id = newId();
      const ext = extOf(filename);
      const key = `attachments/${gallery.id}/${id}${ext ? '.' + ext : ''}`;
      const mime = file.type || 'application/octet-stream';

      try {
        // file.stream() is a Web ReadableStream; the lib-storage Upload accepts
        // it but the TS shapes don't line up cleanly across Bun/Node, so we
        // normalize through Readable.fromWeb to keep types honest.
        const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
        const bytes = await uploadStream(key, nodeStream, mime);

        await db.insert(attachments).values({
          id,
          galleryId: gallery.id,
          filenameOriginal: filename,
          s3Key: key,
          mimeType: mime,
          fileSize: bytes || file.size,
          createdAt: now(),
        });
        const row = await db.query.attachments.findFirst({ where: eq(attachments.id, id) });
        if (row) created.push(row);
        log.info('attachment.uploaded', { galleryId: gallery.id, id, filename, bytes: bytes || file.size });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('attachment.upload_failed', { filename, msg });
        rejected.push({ filename, reason: 'storage_error' });
      }
    }

    return { attachments: created, rejected };
  }, {
    body: t.Object({
      files: t.Union([t.File(), t.Array(t.File())]),
    }),
  })

  // PATCH /api/galleries/:galleryId/attachments/:attachmentId — rename/reorder/move
  .patch('/:attachmentId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const existing = await db.query.attachments.findFirst({
      where: and(eq(attachments.id, ctx.params.attachmentId), eq(attachments.galleryId, gallery.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'attachment_not_found' }; }

    const parsed = parseBody(ctx, AttachmentPatchInput);
    if (!parsed.ok) return parsed.error;

    await db.update(attachments).set(parsed.data).where(eq(attachments.id, existing.id));
    return db.query.attachments.findFirst({ where: eq(attachments.id, existing.id) });
  })

  // DELETE /api/galleries/:galleryId/attachments/:attachmentId
  .delete('/:attachmentId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const existing = await db.query.attachments.findFirst({
      where: and(eq(attachments.id, ctx.params.attachmentId), eq(attachments.galleryId, gallery.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'attachment_not_found' }; }

    await db.delete(attachments).where(eq(attachments.id, existing.id));
    // Best-effort S3 cleanup; the row is already gone.
    await deleteObject(existing.s3Key).catch((err) => {
      log.warn('attachment.s3_delete_failed', { key: existing.s3Key, err: String(err) });
    });
    return { ok: true };
  });
