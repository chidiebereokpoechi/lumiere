import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { galleries } from '../../db/schema';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { clientIp } from '../../middleware/client-ip';
import { now } from '../../lib/ids';

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
  });
