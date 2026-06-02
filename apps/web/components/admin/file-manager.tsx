'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, apiClientMutation, ApiError } from '@/lib/api-client';
import type { GalleryFile } from '@/lib/api/files';
import type { Folder } from '@/lib/api/folders';

interface Props {
  galleryId: string;
  gallerySlug: string;
  initialFiles: GalleryFile[];
  initialFolders: Folder[];
  initialCoverFileId: string | null;
}

type UploadState = 'uploading' | 'processing' | 'ready' | 'error';
interface UploadTile { key: string; filename: string; status: UploadState; progress: number; reason?: string }
interface JobEvent { type: 'queued' | 'processing' | 'ready' | 'error' | 'done'; photoId?: string; filename?: string; reason?: string }

async function getCsrfToken(): Promise<string> {
  const m = document.cookie.match(/(?:^|; )lumiere_csrf=([^;]+)/);
  if (m) return decodeURIComponent(m[1]!);
  const { token } = await apiClient<{ token: string }>('/api/auth/csrf');
  return token;
}

export function FileManager({ galleryId, gallerySlug, initialFiles, initialFolders, initialCoverFileId }: Props) {
  const router = useRouter();
  const [files, setFiles] = useState<GalleryFile[]>(initialFiles);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [activeFolder, setActiveFolder] = useState<string>(initialFolders[0]?.id ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fileOverFolder, setFileOverFolder] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(initialCoverFileId);
  const [tiles, setTiles] = useState<UploadTile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inflight = useRef(0);

  const refreshFiles = useCallback(async () => {
    try { setFiles(await apiClient<GalleryFile[]>(`/api/galleries/${galleryId}/files`)); }
    catch { router.refresh(); }
  }, [galleryId, router]);

  const refreshFolders = useCallback(async () => {
    try {
      const fresh = await apiClient<Folder[]>(`/api/galleries/${galleryId}/folders`);
      setFolders(fresh);
      setActiveFolder((cur) => (fresh.some((f) => f.id === cur) ? cur : (fresh[0]?.id ?? '')));
    } catch { /* non-critical */ }
  }, [galleryId]);

  const updateTile = useCallback((key: string, patch: Partial<UploadTile>) => {
    setTiles((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  const settle = useCallback((_key: string) => {
    inflight.current -= 1;
    void refreshFiles();
    if (inflight.current <= 0) {
      window.setTimeout(() => setTiles((prev) => prev.filter((t) => t.status === 'error')), 800);
    }
  }, [refreshFiles]);

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

  const uploadOne = useCallback((file: File, key: string, token: string, folderId: string) => {
    return new Promise<void>((resolve) => {
      const form = new FormData();
      form.append('files', file);
      const xhr = new XMLHttpRequest();
      const q = folderId ? `?folderId=${folderId}` : '';
      xhr.open('POST', `/api/galleries/${galleryId}/files${q}`);
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
          if (batchId) watchBatch(batchId, key); else settle(key);
        } else {
          updateTile(key, { status: 'error', reason: `HTTP ${xhr.status}` });
          setError(`Upload failed (${xhr.status})`);
          settle(key);
        }
        resolve();
      };
      xhr.onerror = () => { updateTile(key, { status: 'error', reason: 'network error' }); setError('Network error during upload'); settle(key); resolve(); };
      xhr.send(form);
    });
  }, [galleryId, updateTile, watchBatch, settle]);

  const upload = useCallback(async (fileList: FileList | File[], folderId: string) => {
    const arr = Array.from(fileList);
    if (arr.length === 0 || !folderId) return;
    setError(null);
    const seeded = arr.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f }));
    setTiles((prev) => [...seeded.map((s) => ({ key: s.key, filename: s.file.name, status: 'uploading' as UploadState, progress: 0 })), ...prev]);
    inflight.current += seeded.length;
    let token: string;
    try { token = await getCsrfToken(); }
    catch { setError('Could not start upload (auth).'); seeded.forEach((s) => { updateTile(s.key, { status: 'error', reason: 'auth' }); settle(s.key); }); return; }
    for (const s of seeded) await uploadOne(s.file, s.key, token, folderId);
  }, [uploadOne, updateTile, settle]);

  // ---- folders ---------------------------------------------------------
  async function createFolder() {
    const name = window.prompt('Folder name')?.trim();
    if (!name) return;
    try {
      const created = await apiClientMutation<Folder>(`/api/galleries/${galleryId}/folders`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
      });
      await refreshFolders();
      if (created?.id) setActiveFolder(created.id);
    } catch (err) { setError(err instanceof ApiError ? `Could not create folder (${err.status})` : 'Network error'); }
  }
  async function renameFolder(folder: Folder) {
    const name = window.prompt('Rename folder', folder.name)?.trim();
    if (!name || name === folder.name) return;
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/folders/${folder.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
      });
      await refreshFolders();
    } catch (err) { setError(err instanceof ApiError ? `Could not rename folder (${err.status})` : 'Network error'); }
  }
  async function deleteFolder(folder: Folder) {
    if (folders.length <= 1) { setError('A gallery must have at least one folder.'); return; }
    if (!confirm(`Delete folder "${folder.name}"? Its contents move into another folder (nothing is deleted).`)) return;
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/folders/${folder.id}`, { method: 'DELETE' });
      if (activeFolder === folder.id) setActiveFolder(folders.find((f) => f.id !== folder.id)?.id ?? '');
      await refreshFolders();
      await refreshFiles();
    } catch (err) { setError(err instanceof ApiError ? `Could not delete folder (${err.status})` : 'Network error'); }
  }

  // ---- file ops --------------------------------------------------------
  const moveFiles = useCallback(async (ids: string[], folderId: string) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setFiles((prev) => prev.map((f) => (idSet.has(f.id) ? { ...f, folderId } : f)));
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/files/move`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileIds: ids, folderId }),
      });
      await refreshFolders();
    } catch (err) { setError(err instanceof ApiError ? `Could not move (${err.status})` : 'Network error'); void refreshFiles(); }
  }, [galleryId, refreshFolders, refreshFiles]);

  async function moveSelected(folderId: string) {
    if (selected.size === 0) return;
    const ids = [...selected];
    setSelected(new Set());
    await moveFiles(ids, folderId);
  }

  async function onDelete(file: GalleryFile) {
    if (!confirm(`Delete "${file.displayName ?? file.filenameOriginal}"? Cannot be undone.`)) return;
    setBusyId(file.id);
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/files/${file.id}`, { method: 'DELETE' });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (cover === file.id) setCover(null);
    } catch (err) { setError(err instanceof ApiError ? `Delete failed (${err.status})` : 'Network error'); }
    finally { setBusyId(null); }
  }

  async function onSetCover(file: GalleryFile) {
    setBusyId(file.id);
    const prev = cover;
    setCover(file.id);
    try {
      await apiClientMutation(`/api/galleries/${galleryId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coverFileId: file.id }),
      });
    } catch (err) { setCover(prev); setError(err instanceof ApiError ? `Could not set cover (${err.status})` : 'Network error'); }
    finally { setBusyId(null); }
  }

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  // ---- pointer-based sortable -----------------------------------------
  const [dragId, setDragId] = useState<string | null>(null);
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const orderRef = useRef<string[]>([]);
  const dragIdRef = useRef<string | null>(null);
  const dragPayload = useRef<string[]>([]);
  const dropFolderRef = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragInfo = useRef<{ offsetX: number; offsetY: number; w: number; h: number; startX: number; startY: number } | null>(null);
  const canDrag = tiles.length === 0;

  const tileNodes = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const registerTile = useCallback((id: string, node: HTMLElement | null) => {
    if (node) tileNodes.current.set(id, node); else tileNodes.current.delete(id);
  }, []);

  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  useEffect(() => {
    if (dragIdRef.current) return;
    const rebuilt = files.filter((f) => f.folderId === activeFolder)
      .map((f) => ({ id: f.id, pos: f.position ?? 0 }))
      .sort((a, b) => a.pos - b.pos)
      .map((x) => x.id);
    orderRef.current = rebuilt;
    setOrder(rebuilt);
  }, [files, activeFolder]);

  const folderEmpty = order.length === 0 && tiles.length === 0;

  useLayoutEffect(() => {
    const nodes = tileNodes.current;
    const newRects = new Map<string, DOMRect>();
    nodes.forEach((node, id) => newRects.set(id, node.getBoundingClientRect()));
    nodes.forEach((node, id) => {
      if (id === dragIdRef.current) return;
      const prev = prevRects.current.get(id);
      const next = newRects.get(id);
      if (!prev || !next) return;
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;
      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.pointerEvents = 'none';
      requestAnimationFrame(() => { node.style.transition = 'transform 200ms cubic-bezier(0.22,1,0.36,1)'; node.style.transform = ''; });
      window.setTimeout(() => { node.style.pointerEvents = ''; }, 210);
    });
    prevRects.current = newRects;
  }, [order]);

  const positionOverlay = useCallback((x: number, y: number) => {
    const ov = overlayRef.current; const info = dragInfo.current;
    if (!ov || !info) return;
    ov.style.transform = `translate(${x - info.offsetX}px, ${y - info.offsetY}px)`;
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const dragging = dragIdRef.current;
    if (!dragging) return;
    positionOverlay(e.clientX, e.clientY);
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const overFolder = el?.closest<HTMLElement>('[data-folder]')?.dataset.folder ?? null;
    if (overFolder && overFolder !== activeFolder) {
      if (dropFolderRef.current !== overFolder) { dropFolderRef.current = overFolder; setDropFolderId(overFolder); }
      return;
    }
    if (dropFolderRef.current !== null) { dropFolderRef.current = null; setDropFolderId(null); }
    if (dragPayload.current.length > 1) return;
    const overId = el?.closest<HTMLElement>('[data-mid]')?.dataset.mid;
    if (!overId || overId === dragging) return;
    setOrder((prev) => {
      const from = prev.indexOf(dragging);
      const to = prev.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved!);
      orderRef.current = copy;
      return copy;
    });
  }, [positionOverlay, activeFolder]);

  const onPointerUp = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.body.style.userSelect = '';
    const payload = dragPayload.current;
    const targetFolder = dropFolderRef.current;
    dragIdRef.current = null; dragInfo.current = null; dragPayload.current = []; dropFolderRef.current = null;
    setDragId(null); setOverlayId(null); setDropFolderId(null);

    if (targetFolder) {
      void moveFiles(payload, targetFolder);
      setSelected(new Set());
      return;
    }
    const finalOrder = orderRef.current;
    const posOf = new Map(finalOrder.map((k, i) => [k, i]));
    setFiles((ps) => ps.map((f) => (posOf.has(f.id) ? { ...f, position: posOf.get(f.id)! } : f)));
    void apiClientMutation(`/api/galleries/${galleryId}/files/reorder`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileIds: finalOrder }),
    }).catch((err) => { setError(err instanceof ApiError ? `Reorder failed (${err.status})` : 'Network error'); void refreshFiles(); });
  }, [galleryId, refreshFiles, onPointerMove, moveFiles]);

  const beginDrag = useCallback((id: string, e: React.PointerEvent<HTMLElement>) => {
    if (!canDrag || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragInfo.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, w: rect.width, h: rect.height, startX: e.clientX, startY: e.clientY };
    dragIdRef.current = id;
    dragPayload.current = selected.has(id) && selected.size > 0 ? [...selected] : [id];
    setDragId(id); setOverlayId(id);
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [canDrag, selected, onPointerMove, onPointerUp]);

  // ---- page-wide drop --------------------------------------------------
  function handleFiles(fileList: FileList | File[], folderId: string = activeFolder) {
    if (folderId) void upload(fileList, folderId);
  }
  const dragDepth = useRef(0);
  const overlayFile = overlayId ? fileById.get(overlayId) : null;

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-md bg-accent-soft border border-accent/40 px-4 py-3 text-sm font-semibold text-ink-strong">{error}</div>
      )}

      {tiles.length > 0 && <UploadSummary tiles={tiles} />}

      {/* Folder rail */}
      <div className="flex flex-wrap items-center gap-2">
        {folders.map((f) => (
          <FolderChip
            key={f.id}
            id={f.id}
            active={activeFolder === f.id}
            isDropTarget={dropFolderId === f.id || fileOverFolder === f.id}
            onClick={() => setActiveFolder(f.id)}
            label={f.name}
            count={f.photoCount}
            onRename={() => renameFolder(f)}
            onDelete={folders.length > 1 ? () => deleteFolder(f) : undefined}
            onFileEnter={() => setFileOverFolder(f.id)}
            onFileLeave={() => setFileOverFolder((c) => (c === f.id ? null : c))}
            onFileDrop={(fl) => { setFileOverFolder(null); handleFiles(fl, f.id); }}
          />
        ))}
        <button type="button" onClick={createFolder} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm font-semibold text-ink-muted hover:border-border-strong hover:text-ink-strong transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New folder
        </button>
        <button type="button" onClick={() => inputRef.current?.click()} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent border border-accent px-3 py-1.5 text-sm font-bold uppercase tracking-wider font-['Ika_Compact'] text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          Upload
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {selected.size > 0 && <p className="text-xs text-ink-subtle">Drag a selected item onto a folder to move {selected.size > 1 ? 'them' : 'it'}.</p>}
      {canDrag && selected.size === 0 && order.length > 1 && (
        <p className="text-xs text-ink-subtle">Drag to reorder — this is the order clients see. Drop onto a folder to move.</p>
      )}

      {/* Folder content — drop boundary */}
      <div
        className="relative space-y-6 min-h-64"
        onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth.current += 1; setDragging(true); } }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
        onDrop={(e) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); dragDepth.current = 0; setDragging(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
      >
        {dragging && (
          <div className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center justify-center gap-2 bg-accent-soft/70 backdrop-blur-sm border-2 border-dashed border-accent text-accent-ink">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            <p className="text-base font-bold uppercase tracking-wider font-['Ika_Compact']">Drop into this folder</p>
          </div>
        )}

        {folderEmpty ? (
          <p className="text-sm text-ink-muted">This folder is empty. Drop media here or use Upload.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {tiles.map((t) => (
              <div key={t.key} className="relative aspect-square rounded-lg border border-border bg-surface-sunken flex flex-col items-center justify-center gap-2 p-3 text-center overflow-hidden">
                {t.status === 'error' ? (
                  <span className="text-xs font-semibold text-negative px-1">Failed{t.reason ? `: ${t.reason}` : ''}</span>
                ) : t.status === 'uploading' ? (
                  <>
                    <span className="text-sm font-bold tabular-nums text-ink-strong">{t.progress}%</span>
                    <div className="w-4/5 h-1.5 rounded-pill bg-surface overflow-hidden"><div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${t.progress}%` }} /></div>
                  </>
                ) : (
                  <><Spinner /><span className="text-xs text-ink-muted">Processing…</span></>
                )}
                <span className="text-[11px] text-ink-subtle truncate max-w-full">{t.filename}</span>
              </div>
            ))}

            {order.map((id) => {
              const file = fileById.get(id);
              if (!file) return null;
              return (
                <FileTile
                  key={id}
                  file={file}
                  galleryId={galleryId}
                  gallerySlug={gallerySlug}
                  isCover={cover === file.id}
                  selected={selected.has(file.id)}
                  busy={busyId === file.id}
                  reorderable={canDrag}
                  dragging={dragId === file.id}
                  onRef={(n) => registerTile(file.id, n)}
                  onPointerDownReorder={(e) => beginDrag(file.id, e)}
                  onToggleSelect={() => toggleSelect(file.id)}
                  onDelete={() => onDelete(file)}
                  onSetCover={() => onSetCover(file)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Selection move bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-ink-strong tabular-nums">{selected.size} selected</span>
          <div className="flex items-center gap-3">
            <label className="text-sm text-ink-muted">Move to</label>
            <select defaultValue="" onChange={(e) => { const v = e.target.value; if (v) { void moveSelected(v); e.target.value = ''; } }} className="rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong focus:border-accent transition-colors">
              <option value="" disabled>Choose folder…</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button type="button" onClick={() => setSelected(new Set())} className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong">Clear</button>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {overlayFile && dragInfo.current && (
        <div ref={overlayRef} className="fixed top-0 left-0 z-50 pointer-events-none" style={{ width: dragInfo.current.w, height: dragInfo.current.h, willChange: 'transform', transform: `translate(${dragInfo.current.startX - dragInfo.current.offsetX}px, ${dragInfo.current.startY - dragInfo.current.offsetY}px)` }}>
          <div className={`relative h-full w-full origin-center overflow-hidden rounded-lg ring-2 ring-accent shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out ${dropFolderId ? 'scale-[0.35]' : 'scale-[1.04]'}`}>
            {overlayFile.type === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/img/${galleryId}/${overlayFile.id}/thumb`} alt="" draggable={false} className="h-full w-full object-contain bg-surface" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-surface-sunken text-ink-muted"><TypeIcon type={overlayFile.type} /></div>
            )}
            {dragPayload.current.length > 1 && <span className="absolute top-1 right-1 min-w-6 h-6 px-1.5 inline-flex items-center justify-center rounded-full bg-accent text-accent-ink text-xs font-bold tabular-nums">{dragPayload.current.length}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function FileTile({
  file, galleryId, gallerySlug, isCover, selected, busy, reorderable, dragging,
  onRef, onPointerDownReorder, onToggleSelect, onDelete, onSetCover,
}: {
  file: GalleryFile; galleryId: string; gallerySlug: string; isCover: boolean; selected: boolean; busy: boolean;
  reorderable: boolean; dragging: boolean;
  onRef: (n: HTMLElement | null) => void; onPointerDownReorder: (e: React.PointerEvent<HTMLElement>) => void;
  onToggleSelect: () => void; onDelete: () => void; onSetCover: () => void;
}) {
  const name = file.displayName ?? file.filenameOriginal;
  const ready = file.uploadStatus !== 'processing' && file.uploadStatus !== 'error';
  const streamUrl = `/api/gallery/${gallerySlug}/files/${file.id}/stream`;
  return (
    <div
      ref={onRef}
      data-mid={file.id}
      onPointerDown={reorderable ? onPointerDownReorder : undefined}
      style={reorderable ? { touchAction: 'none' } : undefined}
      className={`group relative aspect-square overflow-hidden rounded-lg border border-border ${dragging ? 'border-dashed bg-surface-2' : file.type === 'image' ? 'bg-surface' : 'bg-surface-sunken'} ${reorderable && !dragging ? 'cursor-grab' : ''}`}
    >
      {dragging ? (
        <div className="h-full w-full" />
      ) : file.type === 'image' ? (
        file.uploadStatus === 'error' ? (
          <div className="h-full w-full flex items-center justify-center text-xs font-semibold text-negative">Failed</div>
        ) : ready ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/img/${galleryId}/${file.id}/thumb`} alt={name} draggable={false} className={`h-full w-full object-contain ${selected ? 'brightness-90' : ''}`} />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2"><Spinner /><span className="text-xs text-ink-muted">Processing…</span></div>
        )
      ) : file.type === 'video' ? (
        <>
          <video src={`${streamUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-contain bg-black" />
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-black/50 text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span></span>
          <Badge>Video</Badge>
        </>
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-3 text-center">
          <TypeIcon type={file.type} />
          <span className="text-[11px] text-ink-subtle truncate max-w-full">{name}</span>
          <Badge>{file.type === 'audio' ? 'Audio' : 'File'}</Badge>
        </div>
      )}

      {!dragging && isCover && <span className="absolute top-2 right-2 rounded-md bg-surface-strong text-ink-inverse px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest">Cover</span>}

      {!dragging && (
        <button type="button" onClick={onToggleSelect} onPointerDown={(e) => e.stopPropagation()} aria-pressed={selected} aria-label={selected ? 'Deselect' : 'Select'}
          className={`absolute top-2 left-2 h-7 w-7 inline-flex items-center justify-center rounded-full border-2 transition-all ${selected ? 'bg-accent border-accent text-accent-ink opacity-100' : 'bg-black/30 border-white/80 text-transparent opacity-0 group-hover:opacity-100'}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </button>
      )}

      {!dragging && selected && <div className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-accent rounded-lg" />}

      {!dragging && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-linear-to-t from-black/50 to-transparent">
          {file.type === 'image' && ready && !isCover && (
            <button type="button" onClick={onSetCover} onPointerDown={(e) => e.stopPropagation()} disabled={busy} title="Set as cover" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-surface/90 text-ink-strong hover:bg-surface disabled:opacity-50">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2" /></svg>
            </button>
          )}
          <button type="button" onClick={onDelete} onPointerDown={(e) => e.stopPropagation()} disabled={busy} title="Delete" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-surface/90 text-negative hover:bg-surface disabled:opacity-50">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function TypeIcon({ type }: { type: GalleryFile['type'] }) {
  if (type === 'audio') {
    return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
  }
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><polyline points="14 2 14 8 20 8" /></svg>;
}

function FolderChip({
  id, active, isDropTarget, onClick, label, count, onRename, onDelete, onFileEnter, onFileLeave, onFileDrop,
}: {
  id: string; active: boolean; isDropTarget?: boolean; onClick: () => void; label: string; count: number;
  onRename?: () => void; onDelete?: () => void; onFileEnter?: () => void; onFileLeave?: () => void; onFileDrop?: (files: FileList) => void;
}) {
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');
  return (
    <span
      data-folder={id}
      onDragEnter={(e) => { if (hasFiles(e)) onFileEnter?.(); }}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
      onDragLeave={() => onFileLeave?.()}
      onDrop={(e) => { if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); onFileDrop?.(e.dataTransfer.files); } }}
      className={`group/chip inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold origin-center transition-all duration-200 ease-out ${
        isDropTarget ? 'scale-110 bg-accent text-accent-ink border-accent ring-4 ring-accent/40 shadow-[0_6px_20px_rgba(0,0,0,0.18)]'
          : active ? 'bg-surface-strong text-ink-inverse border-surface-strong' : 'bg-surface text-ink-muted border-border hover:text-ink-strong hover:border-border-strong'
      }`}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 focus-visible:outline-none">
        {label}<span className={`tabular-nums text-xs ${active || isDropTarget ? 'text-ink-inverse/70' : 'text-ink-subtle'}`}>{count}</span>
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
  const done = tiles.filter((t) => t.status === 'ready' || t.status === 'error').length;
  const failed = tiles.filter((t) => t.status === 'error').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink-strong">Uploading {total} item{total !== 1 ? 's' : ''} — one at a time</span>
        <span className="tabular-nums text-ink-muted">{done}/{total}{failed ? ` · ${failed} failed` : ''}</span>
      </div>
      <div className="h-2 rounded-pill bg-surface-sunken overflow-hidden"><div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} /></div>
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

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-surface-strong text-ink-inverse px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest">{children}</span>;
}
