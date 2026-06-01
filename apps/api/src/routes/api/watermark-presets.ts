import { Elysia, t } from 'elysia';
import { eq, and, asc } from 'drizzle-orm';
import { WatermarkPresetCreateInput, WatermarkPresetPatchInput } from '@lumiere/types';
import { db } from '../../db';
import { watermarkPresets } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { parseBody } from '../../lib/validation';
import { uploadObject } from '../../services/storage';
import { detectImageMime, extForMime } from '../../lib/mime';
import { newId } from '../../lib/ids';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

function shape(row: typeof watermarkPresets.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    type: row.type as 'text' | 'image',
    config: JSON.parse(row.config) as unknown,
  };
}

export const watermarkPresetRoutes = new Elysia({ prefix: '/api/watermark-presets' })
  .use(authContext)

  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;
    const rows = await db.query.watermarkPresets.findMany({
      where: eq(watermarkPresets.photographerId, me.id),
      orderBy: [asc(watermarkPresets.name)],
    });
    return rows.map(shape);
  })

  .post('/', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const parsed = parseBody(ctx, WatermarkPresetCreateInput);
    if (!parsed.ok) return parsed.error;
    const input = parsed.data;

    const id = newId();
    await db.insert(watermarkPresets).values({
      id,
      photographerId: me.id,
      name: input.name,
      type: input.config.type,
      config: JSON.stringify(input.config),
    });
    const row = await db.query.watermarkPresets.findFirst({ where: eq(watermarkPresets.id, id) });
    return shape(row!);
  })

  .get('/:id', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;
    const row = await db.query.watermarkPresets.findFirst({
      where: and(eq(watermarkPresets.id, ctx.params.id), eq(watermarkPresets.photographerId, me.id)),
    });
    if (!row) { ctx.set.status = 404; return { error: 'not_found' }; }
    return shape(row);
  })

  .patch('/:id', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const existing = await db.query.watermarkPresets.findFirst({
      where: and(eq(watermarkPresets.id, ctx.params.id), eq(watermarkPresets.photographerId, me.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'not_found' }; }

    const parsed = parseBody(ctx, WatermarkPresetPatchInput);
    if (!parsed.ok) return parsed.error;
    const input = parsed.data;

    const patch: Partial<typeof watermarkPresets.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.config !== undefined) {
      patch.type = input.config.type;
      patch.config = JSON.stringify(input.config);
    }
    await db.update(watermarkPresets).set(patch).where(eq(watermarkPresets.id, ctx.params.id));
    const row = await db.query.watermarkPresets.findFirst({ where: eq(watermarkPresets.id, ctx.params.id) });
    return shape(row!);
  })

  .delete('/:id', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const existing = await db.query.watermarkPresets.findFirst({
      where: and(eq(watermarkPresets.id, ctx.params.id), eq(watermarkPresets.photographerId, me.id)),
    });
    if (!existing) { ctx.set.status = 404; return { error: 'not_found' }; }
    await db.delete(watermarkPresets).where(eq(watermarkPresets.id, ctx.params.id));
    return { ok: true };
  })

  // POST /api/watermark-presets/logo — upload a logo asset for use by image
  // watermark presets. Returns the S3 key, which the caller embeds in the
  // preset's `config.s3Key`. Cap is tight (5 MB) — these are logos, not images.
  .post('/logo', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const incoming = ctx.body.file;
    const file = Array.isArray(incoming) ? incoming[0]! : incoming;
    if (file.size > MAX_LOGO_BYTES) {
      ctx.set.status = 413;
      return { error: 'too_large', maxBytes: MAX_LOGO_BYTES };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectImageMime(bytes);
    if (!mime) {
      ctx.set.status = 400;
      return { error: 'invalid_mime' };
    }
    const id = newId();
    const key = `logos/${me.id}/${id}.${extForMime(mime)}`;
    await uploadObject(key, Buffer.from(bytes), mime);
    return { s3Key: key, fileSize: bytes.byteLength, mimeType: mime };
  }, {
    body: t.Object({ file: t.File() }),
  });
