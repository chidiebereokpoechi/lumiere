import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { env } from './lib/config';
import { log } from './lib/logger';
import { migrate } from './db/migrate';
import { clientIp } from './middleware/client-ip';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/api/auth';

migrate();

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
  .listen({ port: env.PORT, hostname: '0.0.0.0' });

log.info('lumiere.api.listening', { port: env.PORT, env: env.NODE_ENV });

export type App = typeof app;
