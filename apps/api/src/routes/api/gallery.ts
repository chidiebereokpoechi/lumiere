import { Elysia, t } from 'elysia';
import { eq, asc, and, sql } from 'drizzle-orm';
import { db } from '../../db';
import { galleries, files, galleryViews, galleryFolders } from '../../db/schema';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { authContext } from '../../middleware/auth';
import { clientIp } from '../../middleware/client-ip';
import { checkRateLimit } from '../../middleware/rate-limit';
import { verifyPassword, hashPassword } from '../../services/auth';
import { createGallerySession, setGallerySessionEmail, GALLERY_SESSION_COOKIE } from '../../services/gallery-session';
import { notifyPhotographer } from '../../services/notify';
import { parseBody } from '../../lib/validation';
import { IdentifyInput } from '@lumiere/types';
import { env } from '../../lib/config';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

type AccessState = 'ok' | 'locked' | 'expired' | 'archived' | 'draft';

// Why a client can't view a gallery (status/expiry). The owner previewing their
// own gallery (admin JWT) bypasses all of these. Returns null when viewable.
function blockedState(g: typeof galleries.$inferSelect, isOwner: boolean): Exclude<AccessState, 'ok' | 'locked'> | null {
  if (isOwner) return null;
  if (isExpired(g)) return 'expired';
  if (g.status === 'archived') return 'archived';
  if (g.status === 'draft') return 'draft';
  return null;
}

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
  coverFileId: string | null;
  layout: string;
  colorTheme: string;
  customCss: string | null;
  hasPassword: boolean;
  allowDownload: boolean;
  downloadMode: string;
  allowFavorites: boolean;
  allowComments: boolean;
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
    coverFileId: g.coverFileId,
    layout: g.layout ?? 'grid',
    colorTheme: g.colorTheme ?? 'light',
    customCss: g.customCss,
    hasPassword: !!g.passwordHash,
    allowDownload: g.allowDownload === 1,
    downloadMode: g.downloadMode ?? 'watermarked',
    allowFavorites: g.allowFavorites === 1,
    allowComments: g.allowComments === 1,
    expiresAt: g.expiresAt,
    gracePeriodDays: g.gracePeriodDays ?? 0,
    eventDate: g.eventDate,
    eventType: g.eventType,
  };
}

