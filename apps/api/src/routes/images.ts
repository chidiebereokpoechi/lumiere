import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { files, galleries } from '../db/schema';
import { authContext } from '../middleware/auth';
import { gallerySessionContext } from '../middleware/gallery-session';
import { presignGet } from '../services/storage';
import { env } from '../lib/config';
import { now } from '../lib/ids';

// Image proxy (v1.2 §3). Validates the request, then 302-redirects to a
// short-lived S3 presigned URL — bytes never flow through this process.
//
// Auth model:
//   - thumb / preview: admin OR a valid gallery_session scoped to the same
//     gallery, OR (passwordless + un-expired). IDOR protection: the request
//     must prove ownership/access to *this specific gallery*.
//   - original: admin only.

type Size = 'thumb' | 'preview' | 'original';

const SIZE_CONFIG: Record<Size, { keyField: keyof typeof files.$inferSelect; ttl: number; adminOnly: boolean }> = {
  thumb:    { keyField: 's3KeyThumbnail', ttl: 3600,                       adminOnly: false },
  preview:  { keyField: 's3KeyPreview',   ttl: env.PRESIGN_TTL_SECONDS,    adminOnly: false },
  original: { keyField: 's3KeyOriginal',  ttl: 60,                         adminOnly: true  },
};

function galleryIsAccessible(g: typeof galleries.$inferSelect): boolean {
  if (g.expiresAt) {
    const grace = (g.gracePeriodDays ?? 0) * 86_400;
    if (g.expiresAt + grace < now()) return false;
  }
  return true;
}

export const imageRoutes = new Elysia()
  .use(authContext)
  .use(gallerySessionContext)
  .get('/img/:galleryId/:photoId/:size', async (ctx) => {
    const { galleryId, photoId, size } = ctx.params;
    const cfg = SIZE_CONFIG[size as Size];
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'invalid_size' };
    }

    const photo = await db.query.files.findFirst({ where: eq(files.id, photoId) });
    if (!photo || photo.galleryId !== galleryId) {
      ctx.set.status = 404;
      return { error: 'not_found' };
    }

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
    if (!gallery) {
      ctx.set.status = 404;
      return { error: 'not_found' };
    }

    const isAdminOwner = ctx.currentPhotographer && gallery.photographerId === ctx.currentPhotographer.id;
    if (cfg.adminOnly) {
      if (!isAdminOwner) {
        ctx.set.status = 401;
        return { error: 'unauthenticated' };
      }
    } else {
      const isUnlockedClient = ctx.gallerySession?.galleryId === gallery.id && galleryIsAccessible(gallery);
      const isPublicAccessible = !gallery.passwordHash && galleryIsAccessible(gallery);
      if (!isAdminOwner && !isUnlockedClient && !isPublicAccessible) {
        ctx.set.status = 401;
        return { error: 'unauthenticated' };
      }
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
