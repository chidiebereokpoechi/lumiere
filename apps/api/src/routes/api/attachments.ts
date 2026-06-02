import { Elysia, t } from 'elysia';
import { eq, and, asc } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { AttachmentPatchInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, attachments, galleryFolders } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { clientIp } from '../../middleware/client-ip';
import { checkCsrf } from '../../middleware/csrf';
import { checkRateLimit } from '../../middleware/rate-limit';
import { uploadStream, deleteObject, presignDownload, presignGet } from '../../services/storage';
import { notifyPhotographer } from '../../services/notify';
import { ensureDefaultFolder } from '../../services/folders';
import { parseBody } from '../../lib/validation';
import { env } from '../../lib/config';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

function isExpired(g: typeof galleries.$inferSelect): boolean {
  if (!g.expiresAt) return false;
  const grace = (g.gracePeriodDays ?? 0) * 86_400;
  return g.expiresAt + grace < now();
}

function publicShape(row: typeof attachments.$inferSelect) {
  return {
    id: row.id,
    folderId: row.folderId,
    filename: row.displayName ?? row.filenameOriginal,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    description: row.description,
    position: row.position,
  };
}

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

    // Target folder: explicit ?folderId= (validated) or the gallery's default.
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
          folderId,
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
    query: t.Object({ folderId: t.Optional(t.String()) }),
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

// Client-facing routes — same prefix style as gallery.ts / favorites.ts /
// downloads.ts. Listed separately because Elysia's router rejects param-name
// collisions between trees, and these use `:slug` instead of `:galleryId`.
export const clientAttachmentRoutes = new Elysia()
  .use(authContext)
  .use(gallerySessionContext)
  .use(clientIp)

  // GET /api/gallery/:slug/attachments — public list (subject to gallery access).
  .get('/api/gallery/:slug/attachments', async ({ params, gallerySession, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    if (gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
      set.status = 401; return { error: 'locked' };
    }

    const rows = await db.query.attachments.findMany({
      where: eq(attachments.galleryId, gallery.id),
      orderBy: [asc(attachments.position), asc(attachments.createdAt)],
    });
    return { attachments: rows.map(publicShape) };
  })

  // GET /api/gallery/:slug/attachments/:attachmentId/download — 302 to a
  // short-lived presigned URL with attachment Content-Disposition.
  .get('/api/gallery/:slug/attachments/:attachmentId/download', async (ctx) => {
    const { params, gallerySession, currentPhotographer, clientIp, set } = ctx;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    const isOwner = currentPhotographer && gallery.photographerId === currentPhotographer.id;
    if (!isOwner) {
      if (gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
        set.status = 401; return { error: 'locked' };
      }
    }

    const att = await db.query.attachments.findFirst({
      where: and(eq(attachments.id, params.attachmentId), eq(attachments.galleryId, gallery.id)),
    });
    if (!att) { set.status = 404; return { error: 'attachment_not_found' }; }

    // Same rate-limit + email pattern as photo/zip downloads, scoped to a
    // separate bucket so attachment fetches don't crowd out photo downloads.
    if (!isOwner && checkRateLimit(
      'email:download', `${gallery.id}:${clientIp ?? 'unknown'}`, 1, 3600,
    )) {
      await notifyPhotographer(gallery.id, 'download', {
        isZip: false,
        clientName: gallery.clientName ?? null,
        filename: att.displayName ?? att.filenameOriginal,
      });
    }

    const url = await presignDownload(att.s3Key, att.displayName ?? att.filenameOriginal);
    log.info('attachment.download', { galleryId: gallery.id, attachmentId: att.id });
    set.status = 302;
    set.headers['location'] = url;
    return '';
  })

  // GET /api/gallery/:slug/attachments/:attachmentId/stream — 302 to a presigned
  // URL WITHOUT an attachment disposition, for inline <video>/<audio> playback.
  // The presigned S3 URL supports Range requests natively, so seeking works.
  .get('/api/gallery/:slug/attachments/:attachmentId/stream', async (ctx) => {
    const { params, gallerySession, currentPhotographer, set } = ctx;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    const isOwner = currentPhotographer && gallery.photographerId === currentPhotographer.id;
    if (!isOwner && gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
      set.status = 401; return { error: 'locked' };
    }

    const att = await db.query.attachments.findFirst({
      where: and(eq(attachments.id, params.attachmentId), eq(attachments.galleryId, gallery.id)),
    });
    if (!att) { set.status = 404; return { error: 'attachment_not_found' }; }

    // Long TTL so seeking/playing a long clip doesn't 403 when the URL expires
    // mid-stream. Browsers issue fresh Range requests against the same URL.
    const url = await presignGet(att.s3Key, 6 * 3600);
    set.status = 302;
    set.headers['location'] = url;
    return '';
  });
