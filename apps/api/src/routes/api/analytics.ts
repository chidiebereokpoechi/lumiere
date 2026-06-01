import { Elysia } from 'elysia';
import { eq, and, gte, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { galleries, photos, galleryViews, downloads, favorites } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { classifyUserAgent } from '../../lib/user-agent';
import { now } from '../../lib/ids';

const DAY = 86_400;

function dayCutoff(days: number): number {
  return now() - days * DAY;
}

export const analyticsRoutes = new Elysia()
  .use(authContext)

  // GET /api/galleries/:galleryId/analytics — full per-gallery breakdown for
  // the admin dashboard's per-gallery analytics tab.
  .get('/api/galleries/:galleryId/analytics', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) {
      ctx.set.status = 404;
      return { error: 'not_found' };
    }

    const since = dayCutoff(30);

    const viewTimeline = await db
      .select({
        day: sql<string>`date(${galleryViews.createdAt}, 'unixepoch')`.as('day'),
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(galleryViews)
      .where(and(eq(galleryViews.galleryId, gallery.id), gte(galleryViews.createdAt, since)))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const downloadTimeline = await db
      .select({
        day: sql<string>`date(${downloads.createdAt}, 'unixepoch')`.as('day'),
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(downloads)
      .where(and(eq(downloads.galleryId, gallery.id), gte(downloads.createdAt, since)))
      .groupBy(sql`day`)
      .orderBy(sql`day`);

    const favoritesByPhoto = await db
      .select({
        photoId: favorites.photoId,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(favorites)
      .where(eq(favorites.galleryId, gallery.id))
      .groupBy(favorites.photoId)
      .orderBy(desc(sql<number>`COUNT(*)`));

    // Device split: pull recent user_agents (cap to last 1000 to keep this cheap)
    // and classify in app code. The UA classifier is too fuzzy to push into SQL.
    const recentViews = await db
      .select({ userAgent: galleryViews.userAgent })
      .from(galleryViews)
      .where(eq(galleryViews.galleryId, gallery.id))
      .orderBy(desc(galleryViews.createdAt))
      .limit(1000);

    const deviceCounts: Record<string, number> = { mobile: 0, tablet: 0, desktop: 0, unknown: 0 };
    for (const v of recentViews) {
      const kind = classifyUserAgent(v.userAgent);
      deviceCounts[kind] = (deviceCounts[kind] ?? 0) + 1;
    }

    return {
      galleryId: gallery.id,
      since,
      totals: {
        views: gallery.viewCount ?? 0,
        downloads: (await db.select({ c: sql<number>`COUNT(*)` }).from(downloads)
          .where(eq(downloads.galleryId, gallery.id)))[0]?.c ?? 0,
        favorites: (await db.select({ c: sql<number>`COUNT(*)` }).from(favorites)
          .where(eq(favorites.galleryId, gallery.id)))[0]?.c ?? 0,
      },
      viewsByDay: viewTimeline.map((r) => ({ day: r.day, count: Number(r.count) })),
      downloadsByDay: downloadTimeline.map((r) => ({ day: r.day, count: Number(r.count) })),
      favoritesByPhoto: favoritesByPhoto.map((r) => ({ photoId: r.photoId, count: Number(r.count) })),
      deviceSplit: deviceCounts,
    };
  });
