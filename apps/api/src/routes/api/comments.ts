import { Elysia, t } from 'elysia';
import { eq, and, desc } from 'drizzle-orm';
import { CommentInput, CommentModerationInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, photos, comments } from '../../db/schema';
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
    if (input.photoId) {
      const photo = await db.query.photos.findFirst({ where: eq(photos.id, input.photoId) });
      if (!photo || photo.galleryId !== gallery.id) {
        set.status = 404; return { error: 'photo_not_found' };
      }
    }

    if (!checkRateLimit('comment', `${gallery.id}:${clientIp ?? 'unknown'}`, 5, 15 * 60)) {
      set.status = 429; return { error: 'too_many_comments' };
    }

    const id = newId();
    await db.insert(comments).values({
      id,
      galleryId: gallery.id,
      photoId: input.photoId ?? null,
      clientName: input.clientName ?? null,
      clientEmail: input.clientEmail ?? null,
      body: input.body,
      isApproved: 0,
      createdAt: now(),
    });
    // Don't leak server-side metadata back; return enough for optimistic UI.
    return { id, status: 'pending', body: input.body, photoId: input.photoId ?? null };
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

    const photoFilter = query.photoId ? and(eq(comments.photoId, query.photoId), eq(comments.galleryId, gallery.id))
                                       : eq(comments.galleryId, gallery.id);
    const rows = await db.query.comments.findMany({
      where: and(photoFilter, eq(comments.isApproved, 1)),
      orderBy: [desc(comments.createdAt)],
    });
    return {
      comments: rows.map((c) => ({
        id: c.id,
        photoId: c.photoId,
        clientName: c.clientName,
        body: c.body,
        createdAt: c.createdAt,
      })),
    };
  }, {
    query: t.Object({ photoId: t.Optional(t.String()) }),
  });
