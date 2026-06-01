import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawDb } from './index';
import { log } from '../lib/logger';
import { now } from '../lib/ids';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function migrate(): void {
  rawDb.run(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);

  const applied = new Set(
    (rawDb.query('SELECT id FROM _migrations').all() as { id: string }[]).map((r) => r.id),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    log.info('applying migration', { file });
    rawDb.transaction(() => {
      rawDb.exec(sql);
      rawDb.run(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`, [file, now()]);
    })();
    ranAny = true;
  }

  if (!ranAny) log.info('no pending migrations');
}

if (import.meta.main) {
  migrate();
  process.exit(0);
}
