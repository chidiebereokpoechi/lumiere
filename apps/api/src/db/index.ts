import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '../lib/config';
import * as schema from './schema';

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const sqlite = new Database(env.DATABASE_PATH, { create: true });

// Per v1.2 §5: these PRAGMAs must run on every connection BEFORE any query.
sqlite.run('PRAGMA journal_mode = WAL;');
sqlite.run('PRAGMA foreign_keys = ON;');
sqlite.run('PRAGMA busy_timeout = 5000;');
sqlite.run('PRAGMA synchronous = NORMAL;');

export const rawDb = sqlite;
export const db = drizzle(sqlite, { schema });

export function checkDb(): boolean {
  try {
    sqlite.query('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}
