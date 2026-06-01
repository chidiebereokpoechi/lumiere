import { Elysia, t } from 'elysia';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { galleries, photos } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { hashPassword } from '../../services/auth';
import { uniqueGallerySlug } from '../../services/slug';
import { deletePrefix } from '../../services/storage';
import { newId, now } from '../../lib/ids';

const GalleryPatch = t.Partial(t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  subtitle: t.Union([t.String(), t.Null()]),
  status: t.Union([t.Literal('active'), t.Literal('archived'), t.Literal('draft')]),
  downloadMode: t.Union([t.Literal('none'), t.Literal('watermarked'), t.Literal('full'), t.Literal('selected')]),
  expiresAt: t.Union([t.Number(), t.Null()]),
  gracePeriodDays: t.Number({ minimum: 0 }),
  allowFavorites: t.Boolean(),
  allowComments: t.Boolean(),
  allowDownload: t.Boolean(),
  clientName: t.Union([t.String(), t.Null()]),
  clientEmail: t.Union([t.String(), t.Null()]),
  eventDate: t.Union([t.Number(), t.Null()]),
  eventType: t.Union([t.String(), t.Null()]),
  layout: t.Union([t.Literal('grid'), t.Literal('masonry'), t.Literal('slideshow')]),
  colorTheme: t.String(),
  customCss: t.Union([t.String(), t.Null()]),
  password: t.Union([t.String(), t.Null()]),
  notifyOnView: t.Boolean(),
  sortOrder: t.String(),
  coverPhotoId: t.Union([t.String(), t.Null()]),
}));

function boolToInt(v: boolean | undefined): number | undefined {
  return v === undefined ? undefined : v ? 1 : 0;
}

export const galleryRoutes = new Elysia({ prefix: '/api/galleries' })
  .use(authContext)

  // GET /api/galleries — list galleries for the current photographer
  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;
    const rows = await db.query.galleries.findMany({
      where: eq(galleries.photographerId, me.id),
      orderBy: desc(galleries.updatedAt),
    });
    if (rows.length === 0) return [];

    // Single GROUP BY query for the counts.
    const counts = await db
      .select({ galleryId: photos.galleryId, c: sql<number>`COUNT(*)`.as('c') })
      .from(photos)
      .where(inArray(photos.galleryId, rows.map((r) => r.id)))
      .groupBy(photos.galleryId);
    const countById = new Map(counts.map((r) => [r.galleryId, Number(r.c)]));
    return rows.map((g) => ({ ...g, photoCount: countById.get(g.id) ?? 0 }));
  })

  // POST /api/galleries — create
  .post('/', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const { body } = ctx;
    const slug = await uniqueGallerySlug(body.slug ?? body.title);
    const id = newId();
    const passwordHash = body.password ? await hashPassword(body.password) : null;

    await db.insert(galleries).values({
      id,
      photographerId: me.id,
      slug,
      title: body.title,
      subtitle: body.subtitle ?? null,
      passwordHash,
      clientName: body.clientName ?? null,
      clientEmail: body.clientEmail ?? null,
      eventDate: body.eventDate ?? null,
      eventType: body.eventType ?? null,
      createdAt: now(),
      updatedAt: now(),
    });

    const row = await db.query.galleries.findFirst({ where: eq(galleries.id, id) });
    return row;
  }, {
    body: t.Object({
      title: t.String({ minLength: 1, maxLength: 200 }),
      slug: t.Optional(t.String()),
      subtitle: t.Optional(t.String()),
      password: t.Optional(t.String()),
      clientName: t.Optional(t.String()),
      clientEmail: t.Optional(t.String({ format: 'email' })),
      eventDate: t.Optional(t.Number()),
      eventType: t.Optional(t.String()),
    }),
  })

  // GET /api/galleries/:id
  .get('/:galleryId', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const row = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!row) {
      ctx.set.status = 404;
      return { error: 'not_found' };
    }
    return row;
  })

  // PATCH /api/galleries/:id
  .patch('/:galleryId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const existing = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!existing) {
      ctx.set.status = 404;
      return { error: 'not_found' };
    }

    const { body } = ctx;
    const patch: Partial<typeof galleries.$inferInsert> = { updatedAt: now() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.subtitle !== undefined) patch.subtitle = body.subtitle;
    if (body.status !== undefined) patch.status = body.status;
    if (body.downloadMode !== undefined) patch.downloadMode = body.downloadMode;
    if (body.expiresAt !== undefined) patch.expiresAt = body.expiresAt;
    if (body.gracePeriodDays !== undefined) patch.gracePeriodDays = body.gracePeriodDays;
    if (body.allowFavorites !== undefined) patch.allowFavorites = boolToInt(body.allowFavorites);
    if (body.allowComments !== undefined) patch.allowComments = boolToInt(body.allowComments);
    if (body.allowDownload !== undefined) patch.allowDownload = boolToInt(body.allowDownload);
    if (body.notifyOnView !== undefined) patch.notifyOnView = boolToInt(body.notifyOnView);
    if (body.clientName !== undefined) patch.clientName = body.clientName;
    if (body.clientEmail !== undefined) patch.clientEmail = body.clientEmail;
    if (body.eventDate !== undefined) patch.eventDate = body.eventDate;
    if (body.eventType !== undefined) patch.eventType = body.eventType;
    if (body.layout !== undefined) patch.layout = body.layout;
    if (body.colorTheme !== undefined) patch.colorTheme = body.colorTheme;
    if (body.customCss !== undefined) patch.customCss = body.customCss;
    if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;
    if (body.coverPhotoId !== undefined) patch.coverPhotoId = body.coverPhotoId;
    if (body.password !== undefined) {
      patch.passwordHash = body.password === null || body.password === '' ? null : await hashPassword(body.password);
    }

    await db.update(galleries).set(patch).where(eq(galleries.id, ctx.params.galleryId));
    const row = await db.query.galleries.findFirst({ where: eq(galleries.id, ctx.params.galleryId) });
    return row;
  }, { body: GalleryPatch })

  // DELETE /api/galleries/:id — drops DB row (cascades photos) and S3 prefixes
  .delete('/:galleryId', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const existing = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!existing) {
      ctx.set.status = 404;
      return { error: 'not_found' };
    }

    await db.delete(galleries).where(eq(galleries.id, ctx.params.galleryId));
    // Best-effort: clear S3 derivatives + originals. Failure here is logged
    // upstream; DB cascade has already won by this point.
    await Promise.allSettled([
      deletePrefix(`originals/${ctx.params.galleryId}/`),
      deletePrefix(`previews/${ctx.params.galleryId}/`),
      deletePrefix(`thumbnails/${ctx.params.galleryId}/`),
      deletePrefix(`watermarked/${ctx.params.galleryId}/`),
    ]);
    return { ok: true };
  });
