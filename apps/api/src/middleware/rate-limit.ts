import { rawDb } from '../db';
import { now } from '../lib/ids';

/**
 * SQLite-backed sliding window. Counts events in the last `windowSeconds`
 * for (bucket, key) and inserts the current event if under the limit.
 *
 * Returns `true` if the request is allowed, `false` if rate-limited.
 */
export function checkRateLimit(bucket: string, key: string, limit: number, windowSeconds: number): boolean {
  const cutoff = now() - windowSeconds;

  rawDb.run('DELETE FROM rate_limit_events WHERE created_at < ?', [cutoff]);

  const row = rawDb
    .query('SELECT COUNT(*) AS c FROM rate_limit_events WHERE bucket = ? AND key = ? AND created_at >= ?')
    .get(bucket, key, cutoff) as { c: number } | undefined;

  if ((row?.c ?? 0) >= limit) return false;

  rawDb.run('INSERT INTO rate_limit_events (bucket, key, created_at) VALUES (?, ?, ?)', [bucket, key, now()]);
  return true;
}