export const clientGalleryRoutes = new Elysia({ prefix: '/api/gallery' })
  .use(gallerySessionContext)
  .use(authContext)
  .use(clientIp)

  // GET /api/gallery/:slug/access — RSC access decision (frontend plan §14)
  .get('/:slug/access', async ({ params, gallerySession, currentPhotographer, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) {
      set.status = 404;
      return { error: 'not_found' };
    }

    const isOwner = !!currentPhotographer && gallery.photographerId === currentPhotographer.id;
    const blocked = blockedState(gallery, isOwner);
    if (blocked) {
      return { state: blocked as AccessState, gallery: toMinimal(gallery) };
    }

    if (gallery.passwordHash && !isOwner) {
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
    const blocked = blockedState(gallery, false);
    if (blocked) {
      set.status = blocked === 'expired' ? 410 : 403;
      return { error: blocked };
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

  // POST /api/gallery/:slug/identify — client supplies their email once. We
  // issue a gallery session if there isn't one, then stamp the email on it.
  // Required before favoriting or creating lists.
  .post('/:slug/identify', async (ctx) => {
    const { params, cookie, set, gallerySession, currentPhotographer, clientIp } = ctx;
    const parsed = parseBody(ctx, IdentifyInput);
    if (!parsed.ok) return parsed.error;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    const isOwner = !!currentPhotographer && gallery.photographerId === currentPhotographer.id;
    const blocked = blockedState(gallery, isOwner);
    if (blocked) { set.status = blocked === 'expired' ? 410 : 403; return { error: blocked }; }
    if (gallery.passwordHash && !isOwner && gallerySession?.galleryId !== gallery.id) {
      set.status = 401; return { error: 'locked' };
    }

    let token = gallerySession?.galleryId === gallery.id ? gallerySession.token : null;
    if (!token) {
      const session = createGallerySession(gallery.id, clientIp ?? undefined);
      cookie[GALLERY_SESSION_COOKIE]!.set({
        value: session.token,
        httpOnly: true,
        sameSite: 'lax',
        secure: env.IS_PROD,
        path: '/',
        maxAge: session.expiresAt - now(),
      });
      token = session.token;
    }
    setGallerySessionEmail(token, parsed.data.email);
    return { ok: true, email: parsed.data.email };
  })

  // GET /api/gallery/:slug/files — public, unified media list. Every item is a
  // file with a `type`; images carry thumb/preview URLs, video/audio/file carry
  // a stream + download URL.
  .get('/:slug/files', async ({ params, gallerySession, currentPhotographer, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) {
      set.status = 404;
      return { error: 'not_found' };
    }
    const isOwner = !!currentPhotographer && gallery.photographerId === currentPhotographer.id;
    const blocked = blockedState(gallery, isOwner);
    if (blocked) {
      set.status = blocked === 'expired' ? 410 : 403;
      return { error: blocked };
    }
    if (gallery.passwordHash && !isOwner && gallerySession?.galleryId !== gallery.id) {
      set.status = 401;
      return { error: 'locked' };
    }

    const folderRows = await db.query.galleryFolders.findMany({
      where: eq(galleryFolders.galleryId, gallery.id),
      orderBy: [asc(galleryFolders.position), asc(galleryFolders.name)],
    });
    // Folders flagged hidden never reach the client — neither the tab nor the
    // files inside it. The creator toggles visibility from the admin.
    const visibleFolders = folderRows.filter((f) => !f.hidden);
    const hiddenIds = new Set(folderRows.filter((f) => f.hidden).map((f) => f.id));

    const allRows = await db.query.files.findMany({
      where: and(eq(files.galleryId, gallery.id), eq(files.uploadStatus, 'ready')),
      orderBy: [asc(files.position), asc(files.createdAt)],
    });
    const rows = allRows.filter((p) => !(p.folderId && hiddenIds.has(p.folderId)));

    return {
      gallery: toMinimal(gallery),
      folders: visibleFolders.map((f) => ({ id: f.id, name: f.name, coverFileId: f.coverFileId })),
      files: rows.map((p) => ({
        id: p.id,
        folderId: p.folderId,
        type: p.type,
        filename: p.displayName ?? p.filenameOriginal,
        mimeType: p.mimeType,
        fileSize: p.fileSize,
        width: p.width,
        height: p.height,
        colorPalette: p.colorPalette ? JSON.parse(p.colorPalette) as string[] : null,
        position: p.position,
        // Images use the /img derivative proxy; other media stream inline.
        thumbUrl: p.type === 'image' ? `/img/${gallery.id}/${p.id}/thumb` : null,
        previewUrl: p.type === 'image' ? `/img/${gallery.id}/${p.id}/preview` : null,
        streamUrl: p.type === 'image' ? null : `/api/gallery/${gallery.slug}/files/${p.id}/stream`,
        downloadUrl: `/api/gallery/${gallery.slug}/files/${p.id}/download`,
      })),
    };
  })

  // POST /api/gallery/:slug/track-view — fire-and-forget view event from the
  // client. Bumps gallery.view_count and inserts into gallery_views.
  .post('/:slug/track-view', async ({ params, request, clientIp, currentPhotographer, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) {
      set.status = 404;
      return { error: 'not_found' };
    }
    const isOwner = !!currentPhotographer && gallery.photographerId === currentPhotographer.id;
    // Don't count the owner's own previews, or views of non-live galleries.
    if (isOwner) return { ok: true, skipped: 'owner' };
    const blocked = blockedState(gallery, false);
    if (blocked) { set.status = blocked === 'expired' ? 410 : 403; return { error: blocked }; }

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
