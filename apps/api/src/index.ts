import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { env } from './lib/config';
import { log } from './lib/logger';
import { migrate } from './db/migrate';
import { clientIp } from './middleware/client-ip';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/api/auth';
import { galleryRoutes } from './routes/api/galleries';
import { photoRoutes } from './routes/api/photos';
import { clientGalleryRoutes } from './routes/api/gallery';
import { favoriteRoutes } from './routes/api/favorites';
import { downloadRoutes } from './routes/api/downloads';
import { analyticsRoutes } from './routes/api/analytics';
import { watermarkPresetRoutes } from './routes/api/watermark-presets';
import { commentRoutes } from './routes/api/comments';
import { attachmentRoutes, clientAttachmentRoutes } from './routes/api/attachments';
import { eventsRoutes } from './routes/events';
import { imageRoutes } from './routes/images';
import { registerHandler, startWorker, startReaper } from './services/queue';
import { handleProcessPhoto } from './services/image-processor';
import { handleSendEmail } from './services/email-job';
import { handleApplyWatermark } from './services/watermark-job';

migrate();

// Worker setup — concurrency from env (v1.2 §9: bounded for memory safety).
const concurrency = Number(process.env.IMAGE_CONCURRENCY ?? 3);
registerHandler('process_photo', handleProcessPhoto);
registerHandler('send_email', handleSendEmail);
registerHandler('apply_watermark', handleApplyWatermark);
startWorker({ concurrency });
startReaper({ intervalMs: 60_000, staleAfterMs: 5 * 60_000 });
log.info('worker.started', { concurrency });

const app = new Elysia()
  .use(cors({
    origin: env.BASE_URL.replace(/^https?:\/\//, ''),
    credentials: true,
  }))
  .use(clientIp)
  .onError(({ code, error, set }) => {
    log.error('request_error', { code, error: error instanceof Error ? error.message : String(error) });
    if (code === 'VALIDATION') {
      set.status = 400;
      return { error: 'validation_failed' };
    }
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'not_found' };
    }
    set.status = 500;
    return { error: 'internal_error' };
  })
  .use(healthRoutes)
  .use(authRoutes)
  .use(galleryRoutes)
  .use(photoRoutes)
  .use(clientGalleryRoutes)
  .use(favoriteRoutes)
  .use(downloadRoutes)
  .use(analyticsRoutes)
  .use(watermarkPresetRoutes)
  .use(commentRoutes)
  .use(attachmentRoutes)
  .use(clientAttachmentRoutes)
  .use(eventsRoutes)
  .use(imageRoutes)
  .listen({ port: env.PORT, hostname: '0.0.0.0' });

log.info('lumiere.api.listening', { port: env.PORT, env: env.NODE_ENV });

export type App = typeof app;
