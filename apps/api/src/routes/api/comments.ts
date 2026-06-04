import { Elysia, t } from 'elysia';
import { eq, and, desc } from 'drizzle-orm';
import { CommentInput, CommentModerationInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, files, comments, lists } from '../../db/schema';
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

  // POST /api/gallery/:slug/comments — authenticated client comment.
  //   scope 'set'              → public comment on the file, pending approval.
  //   scope 'list'/'favorites' → a PRIVATE note (one per author, by email),
  //                              upserted so editing replaces it; no approval.
  .post('/api/gallery/:slug/comments', async (ctx) => {
    const parsed = parseBody(ctx, CommentInput);
    if (!parsed.ok) return parsed.error;
    const { params, gallerySession, clientIp, set } = ctx;
    const input = parsed.data;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    if (gallery.allowComments !== 1) { set.status = 403; return { error: 'comments_disabled' }; }

    // Comments are a session-gated feature: the client must be identified.
    if (gallerySession?.galleryId !== gallery.id || !gallerySession.clientEmail) {
      set.status = 401; return { error: 'not_identified' };
    }
    const email = gallerySession.clientEmail;

    const file = await db.query.files.findFirst({ where: eq(files.id, input.fileId) });
    if (!file || file.galleryId !== gallery.id) {
      set.status = 404; return { error: 'file_not_found' };
    }
    const listId = input.scope === 'list' ? (input.listId ?? null) : null;
    if (input.scope === 'list') {
      const list = listId ? await db.query.lists.findFirst({ where: eq(lists.id, listId) }) : null;
      if (!list || list.galleryId !== gallery.id) { set.status = 404; return { error: 'list_not_found' }; }
    }

    if (!checkRateLimit('comment', `${gallery.id}:${clientIp ?? 'unknown'}`, 10, 15 * 60)) {
      set.status = 429; return { error: 'too_many_comments' };
    }

    // Private note: upsert (one per author/file/scope[/list]).
    if (input.scope !== 'set') {
      const existing = await db.query.comments.findFirst({
        where: and(
          eq(comments.galleryId, gallery.id),
          eq(comments.fileId, file.id),
          eq(comments.scope, input.scope),
          eq(comments.clientEmail, email),
          ...(listId ? [eq(comments.listId, listId)] : []),
        ),
      });
      if (existing) {
        await db.update(comments).set({ body: input.body }).where(eq(comments.id, existing.id));
        return { id: existing.id, status: 'saved', body: input.body, scope: input.scope };
      }
      const id = newId();
      await db.insert(comments).values({
        id, galleryId: gallery.id, fileId: file.id, scope: input.scope, listId,
        clientEmail: email, clientName: null, body: input.body, isApproved: 0, createdAt: now(),
      });
      return { id, status: 'saved', body: input.body, scope: input.scope };
    }

    // Public set-level comment: pending approval.
    const id = newId();
    await db.insert(comments).values({
      id, galleryId: gallery.id, fileId: file.id, scope: 'set', listId: null,
      clientEmail: email, clientName: null, body: input.body, isApproved: 0, createdAt: now(),
    });
    return { id, status: 'pending', body: input.body, scope: 'set' };
  })

  // GET /api/gallery/:slug/comments?fileId=&scope=&listId= — scope-aware:
  //   'set' → approved public comments for the file (visible to everyone).
  //   'list'/'favorites' → the caller's own private note (by session email).
  .get('/api/gallery/:slug/comments', async ({ params, query, gallerySession, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    if (gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
      set.status = 401; return { error: 'locked' };
    }

    const scope = query.scope ?? 'set';
    if (!query.fileId) return { comments: [] };

    if (scope === 'set') {
      const rows = await db.query.comments.findMany({
        where: and(
          eq(comments.galleryId, gallery.id),
          eq(comments.fileId, query.fileId),
          eq(comments.scope, 'set'),
          eq(comments.isApproved, 1),
        ),
        orderBy: [desc(comments.createdAt)],
      });
      return {
        comments: rows.map((c) => ({ id: c.id, body: c.body, author: c.clientEmail, createdAt: c.createdAt, mine: false })),
      };
    }

    // Private: only the author's own note(s), and only when identified.
    const email = gallerySession?.galleryId === gallery.id ? gallerySession.clientEmail : null;
    if (!email) return { comments: [] };
    const rows = await db.query.comments.findMany({
      where: and(
        eq(comments.galleryId, gallery.id),
        eq(comments.fileId, query.fileId),
        eq(comments.scope, scope),
        eq(comments.clientEmail, email),
        ...(query.listId ? [eq(comments.listId, query.listId)] : []),
      ),
      orderBy: [desc(comments.createdAt)],
    });
    return {
      comments: rows.map((c) => ({ id: c.id, body: c.body, author: null, createdAt: c.createdAt, mine: true })),
    };
  }, {
    query: t.Object({
      fileId: t.Optional(t.String()),
      scope: t.Optional(t.Union([t.Literal('set'), t.Literal('list'), t.Literal('favorites')])),
      listId: t.Optional(t.String()),
    }),
  })

  // DELETE /api/gallery/:slug/comments/:commentId — client removes their own
  // private note (public set-level comments are removed by the admin only).
  .delete('/api/gallery/:slug/comments/:commentId', async ({ params, gallerySession, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    const email = gallerySession?.galleryId === gallery.id ? gallerySession.clientEmail : null;
    if (!email) { set.status = 401; return { error: 'not_identified' }; }

    const existing = await db.query.comments.findFirst({
      where: and(eq(comments.id, params.commentId), eq(comments.galleryId, gallery.id)),
    });
    if (!existing || existing.clientEmail !== email || existing.scope === 'set') {
      set.status = 404; return { error: 'comment_not_found' };
    }
    await db.delete(comments).where(eq(comments.id, existing.id));
    return { ok: true };
  })

  // GET /api/galleries/:galleryId/comments — admin: every comment, with scope.
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
    const listRows = await db.query.lists.findMany({ where: eq(lists.galleryId, gallery.id) });
    const listName = new Map(listRows.map((l) => [l.id, l.name]));
    return rows.map((c) => ({
      id: c.id,
      fileId: c.fileId,
      clientName: c.clientName,
      clientEmail: c.clientEmail,
      body: c.body,
      isApproved: c.isApproved === 1,
      scope: c.scope,
      listName: c.listId ? (listName.get(c.listId) ?? null) : null,
      createdAt: c.createdAt,
    }));
  })

  // PATCH /api/galleries/:galleryId/comments/:commentId — admin approves/unapproves
  // a public (set-level) comment.
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

  // DELETE /api/galleries/:galleryId/comments/:commentId — admin removes any comment.
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
