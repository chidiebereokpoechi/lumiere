import { Elysia } from 'elysia';
import { eq, and, sql } from 'drizzle-orm';
import { FavoriteInput, UnfavoriteInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, files, favorites } from '../../db/schema';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { clientIp } from '../../middleware/client-ip';
import { checkRateLimit } from '../../middleware/rate-limit';
import { createGallerySession, GALLERY_SESSION_COOKIE } from '../../services/gallery-session';
import { notifyPhotographer } from '../../services/notify';
import { parseBody } from '../../lib/validation';
import { env } from '../../lib/config';
import { newId, now } from '../../lib/ids';

interface CookieJar {
  [name: string]: { set: (opts: Record<string, unknown>) => void } | undefined;
}

/**
 * Resolves the session token to use for keying favorites. Password galleries
 * must already have an active session; public galleries get a guest session
 * auto-issued so favorites can be tied to a persistent cookie.
 */
function resolveSessionToken(
  gallery: typeof galleries.$inferSelect,
  session: { token: string; galleryId: string } | null,
  clientIp: string | undefined,
  cookie: CookieJar,
): { ok: true; token: string } | { ok: false; status: number; error: string } {
  if (session?.galleryId === gallery.id) return { ok: true, token: session.token };
  if (gallery.passwordHash) return { ok: false, status: 401, error: 'locked' };

  const issued = createGallerySession(gallery.id, clientIp);
  cookie[GALLERY_SESSION_COOKIE]!.set({
    value: issued.token,
    httpOnly: true,
    sameSite: 'lax',
    secure: env.IS_PROD,
    path: '/',
    maxAge: issued.expiresAt - now(),
  });
  return { ok: true, token: issued.token };
}

function isExpired(g: typeof galleries.$inferSelect): boolean {
  if (!g.expiresAt) return false;
  const grace = (g.gracePeriodDays ?? 0) * 86_400;
  return g.expiresAt + grace < now();
}

export const favoriteRoutes = new Elysia({ prefix: '/api/gallery' })
  .use(gallerySessionContext)
  .use(clientIp)

  // GET /api/gallery/:slug/favorites — favorites for the current session
  .get('/:slug/favorites', async ({ params, gallerySession, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    if (gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
      set.status = 401; return { error: 'locked' };
    }
    if (!gallerySession) return { favorites: [] };

    const rows = await db.query.favorites.findMany({
      where: and(eq(favorites.galleryId, gallery.id), eq(favorites.sessionToken, gallerySession.token)),
    });
    return {
      favorites: rows.map((f) => ({ fileId: f.fileId, note: f.note, createdAt: f.createdAt })),
    };
  })

  // POST /api/gallery/:slug/favorite — add or update a favorite (idempotent)
  .post('/:slug/favorite', async (ctx) => {
    const parsed = parseBody(ctx, FavoriteInput);
    if (!parsed.ok) return parsed.error;
    const input = parsed.data;
    const { params, gallerySession, clientIp, cookie, set } = ctx;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    if (gallery.allowFavorites !== 1) { set.status = 403; return { error: 'favorites_disabled' }; }

    const file = await db.query.files.findFirst({ where: eq(files.id, input.fileId) });
    if (!file || file.galleryId !== gallery.id) { set.status = 404; return { error: 'file_not_found' }; }

    const tokenResult = resolveSessionToken(gallery, gallerySession, clientIp, cookie);
    if (!tokenResult.ok) { set.status = tokenResult.status; return { error: tokenResult.error }; }
    const token = tokenResult.token;

    const existing = await db.query.favorites.findFirst({
      where: and(
        eq(favorites.galleryId, gallery.id),
        eq(favorites.fileId, input.fileId),
        eq(favorites.sessionToken, token),
      ),
    });
    if (existing) {
      if (input.note !== undefined) {
        await db.update(favorites).set({ note: input.note }).where(eq(favorites.id, existing.id));
      }
      return { ok: true, favorited: true };
    }

    await db.insert(favorites).values({
      id: newId(),
      galleryId: gallery.id,
      fileId: input.fileId,
      sessionToken: token,
      clientEmail: input.clientEmail ?? null,
      note: input.note ?? null,
      createdAt: now(),
    });

    // Notify the photographer at most once per hour per gallery — clients add
    // favorites in clusters, so a single email per browsing session is the
    // useful summary, not one ping per click.
    if (checkRateLimit('email:favorites', gallery.id, 1, 3600)) {
      const total = await db.select({ c: sql<number>`COUNT(*)` })
        .from(favorites).where(eq(favorites.galleryId, gallery.id));
      await notifyPhotographer(gallery.id, 'favorites_received', {
        favoriteCount: Number(total[0]?.c ?? 0),
        one: Number(total[0]?.c ?? 0) === 1,
        clientName: gallery.clientName ?? null,
      });
    }

    return { ok: true, favorited: true };
  })

  // DELETE /api/gallery/:slug/favorite — remove a favorite for the current session
  .delete('/:slug/favorite', async (ctx) => {
    const parsed = parseBody(ctx, UnfavoriteInput);
    if (!parsed.ok) return parsed.error;
    const { params, gallerySession, set } = ctx;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (!gallerySession || gallerySession.galleryId !== gallery.id) {
      return { ok: true, favorited: false };
    }

    await db.delete(favorites).where(
      and(
        eq(favorites.galleryId, gallery.id),
        eq(favorites.fileId, parsed.data.fileId),
        eq(favorites.sessionToken, gallerySession.token),
      ),
    );
    return { ok: true, favorited: false };
  });
