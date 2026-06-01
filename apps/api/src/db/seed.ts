import { db } from './index';
import { photographers } from './schema';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { env } from '../lib/config';
import { newId, now } from '../lib/ids';
import { log } from '../lib/logger';
import { migrate } from './migrate';

async function seed() {
  migrate();

  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    log.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping bootstrap photographer');
    return;
  }

  const existing = await db.query.photographers.findFirst({ where: eq(photographers.email, env.ADMIN_EMAIL) });
  if (existing) {
    log.info('bootstrap photographer already exists', { email: env.ADMIN_EMAIL });
    return;
  }

  const passwordHash = await hash(env.ADMIN_PASSWORD);
  await db.insert(photographers).values({
    id: newId(),
    email: env.ADMIN_EMAIL,
    passwordHash,
    name: env.ADMIN_EMAIL.split('@')[0] ?? 'admin',
    createdAt: now(),
  });
  log.info('seeded bootstrap photographer', { email: env.ADMIN_EMAIL });
}

if (import.meta.main) {
  await seed();
  process.exit(0);
}
