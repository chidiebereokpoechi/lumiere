import { apiClientMutation } from '@/lib/api-client';

// Presigned multipart direct-to-storage upload (browser → RustFS). Resumable:
// the upload session (id/key/parts) is persisted in localStorage keyed by a
// file fingerprint, so re-selecting the same file after a refresh/crash
// continues where it left off.

interface InitResponse { fileId: string; key: string; uploadId: string; partSize: number }
interface Session { fileId: string; key: string; uploadId: string; partSize: number; parts: Record<number, string> }

const PART_CONCURRENCY = 4;

function fpKey(galleryId: string, file: File): string {
  return `lumiere_mpu:${galleryId}:${file.name}:${file.size}:${file.lastModified}`;
}
function loadSession(k: string): Session | null {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) as Session : null; } catch { return null; }
}
function saveSession(k: string, s: Session): void {
  try { localStorage.setItem(k, JSON.stringify(s)); } catch { /* quota — non-fatal */ }
}
function clearSession(k: string): void {
  try { localStorage.removeItem(k); } catch { /* ignore */ }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]!);
    }
  });
  await Promise.all(runners);
}

export interface MultipartOptions {
  galleryId: string;
  folderId: string;
  file: File;
  onProgress: (pct: number) => void;
  signal?: AbortSignal;
}

export async function uploadMultipart(opts: MultipartOptions): Promise<{ fileId: string; type: string }> {
  const { galleryId, folderId, file, onProgress, signal } = opts;
  const k = fpKey(galleryId, file);

  // Resume an existing session for this exact file, or start a new one.
  let session = loadSession(k);
  if (!session) {
    const init = await apiClientMutation<InitResponse>(`/api/galleries/${galleryId}/files/upload/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, mimeType: file.type || undefined, size: file.size, folderId }),
    });
    session = { ...init, parts: {} };
    saveSession(k, session);
  }

  const { partSize, key, uploadId, fileId } = session;
  const totalParts = Math.max(1, Math.ceil(file.size / partSize));
  const missing: number[] = [];
  for (let n = 1; n <= totalParts; n++) if (!session.parts[n]) missing.push(n);

  let uploadedBytes = (totalParts - missing.length) * partSize;
  const report = () => onProgress(Math.min(100, Math.round((uploadedBytes / file.size) * 100)));
  report();

  if (missing.length > 0) {
    // Presign the missing parts (batched ≤1000 per request).
    const urlMap = new Map<number, string>();
    for (let i = 0; i < missing.length; i += 1000) {
      const batch = missing.slice(i, i + 1000);
      const res = await apiClientMutation<{ urls: { partNumber: number; url: string }[] }>(
        `/api/galleries/${galleryId}/files/upload/part-urls`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId, partNumbers: batch }) },
      );
      for (const u of res.urls) urlMap.set(u.partNumber, u.url);
    }

    await runPool(missing, PART_CONCURRENCY, async (n) => {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const start = (n - 1) * partSize;
      const blob = file.slice(start, Math.min(start + partSize, file.size));
      const res = await fetch(urlMap.get(n)!, { method: 'PUT', body: blob, signal });
      if (!res.ok) throw new Error(`part ${n} failed (${res.status})`);
      const etag = res.headers.get('ETag') ?? res.headers.get('etag');
      if (!etag) throw new Error('missing ETag — check RustFS CORS ExposeHeaders');
      session!.parts[n] = etag;
      saveSession(k, session!);
      uploadedBytes += blob.size;
      report();
    });
  }

  const parts = Object.entries(session.parts).map(([n, etag]) => ({ partNumber: Number(n), etag }));
  const done = await apiClientMutation<{ ok: boolean; fileId: string; type: string }>(
    `/api/galleries/${galleryId}/files/upload/complete`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId, parts }) },
  );
  clearSession(k);
  return { fileId: done.fileId, type: done.type };
}

// Abort an in-flight/abandoned upload session for a file (server aborts the S3
// multipart + drops the row; clears local resume state).
export async function abortMultipart(galleryId: string, file: File): Promise<void> {
  const k = fpKey(galleryId, file);
  const session = loadSession(k);
  clearSession(k);
  if (session?.fileId) {
    await apiClientMutation(`/api/galleries/${galleryId}/files/upload/abort`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId: session.fileId }),
    }).catch(() => { /* best-effort */ });
  }
}
