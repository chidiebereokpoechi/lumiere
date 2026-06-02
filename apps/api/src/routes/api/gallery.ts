import { Elysia, t } from 'elysia';
import { eq, asc, and, sql } from 'drizzle-orm';
import { db } from '../../db';
import { galleries, photos, galleryViews, galleryFolders } from '../../db/schema';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { clientIp } from '../../middleware/client-ip';
import { checkRateLimit } from '../../middleware/rate-limit';
import { verifyPassword, hashPassword } from '../../services/auth';
import { createGallerySession, GALLERY_SESSION_COOKIE } from '../../services/gallery-session';
import { notifyPhotographer } from '../../services/notify';
import { env } from '../../lib/config';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

type AccessState = 'ok' | 'locked' | 'expired';

function isExpired(g: typeof galleries.$inferSelect): boolean {
  if (!g.expiresAt) return false;
  const grace = (g.gracePeriodDays ?? 0) * 86_400;
  return g.expiresAt + grace < now();
}

interface MinimalGallery {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverPhotoId: string | null;
  layout: string;
  colorTheme: string;
  customCss: string | null;
  hasPassword: boolean;
  allowDownload: boolean;
  downloadMode: string;
  allowFavorites: boolean;
  expiresAt: number | null;
  gracePeriodDays: number;
  eventDate: number | null;
  eventType: string | null;
}

function toMinimal(g: typeof galleries.$inferSelect): MinimalGallery {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    subtitle: g.subtitle,
    coverPhotoId: g.coverPhotoId,
    layout: g.layout ?? 'grid',
    colorTheme: g.colorTheme ?? 'light',
    customCss: g.customCss,
    hasPassword: !!g.passwordHash,
    allowDownload: g.allowDownload === 1,
    downloadMode: g.downloadMode ?? 'watermarked',
    allowFavorites: g.allowFavorites === 1,
    expiresAt: g.expiresAt,
    gracePeriodDays: g.gracePeriodDays ?? 0,
    eventDate: g.eventDate,
    eventType: g.eventType,
  };
}

export const clientGalleryRoutes = new Elysia({ prefix: '/api/gallery' })
  .use(gallerySessionContext)
  .use(clientIp)

  // GET /api/gallery/:slug/access — RSC access decision (frontend plan §14)
  .get('/:slug/access', async ({ params, gallerySession, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) {
      set.status = 404;
      return { error: 'not_found' };
    }

    if (isExpired(gallery)) {
      return { state: 'expired' as AccessState, gallery: toMinimal(gallery) };
    }

    if (gallery.passwordHash) {
      const unlocked = gallerySession?.galleryId === gallery.id;
      return {
        state: (unlocked ? 'ok' : 'locked') as AccessState,
        gallery: toMinimal(gallery),
      };
    }

    return { state: 'ok' as AccessState, gallery: toMinimal(gallery) };
  })

  // POST /api/gallery/:slug/unlock — verify password, issue gallery_session cookie
  .post('/:slug/unlock', async ({ params, body, cookie, set, clientIp }) => {
    const ip = clientIp ?? 'unknown';
    // v1.2 §14: 5 password attempts per IP per gallery per 15min.
    if (!checkRateLimit(`gallery_unlock:${params.slug}`, ip, 5, 15 * 60)) {
      set.status = 429;
      return { error: 'too_many_attempts' };
    }

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) {
      // Decoy hash so 404 timing matches a wrong-password 401.
      await hashPassword('decoy');
      set.status = 404;
      return { error: 'not_found' };
    }
    if (!gallery.passwordHash) {
      set.status = 400;
      return { error: 'no_password_set' };
    }
    if (isExpired(gallery)) {
      set.status = 410;
      return { error: 'expired' };
    }

    const ok = await verifyPassword(body.password, gallery.passwordHash);
    if (!ok) {
      set.status = 401;
      return { error: 'invalid_password' };
    }

    const session = createGallerySession(gallery.id, ip);
    cookie[GALLERY_SESSION_COOKIE]!.set({
      value: session.token,
      httpOnly: true,
      sameSite: 'lax',
      secure: env.IS_PROD,
      path: '/',
      maxAge: session.expiresAt - now(),
    });

    log.info('gallery.unlock', { galleryId: gallery.id, ip });
    return { ok: true, gallery: toMinimal(gallery) };
  }, {
    body: t.Object({ password: t.String({ minLength: 1 }) }),
  })

  // GET /api/gallery/:slug/photos — public photo list with placeholder data
  // (frontend plan §14: include colorPalette, width, height, theme, customCss).
  .get('/:slug/photos', async ({ params, gallerySession, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) {
      set.status = 404;
      return { error: 'not_found' };
    }
    if (isExpired(gallery)) {
      set.status = 410;
      return { error: 'expired' };
    }
    if (gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
      set.status = 401;
      return { error: 'locked' };
    }

    const rows = await db.query.photos.findMany({
      where: and(eq(photos.galleryId, gallery.id), eq(photos.uploadStatus, 'ready')),
      orderBy: [asc(photos.position), asc(photos.createdAt)],
    });

    const folderRows = await db.query.galleryFolders.findMany({
      where: eq(galleryFolders.galleryId, gallery.id),
      orderBy: [asc(galleryFolders.position), asc(galleryFolders.name)],
    });

    return {
      gallery: toMinimal(gallery),
      folders: folderRows.map((f) => ({ id: f.id, name: f.name, coverPhotoId: f.coverPhotoId })),
      photos: rows.map((p) => ({
        id: p.id,
        folderId: p.folderId,
        width: p.width,
        height: p.height,
        colorPalette: p.colorPalette ? JSON.parse(p.colorPalette) as string[] : null,
        position: p.position,
        thumbUrl: `/img/${gallery.id}/${p.id}/thumb`,
        previewUrl: `/img/${gallery.id}/${p.id}/preview`,
      })),
    };
  })

  // POST /api/gallery/:slug/track-view — fire-and-forget view event from the
  // client. Bumps gallery.view_count and inserts into gallery_views.
  .post('/:slug/track-view', async ({ params, request, clientIp, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) {
      set.status = 404;
      return { error: 'not_found' };
    }
    if (isExpired(gallery)) {
      set.status = 410;
      return { error: 'expired' };
    }

    await db.insert(galleryViews).values({
      id: newId(),
      galleryId: gallery.id,
      clientIp: clientIp ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      referrer: request.headers.get('referer') ?? null,
      createdAt: now(),
    });
    await db.update(galleries)
      .set({ viewCount: sql`${galleries.viewCount} + 1` })
      .where(eq(galleries.id, gallery.id));

    // Email the photographer, but only if they've left notifications on and
    // not more than once every 4 hours per gallery+IP — otherwise a single
    // client refreshing the page would spam the inbox.
    if (gallery.notifyOnView === 1) {
      const limitKey = `${gallery.id}:${clientIp ?? 'unknown'}`;
      if (checkRateLimit('email:gallery_viewed', limitKey, 1, 4 * 3600)) {
        await notifyPhotographer(gallery.id, 'gallery_viewed', {
          clientName: gallery.clientName ?? null,
        });
      }
    }

    return { ok: true };
  });
