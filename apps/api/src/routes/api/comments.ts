import { Elysia, t } from 'elysia';
import { eq, and, desc } from 'drizzle-orm';
import { CommentInput, CommentModerationInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, files, comments } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { clientIp } from '../../middleware/client-ip';
import { checkCsrf } from '../../middleware/csrf';
import { checkRateLimit } from '../../middleware/rate-limit';
import { parseBody } from '../../lib/validation';
import { newId, now } from '../../lib/ids';

function isExpired(g: typeof galleries.$inferSelect): boolean {
  if (!g.expiresAt) return false;
  const grace = (g.gracePeriodDays ?? 0) * 86_400;
  return g.expiresAt + grace < now();
}

export const commentRoutes = new Elysia()
  .use(gallerySessionContext)
  .use(authContext)
  .use(clientIp)

  // POST /api/gallery/:slug/comments — client submits a comment. Lands as
  // is_approved=0; photographer must approve before it's visible to others.
  .post('/api/gallery/:slug/comments', async (ctx) => {
    const parsed = parseBody(ctx, CommentInput);
    if (!parsed.ok) return parsed.error;
    const { params, gallerySession, clientIp, set } = ctx;
    const input = parsed.data;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    if (gallery.allowComments !== 1) { set.status = 403; return { error: 'comments_disabled' }; }
    if (gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
      set.status = 401; return { error: 'locked' };
    }

    // Validate photo ownership when commenting on a specific photo.
    if (input.fileId) {
      const file = await db.query.files.findFirst({ where: eq(files.id, input.fileId) });
      if (!file || file.galleryId !== gallery.id) {
        set.status = 404; return { error: 'file_not_found' };
      }
    }

    if (!checkRateLimit('comment', `${gallery.id}:${clientIp ?? 'unknown'}`, 5, 15 * 60)) {
      set.status = 429; return { error: 'too_many_comments' };
    }

    const id = newId();
    await db.insert(comments).values({
      id,
      galleryId: gallery.id,
      fileId: input.fileId ?? null,
      clientName: input.clientName ?? null,
      clientEmail: input.clientEmail ?? null,
      body: input.body,
      isApproved: 0,
      createdAt: now(),
    });
    // Don't leak server-side metadata back; return enough for optimistic UI.
    return { id, status: 'pending', body: input.body, fileId: input.fileId ?? null };
  })

  // GET /api/gallery/:slug/comments?photoId=... — only approved comments are
  // visible publicly. Drops a session check: even unauthenticated visitors of
  // a public gallery can see approved comments.
  .get('/api/gallery/:slug/comments', async ({ params, query, gallerySession, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    if (gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
      set.status = 401; return { error: 'locked' };
    }

    const photoFilter = query.fileId ? and(eq(comments.fileId, query.fileId), eq(comments.galleryId, gallery.id))
                                       : eq(comments.galleryId, gallery.id);
    const rows = await db.query.comments.findMany({
      where: and(photoFilter, eq(comments.isApproved, 1)),
      orderBy: [desc(comments.createdAt)],
    });
    return {
      comments: rows.map((c) => ({
        id: c.id,
        fileId: c.fileId,
        clientName: c.clientName,
        body: c.body,
        createdAt: c.createdAt,
      })),
    };
  }, {
    query: t.Object({ fileId: t.Optional(t.String()) }),
  })

  // GET /api/galleries/:galleryId/comments — admin: every comment for the
  // gallery, pending and approved, newest first.
  .get('/api/galleries/:galleryId/comments', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'not_found' }; }

    const rows = await db.query.comments.findMany({
      where: eq(comments.galleryId, gallery.id),
      orderBy: [desc(comments.createdAt)],
    });
    return rows.map((c) => ({
      id: c.id,
      fileId: c.fileId,
      clientName: c.clientName,
      clientEmail: c.clientEmail,
      body: c.body,
      isApproved: c.isApproved === 1,
      createdAt: c.createdAt,
    }));
  })

  // PATCH /api/galleries/:galleryId/comments/:commentId — admin approves
  // (or unapproves) a comment so it becomes visible (or hidden) publicly.
  .patch('/api/galleries/:galleryId/comments/:commentId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'not_found' }; }

    const existing = await db.query.comments.findFirst({
      where: and(eq(comments.id, ctx.params.commentId), eq(comments.galleryId, gallery.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'comment_not_found' }; }

    const parsed = parseBody(ctx, CommentModerationInput);
    if (!parsed.ok) return parsed.error;

    await db.update(comments)
      .set({ isApproved: parsed.data.isApproved ? 1 : 0 })
      .where(eq(comments.id, existing.id));
    return { id: existing.id, isApproved: parsed.data.isApproved };
  })

  // DELETE /api/galleries/:galleryId/comments/:commentId — admin removes a
  // comment outright (spam, etc.).
  .delete('/api/galleries/:galleryId/comments/:commentId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'not_found' }; }

    const existing = await db.query.comments.findFirst({
      where: and(eq(comments.id, ctx.params.commentId), eq(comments.galleryId, gallery.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'comment_not_found' }; }

    await db.delete(comments).where(eq(comments.id, existing.id));
    return { ok: true };
  });
