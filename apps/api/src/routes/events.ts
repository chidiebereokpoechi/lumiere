import { Elysia, t } from 'elysia';
import { subscribe, type JobEvent } from '../services/events';

// SSE endpoint for upload/job progress (v1.2 §9). The client EventSource
// connects with ?batch=<batchId>; we hold the connection open until a 'done'
// event is emitted or the client disconnects.
export const eventsRoutes = new Elysia().get('/events', ({ query, set }) => {
  const batchId = query.batch;
  if (!batchId) {
    set.status = 400;
    return { error: 'batch_required' };
  }

  set.headers['content-type'] = 'text/event-stream';
  set.headers['cache-control'] = 'no-cache';
  set.headers['connection'] = 'keep-alive';
  set.headers['x-accel-buffering'] = 'no'; // nginx: don't buffer

  let unsubscribe: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  const cleanup = () => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (keepalive) { clearInterval(keepalive); keepalive = null; }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: JobEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
          return;
        }
        if (event.type === 'done') {
          cleanup();
          try { controller.close(); } catch { /* already closed */ }
        }
      };

      // Initial comment so the client sees the stream open before any event
      // lands; some proxies hold response headers until first byte.
      controller.enqueue(encoder.encode(': connected\n\n'));
      unsubscribe = subscribe(batchId, send);
      keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); }
        catch { cleanup(); }
      }, 25_000);
    },
    cancel() { cleanup(); },
  });
}, {
  query: t.Object({ batch: t.Optional(t.String()) }),
});
