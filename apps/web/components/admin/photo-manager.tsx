'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, apiClientMutation, ApiError } from '@/lib/api-client';
import type { Photo } from '@/lib/api/photos';
import type { Folder } from '@/lib/api/folders';

interface Props {
  galleryId: string;
  initialPhotos: Photo[];
  initialFolders: Folder[];
  initialCoverPhotoId: string | null;
}

// null = all photos, 'unfiled' = photos with no folder, otherwise a folder id.
type FolderFilter = 'all' | 'unfiled' | string;

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

export function PhotoManager({ galleryId, initialPhotos, initialFolders, initialCoverPhotoId }: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [filter, setFilter] = useState<FolderFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const refreshFolders = useCallback(async () => {
    try {
      setFolders(await apiClient<Folder[]>(`/api/galleries/${galleryId}/folders`));
    } catch { /* non-critical */ }
  }, [galleryId]);

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

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const [dragId, setDragId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  // Reordering writes global positions, so only allow it in the unfiltered
  // view with nothing selected and no uploads in flight.
  const canReorder = filter === 'all' && selected.size === 0 && tiles.length === 0;

  const tileNodes = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const registerTile = useCallback((id: string, node: HTMLElement | null) => {
    if (node) tileNodes.current.set(id, node);
    else tileNodes.current.delete(id);
  }, []);

  const startDrag = useCallback((id: string) => {
    dragIdRef.current = id;
    setDragId(id);
  }, []);

  // Live reorder as the dragged tile enters another — re-renders trigger the
  // FLIP pass, so neighbours slide out of the way while dragging.
  const dragOver = useCallback((overId: string) => {
    const dragging = dragIdRef.current;
    if (!dragging || dragging === overId) return;
    setPhotos((prev) => {
      const from = prev.findIndex((p) => p.id === dragging);
      const to = prev.findIndex((p) => p.id === overId);
      if (from === -1 || to === -1 || from === to) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved!);
      return copy;
    });
  }, []);

  // Persist the final order once on drop/end.
  const endDrag = useCallback(() => {
    dragIdRef.current = null;
    setDragId(null);
    setPhotos((prev) => {
      const orderedIds = prev.map((p) => p.id);
      void apiClientMutation(`/api/galleries/${galleryId}/photos/reorder`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photoIds: orderedIds }),
      }).catch((err) => {
        setError(err instanceof ApiError ? `Reorder failed (${err.status})` : 'Network error');
        void refreshPhotos();
      });
      return prev;
    });
  }, [galleryId, refreshPhotos]);

  async function createFolder() {
    const name = window.prompt('Folder name')?.trim();
    if (!name) return;
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/folders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await refreshFolders();
    } catch (err) {
      setError(err instanceof ApiError ? `Could not create folder (${err.status})` : 'Network error');
    }
  }

  async function renameFolder(folder: Folder) {
    const name = window.prompt('Rename folder', folder.name)?.trim();
    if (!name || name === folder.name) return;
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await refreshFolders();
    } catch (err) {
      setError(err instanceof ApiError ? `Could not rename folder (${err.status})` : 'Network error');
    }
  }

  async function deleteFolder(folder: Folder) {
    if (!confirm(`Delete folder "${folder.name}"? Its photos move back to the gallery (they are not deleted).`)) return;
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/folders/${folder.id}`, { method: 'DELETE' });
      if (filter === folder.id) setFilter('all');
      await Promise.all([refreshFolders(), refreshPhotos()]);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not delete folder (${err.status})` : 'Network error');
    }
  }

  async function moveSelected(folderId: string | null) {
    if (selected.size === 0) return;
    const photoIds = [...selected];
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/photos/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photoIds, folderId }),
      });
      // Optimistic local update + refresh folder counts.
      setPhotos((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, folderId } : p)));
      setSelected(new Set());
      await refreshFolders();
    } catch (err) {
      setError(err instanceof ApiError ? `Could not move photos (${err.status})` : 'Network error');
    }
  }

  const visiblePhotos = useMemo(() => {
    if (filter === 'all') return photos;
    if (filter === 'unfiled') return photos.filter((p) => !p.folderId);
    return photos.filter((p) => p.folderId === filter);
  }, [photos, filter]);

  const unfiledCount = useMemo(() => photos.filter((p) => !p.folderId).length, [photos]);

  // FLIP: animate tiles from their previous positions to their new ones when
  // the order changes, instead of popping into place.
  useLayoutEffect(() => {
    const nodes = tileNodes.current;
    const newRects = new Map<string, DOMRect>();
    nodes.forEach((node, id) => newRects.set(id, node.getBoundingClientRect()));
    nodes.forEach((node, id) => {
      if (id === dragIdRef.current) return; // don't fight the native drag ghost
      const prev = prevRects.current.get(id);
      const next = newRects.get(id);
      if (!prev || !next) return;
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;
      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        node.style.transition = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)';
        node.style.transform = '';
      });
    });
    prevRects.current = newRects;
  }, [visiblePhotos]);

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

      {/* Folder rail */}
      <div className="flex flex-wrap items-center gap-2">
        <FolderChip active={filter === 'all'} onClick={() => setFilter('all')} label="All photos" count={photos.length} />
        {folders.length > 0 && (
          <FolderChip active={filter === 'unfiled'} onClick={() => setFilter('unfiled')} label="Unfiled" count={unfiledCount} />
        )}
        {folders.map((f) => (
          <FolderChip
            key={f.id}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
            label={f.name}
            count={f.photoCount}
            onRename={() => renameFolder(f)}
            onDelete={() => deleteFolder(f)}
          />
        ))}
        <button
          type="button"
          onClick={createFolder}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm font-semibold text-ink-muted hover:border-border-strong hover:text-ink-strong transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New folder
        </button>
      </div>

      {canReorder && visiblePhotos.length > 1 && (
        <p className="text-xs text-ink-subtle">Drag photos to reorder.</p>
      )}

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

          {/* Persisted photos (filtered by folder) */}
          {visiblePhotos.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              galleryId={galleryId}
              isCover={cover === photo.id}
              selected={selected.has(photo.id)}
              busy={busyId === photo.id}
              draggable={canReorder}
              dragging={dragId === photo.id}
              onRef={(n) => registerTile(photo.id, n)}
              onDragStart={() => startDrag(photo.id)}
              onDragEnter={() => dragOver(photo.id)}
              onDragEnd={endDrag}
              onToggleSelect={() => toggleSelect(photo.id)}
              onDelete={() => onDelete(photo)}
              onSetCover={() => onSetCover(photo)}
            />
          ))}
        </div>
      )}

      {/* Selection move bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-ink-strong tabular-nums">{selected.size} selected</span>
          <div className="flex items-center gap-3">
            <label className="text-sm text-ink-muted">Move to</label>
            <select
              defaultValue=""
              onChange={(e) => { const v = e.target.value; if (v) { void moveSelected(v === 'root' ? null : v); e.target.value = ''; } }}
              className="rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong focus:border-accent transition-colors"
            >
              <option value="" disabled>Choose folder…</option>
              <option value="root">Gallery root (unfiled)</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button type="button" onClick={() => setSelected(new Set())} className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderChip({
  active, onClick, label, count, onRename, onDelete,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <span
      className={`group/chip inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? 'bg-surface-strong text-ink-inverse border-surface-strong' : 'bg-surface text-ink-muted border-border hover:text-ink-strong hover:border-border-strong'
      }`}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 focus-visible:outline-none">
        {label}
        <span className={`tabular-nums text-xs ${active ? 'text-ink-inverse/70' : 'text-ink-subtle'}`}>{count}</span>
      </button>
      {onRename && (
        <button type="button" onClick={onRename} title="Rename" className={`opacity-0 group-hover/chip:opacity-100 ${active ? 'text-ink-inverse/80 hover:text-ink-inverse' : 'text-ink-subtle hover:text-ink-strong'}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} title="Delete folder" className={`opacity-0 group-hover/chip:opacity-100 ${active ? 'text-ink-inverse/80 hover:text-ink-inverse' : 'text-ink-subtle hover:text-negative'}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </span>
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
  photo, galleryId, isCover, selected, busy, draggable, dragging,
  onRef, onDragStart, onDragEnter, onDragEnd, onToggleSelect, onDelete, onSetCover,
}: {
  photo: Photo;
  galleryId: string;
  isCover: boolean;
  selected: boolean;
  busy: boolean;
  draggable: boolean;
  dragging: boolean;
  onRef: (node: HTMLElement | null) => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onToggleSelect: () => void;
  onDelete: () => void;
  onSetCover: () => void;
}) {
  const ready = photo.uploadStatus === 'ready';
  const errored = photo.uploadStatus === 'error';
  return (
    <div
      ref={onRef}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={() => { if (draggable) onDragEnter(); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { if (draggable) e.preventDefault(); }}
      onDrop={(e) => e.preventDefault()}
      className={`group relative aspect-square rounded-lg overflow-hidden border border-border bg-surface-sunken ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging ? 'opacity-40' : ''}`}
    >
      {ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/img/${galleryId}/${photo.id}/thumb`}
          alt={photo.filenameOriginal}
          draggable={false}
          className={`h-full w-full object-cover ${selected ? 'brightness-90' : ''}`}
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
        <span className="absolute top-2 right-2 rounded-md bg-surface-strong text-ink-inverse px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest">
          Cover
        </span>
      )}

      {/* Selection checkbox */}
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={selected ? 'Deselect' : 'Select'}
        className={`absolute top-2 left-2 h-7 w-7 inline-flex items-center justify-center rounded-full border-2 transition-all ${
          selected
            ? 'bg-accent border-accent text-accent-ink opacity-100'
            : 'bg-black/30 border-white/80 text-transparent opacity-0 group-hover:opacity-100'
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </button>

      {selected && <div className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-accent rounded-lg" />}

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
