import { Elysia } from 'elysia';
import { eq, and, gte, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { galleries, files, galleryViews, downloads, favorites, lists } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { classifyUserAgent } from '../../lib/user-agent';
import { now } from '../../lib/ids';

const DAY = 86_400;

function dayCutoff(days: number): number {
  return now() - days * DAY;
}

export const analyticsRoutes = new Elysia()
  .use(authContext)

  // GET /api/galleries/:galleryId/favorites — admin view of client favorites,
  // grouped by the client's email so the creator can export a per-client pick
  // list (e.g. for Lightroom). Ungrouped (no-email) favorites collapse under a
  // null email bucket.
  .get('/api/galleries/:galleryId/favorites', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'not_found' }; }

    const rows = await db.query.favorites.findMany({
      where: eq(favorites.galleryId, gallery.id),
      orderBy: [desc(favorites.createdAt)],
    });
    const byEmail = new Map<string | null, string[]>();
    for (const r of rows) {
      const key = r.clientEmail ?? null;
      const arr = byEmail.get(key) ?? [];
      arr.push(r.fileId);
      byEmail.set(key, arr);
    }
    return [...byEmail.entries()].map(([clientEmail, fileIds]) => ({ clientEmail, fileIds }));
  })

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

    const favoritesByFile = await db
      .select({
        fileId: favorites.fileId,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(favorites)
      .where(eq(favorites.galleryId, gallery.id))
      .groupBy(favorites.fileId)
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

    // Per-client activity, keyed by the email clients now provide before
    // favoriting/listing. Favorites & lists always carry an email; downloads
    // carry one when the client identified before downloading.
    const clientMap = new Map<string, { favorites: number; lists: number; downloads: number; lastAt: number }>();
    const bump = (email: string | null, field: 'favorites' | 'lists' | 'downloads', at: number) => {
      if (!email) return;
      const c = clientMap.get(email) ?? { favorites: 0, lists: 0, downloads: 0, lastAt: 0 };
      c[field] += 1;
      if (at > c.lastAt) c.lastAt = at;
      clientMap.set(email, c);
    };
    const favRows = await db.select({ email: favorites.clientEmail, at: favorites.createdAt })
      .from(favorites).where(eq(favorites.galleryId, gallery.id));
    for (const r of favRows) bump(r.email, 'favorites', r.at);
    const listRows = await db.select({ email: lists.clientEmail, at: lists.createdAt })
      .from(lists).where(eq(lists.galleryId, gallery.id));
    for (const r of listRows) bump(r.email, 'lists', r.at);
    const dlRows = await db.select({ email: downloads.clientEmail, at: downloads.createdAt })
      .from(downloads).where(eq(downloads.galleryId, gallery.id));
    for (const r of dlRows) bump(r.email, 'downloads', r.at);

    const clients = [...clientMap.entries()]
      .map(([email, c]) => ({ email, ...c }))
      .sort((a, b) => b.lastAt - a.lastAt);

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
      favoritesByFile: favoritesByFile.map((r) => ({ fileId: r.fileId, count: Number(r.count) })),
      deviceSplit: deviceCounts,
      clients,
    };
  })

  // GET /api/analytics/overview — dashboard home summary for the current
  // photographer: totals across all their galleries plus a recent activity feed.
  .get('/api/analytics/overview', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const myGalleries = await db.query.galleries.findMany({
      where: eq(galleries.photographerId, me.id),
      columns: { id: true, status: true, viewCount: true, title: true, slug: true },
    });
    const galleryIds = myGalleries.map((g) => g.id);

    const statusCounts: Record<string, number> = { active: 0, archived: 0, draft: 0 };
    let totalViews = 0;
    for (const g of myGalleries) {
      const status = g.status ?? 'active';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      totalViews += g.viewCount ?? 0;
    }

    // Photo count + storage estimate (originals only — derivatives are <10%).
    const photoStats = galleryIds.length === 0
      ? { count: 0, bytes: 0 }
      : (await db
          .select({
            count: sql<number>`COUNT(*)`.as('count'),
            bytes: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`.as('bytes'),
          })
          .from(files)
          .where(inArray(files.galleryId, galleryIds)))[0] ?? { count: 0, bytes: 0 };

    // Recent activity: three event sources, three queries, merged in app code.
    // Cheaper than a UNION + JOIN here since each query is well-indexed and
    // the limit is tiny.
    const FEED_LIMIT = 20;
    const recentViews = galleryIds.length === 0 ? [] : await db
      .select({
        type: sql<'view'>`'view'`.as('type'),
        galleryId: galleryViews.galleryId,
        fileId: sql<string | null>`NULL`.as("file_id"),
        createdAt: galleryViews.createdAt,
      })
      .from(galleryViews)
      .where(inArray(galleryViews.galleryId, galleryIds))
      .orderBy(desc(galleryViews.createdAt))
      .limit(FEED_LIMIT);

    const recentDownloads = galleryIds.length === 0 ? [] : await db
      .select({
        type: sql<'download'>`'download'`.as('type'),
        galleryId: downloads.galleryId,
        fileId: downloads.fileId,
        createdAt: downloads.createdAt,
      })
      .from(downloads)
      .where(inArray(downloads.galleryId, galleryIds))
      .orderBy(desc(downloads.createdAt))
      .limit(FEED_LIMIT);

    const recentFavorites = galleryIds.length === 0 ? [] : await db
      .select({
        type: sql<'favorite'>`'favorite'`.as('type'),
        galleryId: favorites.galleryId,
        fileId: favorites.fileId,
        createdAt: favorites.createdAt,
      })
      .from(favorites)
      .where(inArray(favorites.galleryId, galleryIds))
      .orderBy(desc(favorites.createdAt))
      .limit(FEED_LIMIT);

    const titleById = new Map(myGalleries.map((g) => [g.id, { title: g.title, slug: g.slug }]));
    const activity = [...recentViews, ...recentDownloads, ...recentFavorites]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, FEED_LIMIT)
      .map((e) => ({
        type: e.type,
        galleryId: e.galleryId,
        gallerySlug: titleById.get(e.galleryId)?.slug ?? null,
        galleryTitle: titleById.get(e.galleryId)?.title ?? null,
        fileId: e.fileId,
        at: e.createdAt,
      }));

    return {
      galleries: {
        total: myGalleries.length,
        byStatus: statusCounts,
      },
      photos: {
        count: Number(photoStats.count),
        originalsBytes: Number(photoStats.bytes),
      },
      views: { total: totalViews },
      activity,
    };
  });
