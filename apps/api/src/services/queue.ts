// SQLite-backed job queue (v1.2 §9). Survives restarts; a reaper re-queues
// rows whose locked_at goes stale past a TTL, so photos never get stuck in
// `processing` if the worker dies mid-job.
import { rawDb, db } from '../db';
import { jobs } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { newId, now } from '../lib/ids';
import { log } from '../lib/logger';

export type JobType = 'process_photo' | 'process_media' | 'send_email' | 'apply_watermark';

export interface JobRow {
  id: string;
  type: JobType;
  galleryId: string | null;
  payload: string;
  status: 'queued' | 'running' | 'done' | 'error';
  attempts: number;
  maxAttempts: number;
}

type Handler = (payload: Record<string, unknown>, job: JobRow) => Promise<void>;

const handlers = new Map<JobType, Handler>();

export function registerHandler(type: JobType, fn: Handler): void {
  handlers.set(type, fn);
}

export async function enqueue(type: JobType, payload: Record<string, unknown>, galleryId?: string): Promise<string> {
  const id = newId();
  await db.insert(jobs).values({
    id,
    type,
    galleryId: galleryId ?? null,
    payload: JSON.stringify(payload),
    status: 'queued',
    attempts: 0,
    maxAttempts: 3,
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

/**
 * Atomically claim a queued job: pick one, flip it to running, bump attempts,
 * stamp locked_at. The single-row UPDATE ... RETURNING ensures two workers
 * can't claim the same row.
 */
function claimNext(): JobRow | null {
  const row = rawDb.query(`
    UPDATE jobs
       SET status = 'running',
           locked_at = ?,
           attempts = attempts + 1,
           updated_at = ?
     WHERE id = (
       SELECT id FROM jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
     )
    RETURNING id, type, gallery_id AS galleryId, payload, status, attempts, max_attempts AS maxAttempts
  `).get(now(), now()) as JobRow | undefined;
  return row ?? null;
}

async function runOne(job: JobRow): Promise<void> {
  const handler = handlers.get(job.type as JobType);
  if (!handler) {
    log.error('no handler for job type', { type: job.type, id: job.id });
    await db.update(jobs)
      .set({ status: 'error', lastError: 'no_handler', updatedAt: now() })
      .where(eq(jobs.id, job.id));
    return;
  }

  try {
    const payload = JSON.parse(job.payload) as Record<string, unknown>;
    await handler(payload, job);
    await db.update(jobs)
      .set({ status: 'done', updatedAt: now() })
      .where(eq(jobs.id, job.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const final = job.attempts >= job.maxAttempts;
    log.error('job failed', { id: job.id, type: job.type, attempts: job.attempts, final, msg });
    await db.update(jobs)
      .set({
        status: final ? 'error' : 'queued',
        lastError: msg,
        lockedAt: null,
        updatedAt: now(),
      })
      .where(eq(jobs.id, job.id));
  }
}

let workerRunning = false;
let stopRequested = false;

/**
 * Bounded-concurrency worker loop. Polls for queued jobs, runs up to
 * `concurrency` in parallel. Per v1.2 §9, photo processing must be
 * concurrency-bounded — decoded high-MP images are hundreds of MB.
 */
export function startWorker(opts: { concurrency: number; pollIntervalMs?: number }): void {
  if (workerRunning) return;
  workerRunning = true;
  const poll = opts.pollIntervalMs ?? 500;
  const inflight = new Set<Promise<void>>();

  const loop = async () => {
    while (!stopRequested) {
      while (inflight.size < opts.concurrency) {
        const job = claimNext();
        if (!job) break;
        const p = runOne(job).finally(() => { inflight.delete(p); });
        inflight.add(p);
      }
      if (inflight.size === 0) {
        await new Promise((r) => setTimeout(r, poll));
      } else {
        await Promise.race(inflight);
      }
    }
    await Promise.all(inflight);
    workerRunning = false;
  };

  loop().catch((err) => {
    log.error('worker loop crashed', { err: err instanceof Error ? err.message : String(err) });
    workerRunning = false;
  });
}

export function stopWorker(): void {
  stopRequested = true;
}

/**
 * Reaper: re-queue jobs whose `locked_at` is older than the TTL. Runs on a
 * timer; a crashed worker leaves rows stuck in 'running' and the reaper
 * unsticks them on the next pass.
 */
export function startReaper(opts: { intervalMs: number; staleAfterMs: number }): void {
  const tick = () => {
    const cutoff = now() - Math.floor(opts.staleAfterMs / 1000);
    const result = rawDb.run(
      `UPDATE jobs SET status = 'queued', locked_at = NULL, updated_at = ?
        WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ?`,
      [now(), cutoff],
    );
    if (result.changes > 0) log.warn('reaper requeued stuck jobs', { count: result.changes });
  };
  setInterval(tick, opts.intervalMs);
}
