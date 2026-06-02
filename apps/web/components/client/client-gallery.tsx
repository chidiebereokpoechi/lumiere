'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import type { ClientFile, ClientFolder, MinimalGallery } from '@/lib/api/client-gallery';
import type { ClientComment } from '@/lib/api/comments';
import type { ClientList } from '@/lib/api/lists';
import { CommentsSection } from '@/components/client/comments-section';

interface Props {
  gallery: MinimalGallery;
  folders: ClientFolder[];
  files: ClientFile[];
  initialFavorites: string[];
  comments: ClientComment[];
  initialLists: ClientList[];
  initialEmail: string | null;
}

function formatBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function jsonPost(path: string, body: unknown, method = 'POST') {
  return apiClient(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function ClientGallery({
  gallery, folders, files: allFiles, initialFavorites, comments, initialLists, initialEmail,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites));

  // Client identity + lists.
  const [email, setEmail] = useState<string | null>(initialEmail);
  const [lists, setLists] = useState<ClientList[]>(initialLists);
  const [emailOpen, setEmailOpen] = useState(false);
  const pendingRef = useRef<null | (() => void)>(null);
  // List picker targets one or many files (bulk).
  const [pickerFiles, setPickerFiles] = useState<string[] | null>(null);

  // Touch devices have no hover — show tile actions permanently there. Also
  // gates the "Save to Photos" affordance to platforms whose share sheet can
  // write images to the camera roll (iOS Safari).
  const [coarse, setCoarse] = useState(false);
  const [savingPhotos, setSavingPhotos] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const actionVis = coarse ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';

  // The current view — a folder, favorites, or a list — selected from one row.
  // Mutually exclusive: picking any one clears the others.
  type View = { kind: 'folder'; id: string } | { kind: 'favorites' } | { kind: 'list'; id: string };
  const [view, setView] = useState<View>(folders[0] ? { kind: 'folder', id: folders[0].id } : { kind: 'favorites' });
  const switchView = useCallback((v: View) => { setView(v); setOpenId(null); setSelected(new Set()); }, []);

  const canDownload = gallery.allowDownload && gallery.downloadMode !== 'none';
  const canFavorite = gallery.allowFavorites;

  // Item count per folder (clients want to see how much is in each).
  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of allFiles) if (f.folderId) m.set(f.folderId, (m.get(f.folderId) ?? 0) + 1);
    return m;
  }, [allFiles]);

  const files = useMemo(() => {
    if (view.kind === 'favorites') return allFiles.filter((f) => favorites.has(f.id));
    if (view.kind === 'list') {
      const ids = new Set(lists.find((x) => x.id === view.id)?.fileIds ?? []);
      return allFiles.filter((f) => ids.has(f.id));
    }
    return allFiles.filter((f) => f.folderId === view.id);
  }, [allFiles, view, favorites, lists]);

  // Lightbox steps through every item, of any type.
  const openIndex = openId === null ? -1 : files.findIndex((f) => f.id === openId);

  // ---- Email gate ----
  // Favoriting and lists require the client to identify with an email. Gate the
  // action: if we have an email, run it; otherwise stash it and open the modal.
  const requireEmail = useCallback((run: () => void) => {
    if (email) { run(); return; }
    pendingRef.current = run;
    setEmailOpen(true);
  }, [email]);

  const submitEmail = useCallback(async (value: string) => {
    await jsonPost(`/api/gallery/${gallery.slug}/identify`, { email: value });
    setEmail(value);
    setEmailOpen(false);
    const p = pendingRef.current;
    pendingRef.current = null;
    p?.();
  }, [gallery.slug]);

  const toggleFavorite = useCallback((id: string) => {
    const wasFav = favorites.has(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(id); else next.add(id);
      return next;
    });
    void apiClient(`/api/gallery/${gallery.slug}/favorite`, {
      method: wasFav ? 'DELETE' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileId: id }),
    }).catch(() => {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFav) next.add(id); else next.delete(id);
        return next;
      });
    });
  }, [favorites, gallery.slug]);

  // ---- List mutations ----
  const createList = useCallback(async (name: string): Promise<ClientList | null> => {
    try {
      const l = await jsonPost(`/api/gallery/${gallery.slug}/lists`, { name }) as ClientList;
      setLists((prev) => [...prev, l]);
      return l;
    } catch { return null; }
  }, [gallery.slug]);

  const deleteList = useCallback((id: string) => {
    setLists((prev) => prev.filter((l) => l.id !== id));
    setView((v) => (v.kind === 'list' && v.id === id ? (folders[0] ? { kind: 'folder', id: folders[0].id } : { kind: 'favorites' }) : v));
    void apiClient(`/api/gallery/${gallery.slug}/lists/${id}`, { method: 'DELETE' }).catch(() => {});
  }, [gallery.slug, folders]);

  const setMembership = useCallback((listId: string, fileIds: string[], member: boolean) => {
    setLists((prev) => prev.map((l) => {
      if (l.id !== listId) return l;
      const ids = new Set(l.fileIds);
      for (const fid of fileIds) { if (member) ids.add(fid); else ids.delete(fid); }
      return { ...l, fileIds: [...ids] };
    }));
    for (const fid of fileIds) {
      if (member) {
        void jsonPost(`/api/gallery/${gallery.slug}/lists/${listId}/items`, { fileId: fid }).catch(() => {});
      } else {
        void apiClient(`/api/gallery/${gallery.slug}/lists/${listId}/items/${fid}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  }, [gallery.slug]);

  const openPicker = useCallback((fileIds: string[]) => {
    requireEmail(() => setPickerFiles(fileIds));
  }, [requireEmail]);

  useEffect(() => {
    void apiClient(`/api/gallery/${gallery.slug}/track-view`, { method: 'POST' }).catch(() => {});
  }, [gallery.slug]);

  // Shift-click selects the contiguous range from the last plain-clicked anchor
  // (additive — keeps the existing selection).
  const selectAnchor = useRef<string | null>(null);
  const toggleSelect = useCallback((id: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && selectAnchor.current) {
        const a = files.findIndex((f) => f.id === selectAnchor.current);
        const b = files.findIndex((f) => f.id === id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(files[i]!.id);
          return next;
        }
      }
      if (next.has(id)) next.delete(id); else next.add(id);
      selectAnchor.current = id;
      return next;
    });
  }, [files]);

  const selectAll = useCallback(() => setSelected(new Set(files.map((f) => f.id))), [files]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const triggerDownload = useCallback((qs: string) => {
    const a = document.createElement('a');
    a.href = `/api/gallery/${gallery.slug}/download?${qs}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [gallery.slug]);

  const downloadSelected = useCallback(() => {
    if (selected.size === 0) return;
    triggerDownload(`ids=${[...selected].join(',')}`);
  }, [selected, triggerDownload]);

  // Download the whole current view (folder / favorites / list) without first
  // selecting every file in it.
  const downloadView = useCallback(() => {
    if (files.length === 0) return;
    if (view.kind === 'folder') triggerDownload(`folderId=${view.id}`);
    else if (view.kind === 'favorites') triggerDownload('scope=favorites');
    else triggerDownload(`ids=${files.map((f) => f.id).join(',')}`);
  }, [view, files, triggerDownload]);

  // Images among the current selection — drives the "Save to Photos" action.
  const selectedImages = useMemo(
    () => files.filter((f) => selected.has(f.id) && f.type === 'image'),
    [files, selected],
  );

  // Save photos to the camera roll via the Web Share sheet (iOS: "Save N
  // Images"). Fetches each image as a File, then shares. Falls back to the ZIP
  // download when sharing files isn't supported or the fetch is blocked.
  const sharePhotos = useCallback(async (imgs: ClientFile[]) => {
    if (imgs.length === 0 || savingPhotos) return;
    setSavingPhotos(true);
    try {
      const fileObjs = await Promise.all(imgs.map(async (f) => {
        const res = await fetch(f.downloadUrl, { credentials: 'include' });
        if (!res.ok) throw new Error('fetch_failed');
        const blob = await res.blob();
        return new File([blob], f.filename || `${f.id}.jpg`, { type: blob.type || 'image/jpeg' });
      }));
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: fileObjs }) && nav.share) {
        await nav.share({ files: fileObjs });
      } else {
        triggerDownload(`ids=${imgs.map((f) => f.id).join(',')}`);
      }
    } catch (err) {
      // AbortError = user dismissed the share sheet; ignore. Otherwise fall back.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        triggerDownload(`ids=${imgs.map((f) => f.id).join(',')}`);
      }
    } finally {
      setSavingPhotos(false);
    }
  }, [savingPhotos, triggerDownload]);

  const saveToPhotos = useCallback(() => sharePhotos(selectedImages), [sharePhotos, selectedImages]);

  const close = useCallback(() => setOpenId(null), []);
  const step = useCallback((dir: number) => {
    setOpenId((cur) => {
      if (cur === null || files.length === 0) return cur;
      const i = files.findIndex((f) => f.id === cur);
      if (i === -1) return cur;
      return files[(i + dir + files.length) % files.length]!.id;
    });
  }, [files]);

  useEffect(() => {
    if (openId === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, close, step]);

  const eventLine = useMemo(() => [
    gallery.eventType,
    gallery.eventDate ? new Date(gallery.eventDate * 1000).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }) : null,
  ].filter(Boolean).join(' · '), [gallery.eventType, gallery.eventDate]);

  const allSelected = selected.size > 0 && selected.size === files.length;
  const open = openIndex >= 0 ? files[openIndex] : null;

  return (
    <main className="min-h-dvh bg-bg pb-24">
      {/* Cover */}
      <header className="relative">
        {gallery.coverFileId ? (
          <div className="relative h-[55vh] min-h-80 w-full overflow-hidden bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/img/${gallery.id}/${gallery.coverFileId}/preview`} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-8 sm:p-12 text-white">
              {eventLine && <p className="text-xs font-bold uppercase tracking-[0.28em] opacity-90">{eventLine}</p>}
              <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight">{gallery.title}</h1>
              {gallery.subtitle && <p className="mt-2 max-w-2xl text-sm sm:text-base opacity-90">{gallery.subtitle}</p>}
            </div>
          </div>
        ) : (
          <div className="px-8 sm:px-12 pt-16 pb-8">
            {eventLine && <p className="text-xs font-bold uppercase tracking-[0.28em] text-ink-muted">{eventLine}</p>}
            <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight text-ink-strong">{gallery.title}</h1>
            {gallery.subtitle && <p className="mt-2 max-w-2xl text-sm sm:text-base text-ink-muted">{gallery.subtitle}</p>}
          </div>
        )}
      </header>

      {/* Unified nav: folders, favorites, and lists in one mutually-exclusive row.
          Horizontally scrollable on phones, wraps on wider screens. */}
      {allFiles.length > 0 && (
        <nav className="px-4 sm:px-8 pt-6 flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] scrollbar-none [&::-webkit-scrollbar]:hidden">
          {folders.map((f) => (
            <Chip
              key={f.id}
              active={view.kind === 'folder' && view.id === f.id}
              onClick={() => switchView({ kind: 'folder', id: f.id })}
              label={f.name}
              count={folderCounts.get(f.id) ?? 0}
            />
          ))}
          {canFavorite && (
            <Chip
              active={view.kind === 'favorites'}
              onClick={() => switchView({ kind: 'favorites' })}
              label="Favorites"
              count={favorites.size}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 10 6c-2.5 4.4-10 9-10 9Z" /></svg>}
            />
          )}
          {lists.map((l) => (
            <Chip
              key={l.id}
              active={view.kind === 'list' && view.id === l.id}
              onClick={() => switchView({ kind: 'list', id: l.id })}
              label={l.name}
              count={l.fileIds.length}
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>}
              onDelete={() => { if (window.confirm(`Delete list "${l.name}"?`)) deleteList(l.id); }}
            />
          ))}
          <button
            type="button"
            onClick={() => requireEmail(async () => { const name = window.prompt('Name your list'); if (name?.trim()) await createList(name.trim()); })}
            className="shrink-0 h-9 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 text-sm font-semibold text-ink-muted hover:text-ink-strong hover:border-border-strong transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            List
          </button>
        </nav>
      )}

      {/* Toolbar */}
      {allFiles.length > 0 && (
        <div className="px-4 sm:px-8 pt-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-ink-muted tabular-nums">{files.length} item{files.length !== 1 ? 's' : ''}</p>
          {canDownload && files.length > 0 && (
            <div className="flex items-center gap-4">
              <button type="button" onClick={allSelected ? clearSelection : selectAll} className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong">
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={downloadView}
                className="inline-flex items-center gap-2 rounded-md bg-accent border border-accent px-4 py-2 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download {view.kind === 'favorites' ? 'favorites' : view.kind === 'list' ? 'list' : 'folder'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mixed-media masonry */}
      <section className="px-4 sm:px-8 py-6">
        {files.length === 0 ? (
          <p className="text-center text-sm text-ink-muted py-16">
            {view.kind === 'list' ? 'This list is empty.' : view.kind === 'favorites' ? 'No favorites yet.' : 'Nothing in this folder yet.'}
          </p>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-2">
            {files.map((f) => {
              const isSelected = selected.has(f.id);
              return (
                <div key={f.id} className="group relative mb-2 break-inside-avoid overflow-hidden rounded-md bg-surface-sunken">
                  <button type="button" onClick={() => setOpenId(f.id)} className="block w-full text-left focus-visible:outline-none">
                    {f.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.thumbUrl ?? ''}
                        alt=""
                        loading="lazy"
                        style={f.width && f.height ? { aspectRatio: `${f.width} / ${f.height}` } : undefined}
                        className={`block w-full h-auto object-cover transition-[filter] duration-300 ${isSelected ? 'brightness-90' : ''}`}
                      />
                    ) : f.type === 'video' ? (
                      <span className="relative block w-full bg-black">
                        <video src={`${f.streamUrl ?? ''}#t=0.1`} preload="metadata" muted playsInline className="block w-full h-auto" />
                        <span className="absolute inset-0 flex items-center justify-center"><span className="h-12 w-12 inline-flex items-center justify-center rounded-full bg-black/55 text-white"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span></span>
                      </span>
                    ) : (
                      <span className="flex aspect-square w-full flex-col items-center justify-center gap-2 p-3 text-center">
                        {f.type === 'audio' ? (
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                        ) : (
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><polyline points="14 2 14 8 20 8" /></svg>
                        )}
                        <span className="text-xs font-semibold text-ink-strong truncate max-w-full">{f.filename}</span>
                        <span className="text-[11px] text-ink-subtle">{formatBytes(f.fileSize)}</span>
                      </span>
                    )}
                  </button>

                  {canDownload && (
                    <button
                      type="button"
                      onClick={(e) => toggleSelect(f.id, e.shiftKey)}
                      aria-pressed={isSelected}
                      aria-label={isSelected ? 'Deselect' : 'Select'}
                      className={`absolute top-2 left-2 h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-full border-2 transition-all ${
                        isSelected ? 'bg-accent border-accent text-accent-ink opacity-100' : `bg-black/30 border-white/80 text-transparent ${actionVis}`
                      }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    {/* Add to a list */}
                    <button
                      type="button"
                      onClick={() => openPicker([f.id])}
                      aria-label="Add to list"
                      className={`h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-all ${actionVis}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                    </button>
                    {canFavorite && (
                      <button
                        type="button"
                        onClick={() => requireEmail(() => toggleFavorite(f.id))}
                        aria-pressed={favorites.has(f.id)}
                        aria-label={favorites.has(f.id) ? 'Remove favorite' : 'Add favorite'}
                        className={`h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-full transition-all ${
                          favorites.has(f.id) ? 'bg-white/90 text-accent-dark opacity-100' : `bg-black/30 text-white hover:bg-black/50 ${actionVis}`
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={favorites.has(f.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7.5-4.6-10-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 10 6c-2.5 4.4-10 9-10 9Z" /></svg>
                      </button>
                    )}
                  </div>
                  {isSelected && <div className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-accent rounded-md" />}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {gallery.allowComments && <CommentsSection slug={gallery.slug} initialComments={comments.filter((c) => !c.fileId)} />}

      {/* Selection action bar — wraps + respects the iOS home-indicator inset */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-strong tabular-nums">{selected.size} selected</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={clearSelection} className="px-2 py-2.5 text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong">Clear</button>
              <button
                type="button"
                onClick={() => openPicker([...selected])}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm font-bold uppercase tracking-wider text-ink-strong hover:border-border-strong transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                List
              </button>
              {/* Save photos straight to the camera roll on touch devices */}
              {canDownload && coarse && selectedImages.length > 0 && (
                <button
                  type="button"
                  onClick={saveToPhotos}
                  disabled={savingPhotos}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm font-bold uppercase tracking-wider text-ink-strong hover:border-border-strong transition-colors disabled:opacity-60"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                  {savingPhotos ? 'Preparing…' : `Save ${selectedImages.length} to Photos`}
                </button>
              )}
              {canDownload && (
                <button
                  type="button"
                  onClick={downloadSelected}
                  className="inline-flex items-center gap-2 rounded-md bg-accent border border-accent px-3.5 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download {selected.size}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — any file type plays/views/downloads here, with comments */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col lg:flex-row" onClick={close}>
          <div className="relative flex-1 flex items-center justify-center min-h-0 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="max-h-full max-w-full">
              {open.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={open.previewUrl ?? ''} alt="" className="max-h-[88vh] max-w-full object-contain" />
              ) : open.type === 'video' ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={open.streamUrl ?? ''} controls autoPlay className="max-h-[88vh] max-w-full" />
              ) : open.type === 'audio' ? (
                <div className="w-[min(90vw,32rem)] rounded-lg bg-surface p-6 text-center">
                  <p className="text-sm font-semibold text-ink-strong truncate mb-4">{open.filename}</p>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio src={open.streamUrl ?? ''} controls autoPlay className="w-full" />
                </div>
              ) : (
                <div className="w-[min(90vw,28rem)] rounded-lg bg-surface p-8 text-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-ink-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><polyline points="14 2 14 8 20 8" /></svg>
                  <p className="mt-3 text-sm font-semibold text-ink-strong truncate">{open.filename}</p>
                  <p className="text-xs text-ink-subtle">{formatBytes(open.fileSize)}</p>
                  <a href={open.downloadUrl} className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent border border-accent px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Download
                  </a>
                </div>
              )}
            </div>
            {/* Per-item actions */}
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => openPicker([open.id])}
                aria-label="Add to list"
                className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
              </button>
              {canDownload && coarse && open.type === 'image' && (
                <button
                  type="button"
                  onClick={() => sharePhotos([open])}
                  disabled={savingPhotos}
                  aria-label="Save to Photos"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-60"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                </button>
              )}
              {canFavorite && (
                <button
                  type="button"
                  onClick={() => requireEmail(() => toggleFavorite(open.id))}
                  aria-label={favorites.has(open.id) ? 'Remove favorite' : 'Add favorite'}
                  className={`h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-white/20 ${favorites.has(open.id) ? 'bg-white/90 text-accent-dark' : 'bg-white/10 text-white'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={favorites.has(open.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7.5-4.6-10-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 10 6c-2.5 4.4-10 9-10 9Z" /></svg>
                </button>
              )}
            </div>
            <button type="button" onClick={close} aria-label="Close" className="absolute top-4 right-4 h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
            {files.length > 1 && (
              <>
                <NavButton side="left" onClick={(e) => { e.stopPropagation(); step(-1); }} />
                <NavButton side="right" onClick={(e) => { e.stopPropagation(); step(1); }} />
                <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs tabular-nums text-white/80">{openIndex + 1} / {files.length}</span>
              </>
            )}
          </div>
          {gallery.allowComments && (
            <aside
              className="w-full lg:w-96 shrink-0 bg-surface border-t lg:border-t-0 lg:border-l border-border overflow-y-auto max-h-[40vh] lg:max-h-none"
              onClick={(e) => e.stopPropagation()}
            >
              <ItemComments slug={gallery.slug} fileId={open.id} />
            </aside>
          )}
        </div>
      )}

      {emailOpen && (
        <EmailModal
          onClose={() => { pendingRef.current = null; setEmailOpen(false); }}
          onSubmit={submitEmail}
        />
      )}

      {pickerFiles && (
        <ListPickerModal
          fileIds={pickerFiles}
          lists={lists}
          onClose={() => setPickerFiles(null)}
          onToggle={(listId, member) => setMembership(listId, pickerFiles, member)}
          onCreate={async (name) => {
            const l = await createList(name);
            if (l) setMembership(l.id, pickerFiles, true);
          }}
        />
      )}
    </main>
  );
}

// Unified nav chip — a folder, favorites, or a list. Carries a count and an
// optional icon; list chips also expose a hover delete.
function Chip({ active, onClick, label, count, icon, onDelete }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
  onDelete?: () => void;
}) {
  return (
    <span
      className={`group/chip shrink-0 h-9 inline-flex items-center gap-1.5 rounded-md border pl-3 text-sm font-semibold whitespace-nowrap transition-colors ${onDelete ? 'pr-1.5' : 'pr-3'} ${
        active ? 'bg-surface-strong text-ink-inverse border-surface-strong' : 'bg-surface text-ink-muted border-border hover:text-ink-strong hover:border-border-strong'
      }`}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 min-w-0 focus-visible:outline-none">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate max-w-[42vw] sm:max-w-56">{label}</span>
        <span className={`shrink-0 tabular-nums text-xs ${active ? 'text-ink-inverse/70' : 'text-ink-subtle'}`}>{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete list"
          className={`h-5 w-5 inline-flex items-center justify-center rounded opacity-0 group-hover/chip:opacity-100 ${active ? 'text-ink-inverse/80 hover:text-ink-inverse' : 'text-ink-subtle hover:text-negative'}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </span>
  );
}

// Email gate. Shown the first time a client favorites or touches a list.
function EmailModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (email: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) { setError('Enter a valid email.'); return; }
    setPending(true); setError(null);
    try { await onSubmit(value.trim()); }
    catch (err) { setError(err instanceof ApiError ? `Could not save (${err.status})` : 'Network error.'); setPending(false); }
  }

  return (
    <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-extrabold tracking-tight text-ink-strong">Your email</h2>
        <p className="mt-1.5 text-sm text-ink-muted">Enter your email to favorite items and build lists. The creator will see your selections.</p>
        <input
          type="email"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="you@example.com"
          className="mt-4 w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
        />
        {error && <p className="mt-2 text-sm font-semibold text-negative">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong">Cancel</button>
          <button type="submit" disabled={pending} className="inline-flex items-center rounded-md bg-accent border border-accent px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50">
            {pending ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Toggle file(s) in/out of lists, or create a new list and add them.
function ListPickerModal({
  fileIds, lists, onClose, onToggle, onCreate,
}: {
  fileIds: string[];
  lists: ClientList[];
  onClose: () => void;
  onToggle: (listId: string, member: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  // A list "contains" the target when every targeted file is in it.
  const contains = (l: ClientList) => fileIds.every((id) => l.fileIds.includes(id));

  return (
    <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-extrabold tracking-tight text-ink-strong">Add to list</h2>
        <p className="mt-1 text-sm text-ink-muted">{fileIds.length === 1 ? '1 item' : `${fileIds.length} items`}</p>
        <ul className="mt-4 space-y-1 max-h-64 overflow-y-auto">
          {lists.length === 0 && <li className="text-sm text-ink-subtle py-2">No lists yet — create one below.</li>}
          {lists.map((l) => {
            const member = contains(l);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onToggle(l.id, !member)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <span className={`h-5 w-5 inline-flex items-center justify-center rounded border-2 ${member ? 'bg-accent border-accent text-accent-ink' : 'border-border'}`}>
                    {member && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                  <span className="flex-1 text-sm text-ink-strong">{l.name}</span>
                  <span className="text-xs text-ink-subtle tabular-nums">{l.fileIds.length}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <form
          onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await onCreate(name.trim()); setName(''); } }}
          className="mt-4 flex items-center gap-2 border-t border-border pt-4"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New list name…"
            className="flex-1 rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
          />
          <button type="submit" disabled={!name.trim()} className="rounded-md bg-accent border border-accent px-3 py-2 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50">
            Create
          </button>
        </form>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong">Done</button>
        </div>
      </div>
    </div>
  );
}

// Approved comments for a single item + a submit form. Fetches lazily per file.
function ItemComments({ slug, fileId }: { slug: string; fileId: string }) {
  const [items, setItems] = useState<ClientComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setPosted(false); setBody('');
    apiClient<{ comments: ClientComment[] }>(`/api/gallery/${slug}/comments?fileId=${fileId}`)
      .then((r) => { if (alive) setItems(r.comments); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug, fileId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true); setError(null);
    try {
      await jsonPost(`/api/gallery/${slug}/comments`, {
        body: body.trim(), fileId, ...(name.trim() ? { clientName: name.trim() } : {}),
      });
      setPosted(true); setBody('');
    } catch (err) {
      setError(err instanceof ApiError
        ? (err.status === 429 ? 'Slow down — too many comments.' : `Could not post (${err.status})`)
        : 'Network error.');
    } finally { setPending(false); }
  }

  return (
    <div className="p-5">
      <h3 className="text-xs font-extrabold tracking-[0.22em] uppercase text-ink-muted mb-3">Comments</h3>
      {loading ? (
        <p className="text-sm text-ink-subtle">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-subtle">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-surface-2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink-strong">{c.clientName || 'Guest'}</span>
                <span className="text-[11px] text-ink-subtle tabular-nums">{new Date(c.createdAt * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
              </div>
              <p className="mt-1 text-sm text-ink-muted whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {posted ? (
        <p className="mt-4 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink-muted">
          Submitted — it appears once the creator approves it.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Leave a comment on this item…"
            className="w-full rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors resize-y"
          />
          {error && <p className="text-sm font-semibold text-negative">{error}</p>}
          <button type="submit" disabled={pending || !body.trim()} className="inline-flex items-center rounded-md bg-accent border border-accent px-3.5 py-2 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50">
            {pending ? 'Posting…' : 'Post'}
          </button>
        </form>
      )}
    </div>
  );
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-4' : 'right-4'} h-11 w-11 inline-flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {side === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
