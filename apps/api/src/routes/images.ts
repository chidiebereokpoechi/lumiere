import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { photos, galleries } from '../db/schema';
import { authContext } from '../middleware/auth';
import { presignGet } from '../services/storage';
import { env } from '../lib/config';

// Image proxy (v1.2 §3). Validates the request, then 302-redirects to a
// short-lived S3 presigned URL — the bytes never flow through this process.
//
// Auth model for the foundation+1 slice:
// - thumb / preview: admin session ONLY (until gallery sessions land in the
//   client-gallery pass). This matches the v1.2 doc's IDOR protection: the
//   request must prove ownership of the gallery.
// - original: admin session, same rule.
//
// When the client-gallery slice lands, the thumb/preview paths will also
// accept a valid gallery_session cookie scoped to that gallery.

const SIZE_CONFIG: Record<'thumb' | 'preview' | 'original', { keyField: keyof typeof photos.$inferSelect; ttl: number; adminOnly: boolean }> = {
  thumb:    { keyField: 's3KeyThumbnail', ttl: 3600, adminOnly: false },
  preview:  { keyField: 's3KeyPreview',   ttl: env.PRESIGN_TTL_SECONDS, adminOnly: false },
  original: { keyField: 's3KeyOriginal',  ttl: 60, adminOnly: true },
};

export const imageRoutes = new Elysia()
  .use(authContext)
  .get('/img/:galleryId/:photoId/:size', async (ctx) => {
    const { galleryId, photoId, size } = ctx.params;
    const cfg = SIZE_CONFIG[size as 'thumb' | 'preview' | 'original'];
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'invalid_size' };
    }

    // For now everything requires admin auth. The client-gallery slice will
    // add gallery_session support for non-original sizes.
    if (!ctx.currentPhotographer) {
      ctx.set.status = 401;
      return { error: 'unauthenticated' };
    }

    const photo = await db.query.photos.findFirst({ where: eq(photos.id, photoId) });
    if (!photo || photo.galleryId !== galleryId) {
      ctx.set.status = 404;
      return { error: 'not_found' };
    }

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
    if (!gallery || gallery.photographerId !== ctx.currentPhotographer.id) {
      // Avoid leaking gallery existence — same 404 as missing.
      ctx.set.status = 404;
      return { error: 'not_found' };
    }

    const key = photo[cfg.keyField];
    if (!key) {
      ctx.set.status = 404;
      return { error: 'derivative_not_ready' };
    }

    const url = await presignGet(key as string, cfg.ttl);
    ctx.set.status = 302;
    ctx.set.headers['location'] = url;
    return '';
  }, {
    params: t.Object({
      galleryId: t.String(),
      photoId: t.String(),
      size: t.Union([t.Literal('thumb'), t.Literal('preview'), t.Literal('original')]),
    }),
  });
