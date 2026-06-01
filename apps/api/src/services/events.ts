// In-process event bus for upload/processing progress (v1.2 §9 SSE feed).
// Workers emit per-photo events keyed by batchId; this module also tracks
// how many photos are still in flight for the batch so it can synthesize
// the final `{ type: 'done', uploaded, failed }` event when the last
// per-photo event for the batch lands.
//
// Single-process by design — same Bun runtime as the worker. Cross-process
// fan-out is not in scope.

export interface JobEvent {
  type: 'queued' | 'processing' | 'ready' | 'error' | 'done';
  photoId?: string;
  filename?: string;
  thumbnailUrl?: string;
  reason?: string;
  uploaded?: number;
  failed?: number;
}

type Listener = (e: JobEvent) => void;

const listeners = new Map<string, Set<Listener>>();
interface Counter { remaining: number; uploaded: number; failed: number }
const counters = new Map<string, Counter>();

// Replay buffer: keep recent events per batch so a subscriber that connects
// after the worker has already started (or even finished) still sees them.
// Cleared on `done`, or after REPLAY_TTL_MS when no subscribers exist.
const REPLAY_TTL_MS = 30_000;
interface Replay { events: JobEvent[]; expiresAt: number; closed: boolean }
const replays = new Map<string, Replay>();

function getOrCreateReplay(batchId: string): Replay {
  let r = replays.get(batchId);
  if (!r) {
    r = { events: [], expiresAt: Date.now() + REPLAY_TTL_MS, closed: false };
    replays.set(batchId, r);
  }
  return r;
}

function maybeExpireReplays(): void {
  const nowMs = Date.now();
  for (const [id, r] of replays) {
    if (r.closed && r.expiresAt < nowMs) replays.delete(id);
  }
}

export function subscribe(batchId: string, fn: Listener): () => void {
  let set = listeners.get(batchId);
  if (!set) {
    set = new Set();
    listeners.set(batchId, set);
  }
  set.add(fn);

  // Replay anything already buffered for this batch, including a synthesized
  // 'done' if the batch already terminated.
  const r = replays.get(batchId);
  if (r) {
    for (const e of r.events) {
      try { fn(e); } catch { /* listener errors must not crash */ }
    }
  }

  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(batchId);
  };
}

function fanout(batchId: string, event: JobEvent): void {
  // Record into the replay buffer first so late subscribers can catch up.
  const replay = getOrCreateReplay(batchId);
  if (!replay.closed) {
    replay.events.push(event);
    replay.expiresAt = Date.now() + REPLAY_TTL_MS;
    if (event.type === 'done') {
      replay.closed = true;
    }
  }
  const set = listeners.get(batchId);
  if (set) {
    for (const fn of set) {
      try { fn(event); } catch { /* listener errors must not crash the worker */ }
    }
  }
  maybeExpireReplays();
}

/**
 * Called by the upload route once it knows how many photos are in the batch.
 * The counter decrements as `ready` / `error` events for the batch arrive;
 * when it reaches zero we synthesize a `done` event and forget the batch.
 */
export function trackBatch(batchId: string, total: number): void {
  if (total <= 0) {
    // Nothing accepted — emit done immediately.
    fanout(batchId, { type: 'done', uploaded: 0, failed: 0 });
    return;
  }
  counters.set(batchId, { remaining: total, uploaded: 0, failed: 0 });
}

export function emit(batchId: string, event: JobEvent): void {
  fanout(batchId, event);
  if (event.type === 'ready' || event.type === 'error') {
    const counter = counters.get(batchId);
    if (counter) {
      counter.remaining -= 1;
      if (event.type === 'ready') counter.uploaded += 1;
      else counter.failed += 1;
      if (counter.remaining <= 0) {
        counters.delete(batchId);
        fanout(batchId, { type: 'done', uploaded: counter.uploaded, failed: counter.failed });
      }
    }
  }
}
