'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, apiClientMutation, ApiError } from '@/lib/api-client';
import type { Photo } from '@/lib/api/photos';

interface Props {
  galleryId: string;
  initialPhotos: Photo[];
  initialCoverPhotoId: string | null;
}

type UploadState = 'uploading' | 'processing' | 'ready' | 'error';
interface UploadTile {
  key: string;
  filename: string;
  status: UploadState;
  progress: number; // 0–100, bytes uploaded
  reason?: string;
}

interface JobEvent {
  type: 'queued' | 'processing' | 'ready' | 'error' | 'done';
  photoId?: string;
  filename?: string;
  reason?: string;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

async function getCsrfToken(): Promise<string> {
  const m = document.cookie.match(/(?:^|; )lumiere_csrf=([^;]+)/);
  if (m) return decodeURIComponent(m[1]!);
  const { token } = await apiClient<{ token: string }>('/api/auth/csrf');
  return token;
}

export function PhotoManager({ galleryId, initialPhotos, initialCoverPhotoId }: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [cover, setCover] = useState<string | null>(initialCoverPhotoId);
  const [tiles, setTiles] = useState<UploadTile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inflight = useRef(0);

  const refreshPhotos = useCallback(async () => {
    try {
      const fresh = await apiClient<Photo[]>(`/api/galleries/${galleryId}/photos`);
      setPhotos(fresh);
    } catch {
      router.refresh();
    }
  }, [galleryId, router]);

  const updateTile = useCallback((key: string, patch: Partial<UploadTile>) => {
    setTiles((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  // One file fully accounted for (processing finished or upload failed). When
  // the last one settles, reconcile with the server and drop the tiles.
  const settle = useCallback((key: string) => {
    inflight.current -= 1;
    void refreshPhotos();
    if (inflight.current <= 0) {
      window.setTimeout(() => setTiles((prev) => prev.filter((t) => t.status === 'error')), 800);
    }
    void key;
  }, [refreshPhotos]);

  // Watch a single-file batch's processing through the SSE stream.
  const watchBatch = useCallback((batchId: string, key: string) => {
    const es = new EventSource(`/events?batch=${batchId}`);
    es.onmessage = (ev) => {
      let data: JobEvent;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (data.type === 'processing') updateTile(key, { status: 'processing' });
      else if (data.type === 'ready') updateTile(key, { status: 'ready' });
      else if (data.type === 'error') updateTile(key, { status: 'error', reason: data.reason });
      else if (data.type === 'done') { es.close(); settle(key); }
    };
    es.onerror = () => { es.close(); settle(key); };
  }, [updateTile, settle]);

  // POST a single file, reporting byte progress via XHR. Resolves once the
  // request completes (success kicks off background processing via SSE).
  const uploadOne = useCallback((file: File, key: string, token: string) => {
    return new Promise<void>((resolve) => {
      const form = new FormData();
      form.append('files', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/galleries/${galleryId}/photos`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-CSRF-Token', token);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) updateTile(key, { status: 'uploading', progress: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          updateTile(key, { status: 'processing', progress: 100 });
          let batchId = '';
          try { batchId = JSON.parse(xhr.responseText).batchId; } catch { /* ignore */ }
          if (batchId) watchBatch(batchId, key);
          else settle(key);
        } else {
          updateTile(key, { status: 'error', reason: `HTTP ${xhr.status}` });
          setError(`Upload failed (${xhr.status})`);
          settle(key);
        }
        resolve();
      };
      xhr.onerror = () => {
        updateTile(key, { status: 'error', reason: 'network error' });
        setError('Network error during upload');
        settle(key);
        resolve();
      };
      xhr.send(form);
    });
  }, [galleryId, updateTile, watchBatch, settle]);

  const upload = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => ACCEPT.includes(f.type));
    if (files.length === 0) return;
    setError(null);

    const seeded = files.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      file: f,
    }));
    setTiles((prev) => [
      ...seeded.map((s) => ({ key: s.key, filename: s.file.name, status: 'uploading' as UploadState, progress: 0 })),
      ...prev,
    ]);
    inflight.current += seeded.length;

    let token: string;
    try {
      token = await getCsrfToken();
    } catch {
      setError('Could not start upload (auth).');
      seeded.forEach((s) => { updateTile(s.key, { status: 'error', reason: 'auth' }); settle(s.key); });
      return;
    }

    // One file at a time: the next upload starts only after the previous
    // request finishes sending. Processing runs in the background per file.
    for (const s of seeded) {
      await uploadOne(s.file, s.key, token);
    }
  }, [uploadOne, updateTile, settle]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
  }

  async function onDelete(photo: Photo) {
    if (!confirm(`Delete "${photo.filenameOriginal}"? Cannot be undone.`)) return;
    setBusyId(photo.id);
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/photos/${photo.id}`, { method: 'DELETE' });
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      if (cover === photo.id) setCover(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Delete failed (${err.status})` : 'Network error');
    } finally {
      setBusyId(null);
    }
  }

  async function onSetCover(photo: Photo) {
    setBusyId(photo.id);
    const previous = cover;
    setCover(photo.id); // optimistic
    try {
      await apiClientMutation(`/api/galleries/${galleryId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coverPhotoId: photo.id }),
      });
    } catch (err) {
      setCover(previous);
      setError(err instanceof ApiError ? `Could not set cover (${err.status})` : 'Network error');
    } finally {
      setBusyId(null);
    }
  }

  const isEmpty = photos.length === 0 && tiles.length === 0;

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-md bg-accent-soft border border-accent/40 px-4 py-3 text-sm font-semibold text-ink-strong">
          {error}
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors ${
          dragging ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-border-strong bg-surface'
        }`}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-subtle">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm font-semibold text-ink-strong">Drop photos here or click to browse</p>
        <p className="text-xs text-ink-muted">JPEG, PNG or WebP</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }}
        />
      </div>

      {tiles.length > 0 && <UploadSummary tiles={tiles} />}

      {isEmpty ? (
        <p className="text-sm text-ink-muted">No photos yet. Upload some to get started.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* In-flight upload tiles */}
          {tiles.map((t) => (
            <div key={t.key} className="relative aspect-square rounded-lg border border-border bg-surface-sunken flex flex-col items-center justify-center gap-2 p-3 text-center overflow-hidden">
              {t.status === 'error' ? (
                <span className="text-xs font-semibold text-negative px-1">Failed{t.reason ? `: ${t.reason}` : ''}</span>
              ) : t.status === 'uploading' ? (
                <>
                  <span className="text-sm font-bold tabular-nums text-ink-strong">{t.progress}%</span>
                  <div className="w-4/5 h-1.5 rounded-pill bg-surface overflow-hidden">
                    <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${t.progress}%` }} />
                  </div>
                </>
              ) : (
                <>
                  <Spinner />
                  <span className="text-xs text-ink-muted">Processing…</span>
                </>
              )}
              <span className="text-[11px] text-ink-subtle truncate max-w-full">{t.filename}</span>
            </div>
          ))}

          {/* Persisted photos */}
          {photos.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              galleryId={galleryId}
              isCover={cover === photo.id}
              busy={busyId === photo.id}
              onDelete={() => onDelete(photo)}
              onSetCover={() => onSetCover(photo)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadSummary({ tiles }: { tiles: UploadTile[] }) {
  const total = tiles.length;
  const ready = tiles.filter((t) => t.status === 'ready').length;
  const failed = tiles.filter((t) => t.status === 'error').length;
  const done = ready + failed;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink-strong">
          Uploading {total} photo{total !== 1 ? 's' : ''} — one at a time
        </span>
        <span className="tabular-nums text-ink-muted">
          {done}/{total}{failed ? ` · ${failed} failed` : ''}
        </span>
      </div>
      <div className="h-2 rounded-pill bg-surface-sunken overflow-hidden">
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PhotoTile({
  photo, galleryId, isCover, busy, onDelete, onSetCover,
}: {
  photo: Photo;
  galleryId: string;
  isCover: boolean;
  busy: boolean;
  onDelete: () => void;
  onSetCover: () => void;
}) {
  const ready = photo.uploadStatus === 'ready';
  const errored = photo.uploadStatus === 'error';
  return (
    <div className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-surface-sunken">
      {ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/img/${galleryId}/${photo.id}/thumb`}
          alt={photo.filenameOriginal}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-center p-3">
          {errored ? (
            <span className="text-xs font-semibold text-negative">Processing failed</span>
          ) : (
            <>
              <Spinner />
              <span className="text-xs text-ink-muted">Processing…</span>
            </>
          )}
        </div>
      )}

      {isCover && (
        <span className="absolute top-2 left-2 rounded-md bg-surface-strong text-ink-inverse px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest">
          Cover
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-linear-to-t from-black/50 to-transparent">
        {ready && !isCover && (
          <button
            type="button"
            onClick={onSetCover}
            disabled={busy}
            title="Set as cover"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-surface/90 text-ink-strong hover:bg-surface disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title="Delete"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-surface/90 text-negative hover:bg-surface disabled:opacity-50"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin text-ink-subtle" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
