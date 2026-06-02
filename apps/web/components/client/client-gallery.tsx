'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { ClientAttachment, ClientFolder, ClientPhoto, MinimalGallery } from '@/lib/api/client-gallery';
import type { ClientComment } from '@/lib/api/comments';
import { CommentsSection } from '@/components/client/comments-section';

interface Props {
  gallery: MinimalGallery;
  photos: ClientPhoto[];
  folders: ClientFolder[];
  initialFavorites: string[];
  attachments: ClientAttachment[];
  comments: ClientComment[];
}

function formatBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClientGallery({ gallery, photos: allPhotos, folders, initialFavorites, attachments, comments }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites));
  const [folder, setFolder] = useState<string | null>(null); // null = all
  const [favsOnly, setFavsOnly] = useState(false);

  const photos = useMemo(() => {
    let list = folder === null ? allPhotos : allPhotos.filter((p) => p.folderId === folder);
    if (favsOnly) list = list.filter((p) => favorites.has(p.id));
    return list;
  }, [allPhotos, folder, favsOnly, favorites]);

  const canDownload = gallery.allowDownload && gallery.downloadMode !== 'none';
  const canFavorite = gallery.allowFavorites;

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
      body: JSON.stringify({ photoId: id }),
    }).catch(() => {
      // revert on failure
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFav) next.add(id); else next.delete(id);
        return next;
      });
    });
  }, [favorites, gallery.slug]);

  // Fire-and-forget view tracking, once per mount.
  useEffect(() => {
    void apiClient(`/api/gallery/${gallery.slug}/track-view`, { method: 'POST' }).catch(() => {});
  }, [gallery.slug]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(photos.map((p) => p.id))), [photos]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const downloadSelected = useCallback(() => {
    if (selected.size === 0) return;
    const ids = [...selected].join(',');
    // Attachment response — navigating triggers the download without leaving
    // the page. An anchor click keeps it out of the history stack.
    const a = document.createElement('a');
    a.href = `/api/gallery/${gallery.slug}/download?ids=${ids}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [selected, gallery.slug]);

  const close = useCallback(() => setOpen(null), []);
  const prev = useCallback(() => setOpen((i) => (i === null ? i : (i + photos.length - 1) % photos.length)), [photos.length]);
  const next = useCallback(() => setOpen((i) => (i === null ? i : (i + 1) % photos.length)), [photos.length]);

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, prev, next]);

  const eventLine = useMemo(() => [
    gallery.eventType,
    gallery.eventDate ? new Date(gallery.eventDate * 1000).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }) : null,
  ].filter(Boolean).join(' · '), [gallery.eventType, gallery.eventDate]);

  const allSelected = selected.size > 0 && selected.size === photos.length;

  return (
    <main className="min-h-dvh bg-bg pb-24">
      {/* Cover */}
      <header className="relative">
        {gallery.coverPhotoId ? (
          <div className="relative h-[55vh] min-h-80 w-full overflow-hidden bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/img/${gallery.id}/${gallery.coverPhotoId}/preview`} alt="" className="h-full w-full object-cover" />
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

      {/* Folder nav */}
      {folders.length > 0 && (
        <nav className="px-4 sm:px-8 pt-6 flex flex-wrap items-center gap-2">
          <FolderTab active={folder === null} onClick={() => { setFolder(null); setOpen(null); }} label="All" />
          {folders.map((f) => (
            <FolderTab key={f.id} active={folder === f.id} onClick={() => { setFolder(f.id); setOpen(null); }} label={f.name} />
          ))}
        </nav>
      )}

      {/* Toolbar */}
      {(canDownload || canFavorite) && allPhotos.length > 0 && (
        <div className="px-4 sm:px-8 pt-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="text-sm text-ink-muted tabular-nums">
              {photos.length} photo{photos.length !== 1 ? 's' : ''}
            </p>
            {canFavorite && (
              <button
                type="button"
                onClick={() => setFavsOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  favsOnly ? 'bg-accent border-accent text-accent-ink' : 'bg-surface border-border text-ink-muted hover:text-ink-strong hover:border-border-strong'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 10 6c-2.5 4.4-10 9-10 9Z" /></svg>
                Favorites
                <span className="tabular-nums opacity-70">{favorites.size}</span>
              </button>
            )}
          </div>
          {canDownload && (
            <button
              type="button"
              onClick={allSelected ? clearSelection : selectAll}
              className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong"
            >
              {allSelected ? 'Clear selection' : 'Select all'}
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      <section className="px-4 sm:px-8 py-6">
        {photos.length === 0 ? (
          <p className="text-center text-sm text-ink-muted py-16">No photos in this gallery yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {photos.map((p, i) => {
              const isSelected = selected.has(p.id);
              return (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md bg-surface-sunken">
                  <button type="button" onClick={() => setOpen(i)} className="block h-full w-full focus-visible:outline-none">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.thumbUrl}
                      alt=""
                      loading="lazy"
                      className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${isSelected ? 'brightness-90' : ''}`}
                    />
                  </button>

                  {canDownload && (
                    <button
                      type="button"
                      onClick={() => toggleSelect(p.id)}
                      aria-pressed={isSelected}
                      aria-label={isSelected ? 'Deselect photo' : 'Select photo'}
                      className={`absolute top-2 left-2 h-7 w-7 inline-flex items-center justify-center rounded-full border-2 transition-all ${
                        isSelected
                          ? 'bg-accent border-accent text-accent-ink opacity-100'
                          : 'bg-black/30 border-white/80 text-transparent opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  )}

                  {canFavorite && (
                    <button
                      type="button"
                      onClick={() => toggleFavorite(p.id)}
                      aria-pressed={favorites.has(p.id)}
                      aria-label={favorites.has(p.id) ? 'Remove favorite' : 'Add favorite'}
                      className={`absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-full transition-all ${
                        favorites.has(p.id)
                          ? 'bg-white/90 text-accent-dark opacity-100'
                          : 'bg-black/30 text-white opacity-0 group-hover:opacity-100 hover:bg-black/50'
                      }`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill={favorites.has(p.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 21s-7.5-4.6-10-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 10 6c-2.5 4.4-10 9-10 9Z" />
                      </svg>
                    </button>
                  )}

                  {isSelected && <div className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-accent rounded-md" />}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Files / attachments */}
      {attachments.length > 0 && (
        <section className="px-4 sm:px-8 pb-10">
          <h2 className="text-xs font-extrabold tracking-[0.22em] uppercase text-ink-muted mb-4">Files</h2>
          <ul className="space-y-2 max-w-2xl">
            {attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/gallery/${gallery.slug}/attachments/${a.id}/download`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-subtle shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-ink-strong truncate">{a.filename}</span>
                    {a.description && <span className="block text-xs text-ink-muted truncate">{a.description}</span>}
                  </span>
                  <span className="text-xs tabular-nums text-ink-subtle shrink-0">{formatBytes(a.fileSize)}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted shrink-0">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Comments */}
      {gallery.allowComments && <CommentsSection slug={gallery.slug} initialComments={comments} />}

      {/* Selection action bar */}
      {canDownload && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-ink-strong tabular-nums">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={clearSelection} className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong">
              Clear
            </button>
            <button
              type="button"
              onClick={downloadSelected}
              className="inline-flex items-center gap-2 rounded-md bg-accent border border-accent px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download {selected.size}
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {open !== null && photos[open] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={close}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[open].previewUrl} alt="" className="max-h-[90vh] max-w-[92vw] object-contain" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={close} aria-label="Close" className="absolute top-4 right-4 h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          {photos.length > 1 && (
            <>
              <NavButton side="left" onClick={(e) => { e.stopPropagation(); prev(); }} />
              <NavButton side="right" onClick={(e) => { e.stopPropagation(); next(); }} />
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs tabular-nums text-white/80">
                {open + 1} / {photos.length}
              </span>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function FolderTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'bg-surface-strong text-ink-inverse border-surface-strong'
          : 'bg-surface text-ink-muted border-border hover:text-ink-strong hover:border-border-strong'
      }`}
    >
      {label}
    </button>
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
