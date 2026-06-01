import { Elysia } from 'elysia';
import { checkDb } from '../db';
import { checkS3 } from '../services/storage';

export const healthRoutes = new Elysia().get('/health', async () => {
  const [dbOk, s3Ok] = await Promise.all([
    Promise.resolve(checkDb()),
    checkS3(),
  ]);
  return {
    status: dbOk && s3Ok ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'error',
    s3: s3Ok ? 'ok' : 'error',
  } as const;
});
