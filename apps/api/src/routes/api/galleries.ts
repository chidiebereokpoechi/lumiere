import { Elysia } from 'elysia';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { GalleryCreateInput, GalleryPatchInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, photos } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { hashPassword } from '../../services/auth';
import { uniqueGallerySlug } from '../../services/slug';
import { ensureDefaultFolder } from '../../services/folders';
import { deletePrefix } from '../../services/storage';
import { enqueue } from '../../services/queue';
import { parseBody } from '../../lib/validation';
import { newId, now } from '../../lib/ids';

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

    const parsed = parseBody(ctx, GalleryCreateInput);
    if (!parsed.ok) return parsed.error;
    const input = parsed.data;

    const slug = await uniqueGallerySlug(input.slug ?? input.title);
    const id = newId();
    const passwordHash = input.password ? await hashPassword(input.password) : null;

    const { password: _password, slug: _slug, ...rest } = input;
    await db.insert(galleries).values({
      ...rest,
      id,
      photographerId: me.id,
      slug,
      passwordHash,
      createdAt: now(),
      updatedAt: now(),
    });
    await ensureDefaultFolder(id);
    return db.query.galleries.findFirst({ where: eq(galleries.id, id) });
  })

  // GET /api/galleries/:galleryId
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

  // PATCH /api/galleries/:galleryId
  // Zod transforms booleans → 0/1 in the schema, so we can spread the parsed
  // input straight into the update — `password` is the only field that needs
  // separate handling (it's hashed before storage, not stored verbatim).
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

    const parsed = parseBody(ctx, GalleryPatchInput);
    if (!parsed.ok) return parsed.error;
    const { password, ...rest } = parsed.data;

    const patch: Partial<typeof galleries.$inferInsert> = { ...rest, updatedAt: now() };
    if (password !== undefined) {
      patch.passwordHash = password === null || password === '' ? null : await hashPassword(password);
    }

    // If the watermark preset is changing (either attaching, detaching, or
    // swapping), enqueue apply_watermark jobs for every existing photo so the
    // derivative on S3 catches up. The job is cheap — reads the existing
    // preview, composites, uploads — no full reprocess needed.
    const watermarkChanged =
      patch.watermarkPresetId !== undefined &&
      patch.watermarkPresetId !== existing.watermarkPresetId;

    await db.update(galleries).set(patch).where(eq(galleries.id, ctx.params.galleryId));

    if (watermarkChanged) {
      const photoRows = await db.select({ id: photos.id }).from(photos)
        .where(eq(photos.galleryId, existing.id));
      for (const p of photoRows) {
        await enqueue('apply_watermark', { photoId: p.id, galleryId: existing.id }, existing.id);
      }
    }

    return db.query.galleries.findFirst({ where: eq(galleries.id, ctx.params.galleryId) });
  })

  // DELETE /api/galleries/:galleryId — drops DB row (cascades photos) and S3 prefixes
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
    await Promise.allSettled([
      deletePrefix(`originals/${ctx.params.galleryId}/`),
      deletePrefix(`previews/${ctx.params.galleryId}/`),
      deletePrefix(`thumbnails/${ctx.params.galleryId}/`),
      deletePrefix(`watermarked/${ctx.params.galleryId}/`),
      deletePrefix(`attachments/${ctx.params.galleryId}/`),
    ]);
    return { ok: true };
  });
