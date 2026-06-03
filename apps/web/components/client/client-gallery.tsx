"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import justifiedLayout from "justified-layout";
import { apiClient, ApiError } from "@/lib/api-client";
import type {
  ClientFile,
  ClientFolder,
  MinimalGallery,
} from "@/lib/api/client-gallery";
import type { ClientComment } from "@/lib/api/comments";
import type { ClientList } from "@/lib/api/lists";
import { CommentsSection } from "@/components/client/comments-section";

interface Props {
  gallery: MinimalGallery;
  folders: ClientFolder[];
  files: ClientFile[];
  initialFavorites: string[];
  comments: ClientComment[];
  initialLists: ClientList[];
  initialEmail: string | null;
  initialCollection: string | null;
}

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// URL-safe slug from a folder/list name (favorites is fixed).
function toSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

function jsonPost(path: string, body: unknown, method = "POST") {
  return apiClient(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function ClientGallery({
  gallery,
  folders,
  files: allFiles,
  initialFavorites,
  comments,
  initialLists,
  initialEmail,
  initialCollection,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(initialFavorites),
  );

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
    const mq = window.matchMedia("(hover: none)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const actionVis = coarse
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100";

  // Cover acts as a full-screen intro; "View gallery" / switching folders scrolls
  // to the grid's start. `gridRef` is the sticky chrome (so scrollIntoView no-ops
  // once it's pinned); scroll the window to the section top minus the header.
  const gridRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const scrollToGrid = useCallback((smooth = true) => {
    const sec = sectionRef.current;
    const headerH = gridRef.current?.offsetHeight ?? 0;
    if (!sec) {
      gridRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
      return;
    }
    const top = Math.max(
      0,
      window.scrollY + sec.getBoundingClientRect().top - headerH,
    );
    window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, []);
  // Comments live behind a toggle in the lightbox to keep it uncluttered.
  const [showComments, setShowComments] = useState(false);

  // The current view — a folder, favorites, or a list — selected from one row.
  // Mutually exclusive: picking any one clears the others. The view is mirrored
  // in the URL (/g/:slug/:collection) so it's deep-linkable and back/forward works.
  type View =
    | { kind: "folder"; id: string }
    | { kind: "favorites" }
    | { kind: "list"; id: string };
  const defaultView: View = folders[0]
    ? { kind: "folder", id: folders[0].id }
    : { kind: "favorites" };
  const resolveCollection = useCallback(
    (seg: string | null): View | null => {
      if (!seg) return null;
      if (seg === "favorites")
        return gallery.allowFavorites ? { kind: "favorites" } : null;
      const folder = folders.find((f) => toSlug(f.name) === seg);
      if (folder) return { kind: "folder", id: folder.id };
      const list = lists.find((l) => toSlug(l.name) === seg);
      if (list) return { kind: "list", id: list.id };
      return null;
    },
    [folders, lists, gallery.allowFavorites],
  );
  const viewSlug = useCallback(
    (v: View): string => {
      if (v.kind === "favorites") return "favorites";
      if (v.kind === "list")
        return toSlug(lists.find((l) => l.id === v.id)?.name ?? "list");
      return toSlug(folders.find((f) => f.id === v.id)?.name ?? "folder");
    },
    [folders, lists],
  );

  const [view, setView] = useState<View>(
    () => resolveCollection(initialCollection) ?? defaultView,
  );
  const switchView = useCallback(
    (v: View) => {
      setView(v);
      setOpenId(null);
      setSelected(new Set());
      window.history.pushState(null, "", `/g/${gallery.slug}/${viewSlug(v)}`);
      scrollToGrid(false);
    },
    [gallery.slug, viewSlug, scrollToGrid],
  );

  // Keep the view in sync with browser back/forward.
  useEffect(() => {
    const onPop = () => {
      const seg =
        window.location.pathname.split("/").filter(Boolean)[2] ?? null;
      setView(
        resolveCollection(seg) ??
          (folders[0]
            ? { kind: "folder", id: folders[0].id }
            : { kind: "favorites" }),
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [resolveCollection, folders]);

  // Deep link straight to a collection lands at the grid, not the cover.
  useEffect(() => {
    if (initialCollection) scrollToGrid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canDownload = gallery.allowDownload && gallery.downloadMode !== "none";
  const canFavorite = gallery.allowFavorites;

  // Item count per folder (clients want to see how much is in each).
  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of allFiles)
      if (f.folderId) m.set(f.folderId, (m.get(f.folderId) ?? 0) + 1);
    return m;
  }, [allFiles]);

  const files = useMemo(() => {
    if (view.kind === "favorites")
      return allFiles.filter((f) => favorites.has(f.id));
    if (view.kind === "list") {
      const ids = new Set(lists.find((x) => x.id === view.id)?.fileIds ?? []);
      return allFiles.filter((f) => ids.has(f.id));
    }
    return allFiles.filter((f) => f.folderId === view.id);
  }, [allFiles, view, favorites, lists]);

  // Lightbox steps through every item, of any type.
  const openIndex =
    openId === null ? -1 : files.findIndex((f) => f.id === openId);

  // ---- Email gate ----
  // Favoriting and lists require the client to identify with an email. Gate the
  // action: if we have an email, run it; otherwise stash it and open the modal.
  const requireEmail = useCallback(
    (run: () => void) => {
      if (email) {
        run();
        return;
      }
      pendingRef.current = run;
      setEmailOpen(true);
    },
    [email],
  );

  const submitEmail = useCallback(
    async (value: string) => {
      await jsonPost(`/api/gallery/${gallery.slug}/identify`, { email: value });
      setEmail(value);
      setEmailOpen(false);
      const p = pendingRef.current;
      pendingRef.current = null;
      p?.();
    },
    [gallery.slug],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      const wasFav = favorites.has(id);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFav) next.delete(id);
        else next.add(id);
        return next;
      });
      void apiClient(`/api/gallery/${gallery.slug}/favorite`, {
        method: wasFav ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: id }),
      }).catch(() => {
        setFavorites((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(id);
          else next.delete(id);
          return next;
        });
      });
    },
    [favorites, gallery.slug],
  );

  // ---- List mutations ----
  const createList = useCallback(
    async (name: string): Promise<ClientList | null> => {
      try {
        const l = (await jsonPost(`/api/gallery/${gallery.slug}/lists`, {
          name,
        })) as ClientList;
        setLists((prev) => [...prev, l]);
        return l;
      } catch {
        return null;
      }
    },
    [gallery.slug],
  );

  const deleteList = useCallback(
    (id: string) => {
      setLists((prev) => prev.filter((l) => l.id !== id));
      setView((v) =>
        v.kind === "list" && v.id === id
          ? folders[0]
            ? { kind: "folder", id: folders[0].id }
            : { kind: "favorites" }
          : v,
      );
      void apiClient(`/api/gallery/${gallery.slug}/lists/${id}`, {
        method: "DELETE",
      }).catch(() => {});
    },
    [gallery.slug, folders],
  );

  const setMembership = useCallback(
    (listId: string, fileIds: string[], member: boolean) => {
      setLists((prev) =>
        prev.map((l) => {
          if (l.id !== listId) return l;
          const ids = new Set(l.fileIds);
          for (const fid of fileIds) {
            if (member) ids.add(fid);
            else ids.delete(fid);
          }
          return { ...l, fileIds: [...ids] };
        }),
      );
      for (const fid of fileIds) {
        if (member) {
          void jsonPost(`/api/gallery/${gallery.slug}/lists/${listId}/items`, {
            fileId: fid,
          }).catch(() => {});
        } else {
          void apiClient(
            `/api/gallery/${gallery.slug}/lists/${listId}/items/${fid}`,
            { method: "DELETE" },
          ).catch(() => {});
        }
      }
    },
    [gallery.slug],
  );

  const openPicker = useCallback(
    (fileIds: string[]) => {
      requireEmail(() => setPickerFiles(fileIds));
    },
    [requireEmail],
  );

  useEffect(() => {
    void apiClient(`/api/gallery/${gallery.slug}/track-view`, {
      method: "POST",
    }).catch(() => {});
  }, [gallery.slug]);

  // Shift-click selects the contiguous range from the last plain-clicked anchor
  // (additive — keeps the existing selection).
  const selectAnchor = useRef<string | null>(null);
  const toggleSelect = useCallback(
    (id: string, shift: boolean) => {
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
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selectAnchor.current = id;
        return next;
      });
    },
    [files],
  );

  const selectAll = useCallback(
    () => setSelected(new Set(files.map((f) => f.id))),
    [files],
  );
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Drag-to-select = a live shift-click: press a checkbox and drag to select the
  // contiguous range from the start tile to the tile under the pointer, added on
  // top of whatever was already selected. Moving back shrinks the range. A plain
  // tap falls through to toggleSelect.
  const dragRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    anchor: number;
    baseline: Set<string>;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragSelecting, setDragSelecting] = useState(false);
  const beginDragSelect = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (e.shiftKey) return; // let the click handler do range-select
      const anchor = files.findIndex((f) => f.id === id);
      if (anchor === -1) return;
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        anchor,
        baseline: new Set(selected),
      };
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        if (!d.moved) {
          if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return;
          d.moved = true;
          setDragSelecting(true);
        }
        const el = document.elementFromPoint(
          ev.clientX,
          ev.clientY,
        ) as HTMLElement | null;
        const fid = el?.closest<HTMLElement>("[data-fid]")?.dataset.fid;
        const cur = fid ? files.findIndex((f) => f.id === fid) : d.anchor;
        const end = cur === -1 ? d.anchor : cur;
        const [lo, hi] = d.anchor < end ? [d.anchor, end] : [end, d.anchor];
        const next = new Set(d.baseline);
        for (let i = lo; i <= hi; i++) next.add(files[i]!.id);
        setSelected(next);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        if (dragRef.current?.moved) {
          suppressClickRef.current = true;
          selectAnchor.current = id;
        }
        dragRef.current = null;
        setDragSelecting(false);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [selected, files],
  );

  const triggerDownload = useCallback(
    (qs: string) => {
      const a = document.createElement("a");
      a.href = `/api/gallery/${gallery.slug}/download?${qs}`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [gallery.slug],
  );

  const downloadSelected = useCallback(() => {
    if (selected.size === 0) return;
    triggerDownload(`ids=${[...selected].join(",")}`);
  }, [selected, triggerDownload]);

  // Download the whole current view (folder / favorites / list) without first
  // selecting every file in it.
  const downloadView = useCallback(() => {
    if (files.length === 0) return;
    if (view.kind === "folder") triggerDownload(`folderId=${view.id}`);
    else if (view.kind === "favorites") triggerDownload("scope=favorites");
    else triggerDownload(`ids=${files.map((f) => f.id).join(",")}`);
  }, [view, files, triggerDownload]);

  // Images among the current selection — drives the "Save to Photos" action.
  const selectedImages = useMemo(
    () => files.filter((f) => selected.has(f.id) && f.type === "image"),
    [files, selected],
  );

  // Save photos to the camera roll via the Web Share sheet (iOS: "Save N
  // Images"). Fetches each image as a File, then shares. Falls back to the ZIP
  // download when sharing files isn't supported or the fetch is blocked.
  const sharePhotos = useCallback(
    async (imgs: ClientFile[]) => {
      if (imgs.length === 0 || savingPhotos) return;
      setSavingPhotos(true);
      try {
        const fileObjs = await Promise.all(
          imgs.map(async (f) => {
            const res = await fetch(f.downloadUrl, { credentials: "include" });
            if (!res.ok) throw new Error("fetch_failed");
            const blob = await res.blob();
            return new File([blob], f.filename || `${f.id}.jpg`, {
              type: blob.type || "image/jpeg",
            });
          }),
        );
        const nav = navigator as Navigator & {
          canShare?: (d: ShareData) => boolean;
        };
        if (nav.canShare?.({ files: fileObjs }) && nav.share) {
          await nav.share({ files: fileObjs });
        } else {
          triggerDownload(`ids=${imgs.map((f) => f.id).join(",")}`);
        }
      } catch (err) {
        // AbortError = user dismissed the share sheet; ignore. Otherwise fall back.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          triggerDownload(`ids=${imgs.map((f) => f.id).join(",")}`);
        }
      } finally {
        setSavingPhotos(false);
      }
    },
    [savingPhotos, triggerDownload],
  );

  const saveToPhotos = useCallback(
    () => sharePhotos(selectedImages),
    [sharePhotos, selectedImages],
  );

  const close = useCallback(() => {
    setOpenId(null);
    setShowComments(false);
  }, []);
  const step = useCallback(
    (dir: number) => {
      setOpenId((cur) => {
        if (cur === null || files.length === 0) return cur;
        const i = files.findIndex((f) => f.id === cur);
        if (i === -1) return cur;
        return files[(i + dir + files.length) % files.length]!.id;
      });
    },
    [files],
  );

  useEffect(() => {
    if (openId === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, close, step]);

  // Swipe in the lightbox: left/right steps, a downward fling closes.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const s = touchStart.current;
      touchStart.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
        step(dx < 0 ? 1 : -1);
      else if (dy > 90 && dy > Math.abs(dx) * 1.5) close();
    },
    [step, close],
  );

  const eventLine = useMemo(
    () =>
      [
        gallery.eventType,
        gallery.eventDate
          ? new Date(gallery.eventDate * 1000).toLocaleDateString("en", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [gallery.eventType, gallery.eventDate],
  );

  const allSelected = selected.size > 0 && selected.size === files.length;
  const open = openIndex >= 0 ? files[openIndex] : null;
  // On touch, once a selection exists, tapping a tile toggles it instead of
  // opening the lightbox (and we hide the heart so the tile reads as selectable).
  const selecting = coarse && selected.size > 0;

  // Layout mode from the gallery setting: 'grid' packs justified rows (uniform
  // row height, edges flush); anything else keeps the masonry columns.
  const gridMode = gallery.layout === "grid";
  const measureRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    setGridW(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setGridW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Justified layout: image/video drive aspect; audio/file are square tiles.
  const justified = useMemo(() => {
    if (!gridMode || gridW <= 0) return null;
    const ratios = files.map((f) =>
      (f.type === "image" || f.type === "video") && f.width && f.height
        ? f.width / f.height
        : 1,
    );
    const target = gridW < 640 ? 220 : gridW < 1024 ? 300 : 360;
    return justifiedLayout(ratios, {
      containerWidth: gridW,
      targetRowHeight: target,
      boxSpacing: 8,
      containerPadding: 0,
    });
  }, [gridMode, gridW, files]);

  // Inner content of a tile (media + overlays). `fill` = the wrapper has a fixed
  // box (justified grid) so media covers it; otherwise media keeps natural ratio.
  const tileInner = (f: ClientFile, isSelected: boolean, fill: boolean) => (
    <>
      <button
        type="button"
        onClick={() => { if (selecting) toggleSelect(f.id, false); else setOpenId(f.id); }}
        className={`block w-full text-left focus-visible:outline-none ${fill ? "h-full" : ""}`}
      >
        {f.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={f.thumbUrl ?? ""}
            alt=""
            loading="lazy"
            style={!fill && f.width && f.height ? { aspectRatio: `${f.width} / ${f.height}` } : undefined}
            className={`block w-full object-cover transition-[filter] duration-300 ${fill ? "h-full" : "h-auto"} ${isSelected ? "brightness-90" : ""}`}
          />
        ) : f.type === "video" ? (
          <span className={`relative block w-full bg-black ${fill ? "h-full" : ""}`}>
            <video
              src={`${f.streamUrl ?? ""}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              className={`block w-full ${fill ? "h-full object-cover" : "h-auto"}`}
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="h-12 w-12 inline-flex items-center justify-center rounded-full bg-black/55 text-white">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
          </span>
        ) : (
          <span className={`flex w-full flex-col items-center justify-center gap-2 p-3 text-center ${fill ? "h-full" : "aspect-square"}`}>
            {f.type === "audio" ? (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            ) : (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><polyline points="14 2 14 8 20 8" /></svg>
            )}
            <span className="text-xs font-semibold text-ink-strong truncate max-w-full">{f.filename}</span>
            <span className="text-[11px] text-ink-subtle">{formatBytes(f.fileSize)}</span>
          </span>
        )}
      </button>

      {(canDownload || canFavorite) && (
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/35 to-transparent transition-opacity ${isSelected ? "opacity-100" : actionVis}`} />
      )}

      {canDownload && (
        <button
          type="button"
          onPointerDown={(e) => beginDragSelect(f.id, e)}
          onClick={(e) => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } toggleSelect(f.id, e.shiftKey); }}
          aria-pressed={isSelected}
          aria-label={isSelected ? "Deselect" : "Select"}
          style={{ touchAction: "none" }}
          className={`absolute top-2.5 left-2.5 h-7 w-7 inline-flex items-center justify-center rounded-full border-2 transition-all ${
            isSelected ? "bg-accent border-accent text-accent-ink opacity-100" : `border-white text-transparent ${actionVis}`
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </button>
      )}
      {canFavorite && !selecting && (
        <button
          type="button"
          onClick={() => requireEmail(() => toggleFavorite(f.id))}
          aria-pressed={favorites.has(f.id)}
          aria-label={favorites.has(f.id) ? "Remove favorite" : "Add favorite"}
          className={`absolute top-2.5 right-2.5 h-7 w-7 inline-flex items-center justify-center transition-all ${
            favorites.has(f.id) ? "text-white opacity-100 drop-shadow" : `text-white/90 drop-shadow ${actionVis}`
          }`}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill={favorites.has(f.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7.5-4.6-10-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 10 6c-2.5 4.4-10 9-10 9Z" /></svg>
        </button>
      )}
      {isSelected && <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-accent" />}
    </>
  );

  return (
    <main className="min-h-dvh bg-bg pb-24">
      {/* Cover — full-screen intro with a scroll cue. */}
      <header className="relative h-svh min-h-136 w-full overflow-hidden">
        {gallery.coverFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/img/${gallery.id}/${gallery.coverFileId}/preview`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-surface-sunken" />
        )}
        {gallery.coverFileId && (
          <div className="absolute inset-0 bg-black/35" />
        )}
        <div
          className={`relative h-full flex flex-col items-center justify-center text-center px-6 ${gallery.coverFileId ? "text-white" : "text-ink-strong"}`}
        >
          {eventLine && (
            <p className="text-xs font-bold uppercase tracking-[0.32em] opacity-90">
              {eventLine}
            </p>
          )}
          <h1 className="mt-4 text-5xl sm:text-6xl font-extrabold uppercase tracking-tight">
            {gallery.title}
          </h1>
          {gallery.subtitle && (
            <p className="mt-4 max-w-xl text-sm sm:text-base opacity-90">
              {gallery.subtitle}
            </p>
          )}
          <button
            type="button"
            onClick={() => scrollToGrid()}
            className={`mt-10 inline-flex items-center rounded-sm border px-10 py-3.5 text-xs font-bold uppercase tracking-[0.25em] transition-colors ${
              gallery.coverFileId
                ? "border-white/70 text-white hover:bg-white hover:text-black"
                : "border-border text-ink-strong hover:bg-surface-strong hover:text-ink-inverse hover:border-surface-strong"
            }`}
          >
            View gallery
          </button>
        </div>
      </header>

      {/* Sticky chrome: a slim title bar with actions, then the tab row. */}
      <div
        ref={gridRef}
        className="sticky top-0 z-30 bg-bg border-b border-border"
      >
        <div className="px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold uppercase tracking-wider text-ink-strong">
              {gallery.title}
            </p>
            {gallery.subtitle && (
              <p className="truncate text-sm text-ink-muted">
                {gallery.subtitle}
              </p>
            )}
          </div>
          {canDownload && files.length > 0 && (
            <div className="flex items-center gap-5 shrink-0">
              <button
                type="button"
                onClick={allSelected ? clearSelection : selectAll}
                className="text-sm font-bold uppercase tracking-wider text-ink-muted hover:text-ink-strong"
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
              <button
                type="button"
                onClick={downloadView}
                aria-label="Download"
                title="Download these"
                className="inline-flex items-center gap-2 text-ink-muted hover:text-ink-strong"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {allFiles.length > 0 && (
          <nav className="px-4 sm:px-8 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]">
            {folders.map((f) => (
              <Tab
                key={f.id}
                active={view.kind === "folder" && view.id === f.id}
                onClick={() => switchView({ kind: "folder", id: f.id })}
                label={f.name}
                count={folderCounts.get(f.id) ?? 0}
              />
            ))}
            {canFavorite && (
              <Tab
                active={view.kind === "favorites"}
                onClick={() => switchView({ kind: "favorites" })}
                label="Favorites"
                count={favorites.size}
              />
            )}
            {lists.map((l) => (
              <Tab
                key={l.id}
                active={view.kind === "list" && view.id === l.id}
                onClick={() => switchView({ kind: "list", id: l.id })}
                label={l.name}
                count={l.fileIds.length}
                onDelete={() => {
                  if (window.confirm(`Delete list "${l.name}"?`))
                    deleteList(l.id);
                }}
              />
            ))}
          </nav>
        )}
      </div>

      {/* Edge-to-edge masonry — minimal chrome, photo-forward. min-height fills
          the viewport so short galleries still scroll the cover fully away. */}
      <section ref={sectionRef} className="px-4 sm:px-8 pt-4 min-h-svh">
        <div ref={measureRef} className="w-full">
          {files.length === 0 ? (
            <p className="text-center text-sm text-ink-muted py-24">
              {view.kind === "list"
                ? "This list is empty."
                : view.kind === "favorites"
                  ? "No favorites yet."
                  : "Nothing in this folder yet."}
            </p>
          ) : gridMode && justified ? (
            // Justified rows — uniform row height, edges flush.
            <div
              className={`relative w-full ${dragSelecting ? "touch-none select-none" : ""}`}
              style={{ height: justified.containerHeight }}
            >
              {files.map((f, i) => {
                const box = justified.boxes[i];
                if (!box) return null;
                return (
                  <div
                    key={f.id}
                    data-fid={f.id}
                    className="group absolute overflow-hidden bg-surface-sunken"
                    style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
                  >
                    {tileInner(f, selected.has(f.id), true)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className={`columns-2 md:columns-3 xl:columns-4 gap-1 ${dragSelecting ? "touch-none select-none" : ""}`}
            >
              {files.map((f) => (
                <div
                  key={f.id}
                  data-fid={f.id}
                  className="group relative mb-1 break-inside-avoid overflow-hidden bg-surface-sunken"
                >
                  {tileInner(f, selected.has(f.id), false)}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {gallery.allowComments && (
        <CommentsSection
          slug={gallery.slug}
          initialComments={comments.filter((c) => !c.fileId)}
        />
      )}

      {/* Selection action bar — wraps + respects the iOS home-indicator inset */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-strong tabular-nums">
              {selected.size} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={clearSelection}
                className="px-2 py-2.5 text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => openPicker([...selected])}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm font-bold uppercase tracking-wider text-ink-strong hover:border-border-strong transition-colors"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
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
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  {savingPhotos
                    ? "Preparing…"
                    : `Save ${selectedImages.length} to Photos`}
                </button>
              )}
              {canDownload && (
                <button
                  type="button"
                  onClick={downloadSelected}
                  className="inline-flex items-center gap-2 rounded-md bg-accent border border-accent px-3.5 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download {selected.size}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — clean light surface, minimal icon bar, centered filename. */}
      {open && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col" onClick={close}>
          {/* Top bar */}
          <div
            className="shrink-0 flex items-center justify-between px-3 sm:px-5 h-14"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="h-10 w-10 -ml-1 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <div className="flex items-center gap-1">
              {canFavorite && (
                <button
                  type="button"
                  onClick={() => requireEmail(() => toggleFavorite(open.id))}
                  aria-label={
                    favorites.has(open.id) ? "Remove favorite" : "Add favorite"
                  }
                  className={`h-10 w-10 inline-flex items-center justify-center hover:text-ink-strong ${favorites.has(open.id) ? "text-accent-dark" : "text-ink-muted"}`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={favorites.has(open.id) ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 21s-7.5-4.6-10-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 10 6c-2.5 4.4-10 9-10 9Z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => openPicker([open.id])}
                aria-label="Add to list"
                className="h-10 w-10 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              {gallery.allowComments && (
                <button
                  type="button"
                  onClick={() => setShowComments((v) => !v)}
                  aria-label="Comments"
                  className={`h-10 w-10 inline-flex items-center justify-center hover:text-ink-strong ${showComments ? "text-ink-strong" : "text-ink-muted"}`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              )}
              {canDownload && coarse && open.type === "image" && (
                <button
                  type="button"
                  onClick={() => sharePhotos([open])}
                  disabled={savingPhotos}
                  aria-label="Save to Photos"
                  className="h-10 w-10 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong disabled:opacity-60"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                </button>
              )}
              {canDownload && (
                <a
                  href={open.downloadUrl}
                  aria-label="Download"
                  className="h-10 w-10 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          {/* Media */}
          <div
            className="relative flex-1 min-h-0 flex items-center justify-center px-4 sm:px-12 touch-pan-y"
            onClick={close}
            // Swipe only for stills/files — video & audio own their gestures.
            onTouchStart={open.type === "image" || open.type === "file" ? onTouchStart : undefined}
            onTouchEnd={open.type === "image" || open.type === "file" ? onTouchEnd : undefined}
          >
            <div
              className="max-h-full max-w-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {open.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={open.previewUrl ?? ""}
                  alt=""
                  className="max-h-[78svh] max-w-full object-contain"
                />
              ) : open.type === "video" ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={open.streamUrl ?? ""}
                  controls
                  autoPlay
                  className="max-h-[78svh] max-w-full"
                />
              ) : open.type === "audio" ? (
                <AudioPlayer
                  key={open.id}
                  src={open.streamUrl ?? ""}
                  title={open.filename}
                  subtitle={formatBytes(open.fileSize)}
                />
              ) : (
                <div className="w-[min(90vw,28rem)] rounded-lg border border-border bg-surface p-8 text-center">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mx-auto text-ink-muted"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <p className="mt-3 text-sm font-semibold text-ink-strong truncate">
                    {open.filename}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {formatBytes(open.fileSize)}
                  </p>
                </div>
              )}
            </div>
            {files.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(-1);
                  }}
                  aria-label="Previous"
                  className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(1);
                  }}
                  aria-label="Next"
                  className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Filename + position */}
          <div
            className="shrink-0 text-center pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-ink-muted tabular-nums truncate px-6">
              {open.filename}
              {files.length > 1
                ? `  ·  ${openIndex + 1} / ${files.length}`
                : ""}
            </p>
          </div>

          {/* Comments drawer (toggled) */}
          {gallery.allowComments && showComments && (
            <div
              className="absolute inset-x-0 bottom-0 z-10 max-h-[70svh] overflow-y-auto bg-surface border-t border-border rounded-t-xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:inset-x-auto sm:right-0 sm:top-14 sm:bottom-0 sm:w-96 sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l sm:shadow-none"
              onClick={(e) => e.stopPropagation()}
            >
              <ItemComments slug={gallery.slug} fileId={open.id} />
            </div>
          )}
        </div>
      )}

      {emailOpen && (
        <EmailModal
          onClose={() => {
            pendingRef.current = null;
            setEmailOpen(false);
          }}
          onSubmit={submitEmail}
        />
      )}

      {pickerFiles && (
        <ListPickerModal
          fileIds={pickerFiles}
          lists={lists}
          onClose={() => setPickerFiles(null)}
          onToggle={(listId, member) =>
            setMembership(listId, pickerFiles, member)
          }
          onCreate={async (name) => {
            const l = await createList(name);
            if (l) setMembership(l.id, pickerFiles, true);
          }}
        />
      )}
    </main>
  );
}

// Music-player-style audio surface: artwork, title, scrubber, transport.
function AudioPlayer({ src, title, subtitle }: { src: string; title: string; subtitle: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };
  const toggle = () => { const a = ref.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); };
  const seek = (v: number) => { const a = ref.current; if (a) { a.currentTime = v; setCur(v); } };
  const nudge = (d: number) => { const a = ref.current; if (a) seek(Math.min(dur || a.duration || 0, Math.max(0, a.currentTime + d))); };

  return (
    <div className="w-[min(92vw,24rem)] rounded-2xl border border-border bg-surface p-5 shadow-[0_8px_30px_rgba(0,0,0,0.10)]">
      <div className="aspect-square w-full rounded-xl overflow-hidden bg-linear-to-br from-accent/40 via-surface-sunken to-surface-strong flex items-center justify-center">
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-inverse/80">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      </div>

      <div className="mt-4 text-center">
        <p className="text-base font-bold text-ink-strong truncate">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-ink-subtle tabular-nums">{subtitle}</p>}
      </div>

      <input
        type="range"
        min={0}
        max={dur || 0}
        step={0.1}
        value={Math.min(cur, dur || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Seek"
        className="mt-4 w-full accent-accent"
      />
      <div className="flex justify-between text-[11px] text-ink-subtle tabular-nums">
        <span>{fmt(cur)}</span>
        <span>-{fmt(Math.max(0, (dur || 0) - cur))}</span>
      </div>

      <div className="mt-3 flex items-center justify-center gap-7">
        <button type="button" onClick={() => nudge(-15)} aria-label="Back 15 seconds" className="text-ink-muted hover:text-ink-strong">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 19 2 12 11 5 11 19" /><polyline points="22 19 13 12 22 5 22 19" /></svg>
        </button>
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="h-16 w-16 inline-flex items-center justify-center rounded-full bg-ink-strong text-ink-inverse hover:opacity-90 transition-opacity">
          {playing
            ? <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5"><path d="M8 5v14l11-7z" /></svg>}
        </button>
        <button type="button" onClick={() => nudge(15)} aria-label="Forward 15 seconds" className="text-ink-muted hover:text-ink-strong">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 19 22 12 13 5 13 19" /><polyline points="2 19 11 12 2 5 2 19" /></svg>
        </button>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={ref}
        src={src}
        autoPlay
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCur(ref.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDur(ref.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

// Plain text tab — a folder, favorites, or a list. Active gets an accent
// underline; list tabs reveal a delete affordance when active.
function Tab({
  active,
  onClick,
  label,
  count,
  onDelete,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  onDelete?: () => void;
}) {
  return (
    <span
      className={`group/tab shrink-0 inline-flex items-center gap-1.5 rounded-md border pl-4 ${onDelete ? "pr-2" : "pr-4"} py-2.5 text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
        active
          ? "bg-surface-strong text-ink-inverse border-surface-strong"
          : "bg-surface text-ink-muted border-border hover:bg-surface-2 hover:text-ink-strong hover:border-border-strong"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 min-w-0 focus-visible:outline-none"
      >
        <span className="truncate max-w-[42vw] sm:max-w-56">{label}</span>
        <span
          className={`tabular-nums text-xs ${active ? "text-ink-inverse/70" : "text-ink-subtle"}`}
        >
          {count}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete list"
          className={`inline-flex h-5 w-5 items-center justify-center ${active ? "text-ink-inverse/80 hover:text-ink-inverse" : "text-ink-subtle hover:text-negative"}`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

// Email gate. Shown the first time a client favorites or touches a list.
function EmailModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (email: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError("Enter a valid email.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(value.trim());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not save (${err.status})`
          : "Network error.",
      );
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-6"
      >
        <h2 className="text-lg font-extrabold tracking-tight text-ink-strong">
          Your email
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Enter your email to favorite items and build lists. The creator will
          see your selections.
        </p>
        <input
          type="email"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="you@example.com"
          className="mt-4 w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
        />
        {error && (
          <p className="mt-2 text-sm font-semibold text-negative">{error}</p>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center rounded-md bg-accent border border-accent px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50"
          >
            {pending ? "Saving…" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Toggle file(s) in/out of lists, or create a new list and add them.
function ListPickerModal({
  fileIds,
  lists,
  onClose,
  onToggle,
  onCreate,
}: {
  fileIds: string[];
  lists: ClientList[];
  onClose: () => void;
  onToggle: (listId: string, member: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  // A list "contains" the target when every targeted file is in it.
  const contains = (l: ClientList) =>
    fileIds.every((id) => l.fileIds.includes(id));

  return (
    <div
      className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-6"
      >
        <h2 className="text-lg font-extrabold tracking-tight text-ink-strong">
          Add to list
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {fileIds.length === 1 ? "1 item" : `${fileIds.length} items`}
        </p>
        <ul className="mt-4 space-y-1 max-h-64 overflow-y-auto">
          {lists.length === 0 && (
            <li className="text-sm text-ink-subtle py-2">
              No lists yet — create one below.
            </li>
          )}
          {lists.map((l) => {
            const member = contains(l);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onToggle(l.id, !member)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <span
                    className={`h-5 w-5 inline-flex items-center justify-center rounded border-2 ${member ? "bg-accent border-accent text-accent-ink" : "border-border"}`}
                  >
                    {member && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 text-sm text-ink-strong">
                    {l.name}
                  </span>
                  <span className="text-xs text-ink-subtle tabular-nums">
                    {l.fileIds.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim()) {
              await onCreate(name.trim());
              setName("");
            }
          }}
          className="mt-4 flex items-center gap-2 border-t border-border pt-4"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New list name…"
            className="flex-1 rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-accent border border-accent px-3 py-2 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50"
          >
            Create
          </button>
        </form>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-strong"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Approved comments for a single item + a submit form. Fetches lazily per file.
function ItemComments({ slug, fileId }: { slug: string; fileId: string }) {
  const [items, setItems] = useState<ClientComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPosted(false);
    setBody("");
    apiClient<{ comments: ClientComment[] }>(
      `/api/gallery/${slug}/comments?fileId=${fileId}`,
    )
      .then((r) => {
        if (alive) setItems(r.comments);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, fileId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    setError(null);
    try {
      await jsonPost(`/api/gallery/${slug}/comments`, {
        body: body.trim(),
        fileId,
        ...(name.trim() ? { clientName: name.trim() } : {}),
      });
      setPosted(true);
      setBody("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 429
            ? "Slow down — too many comments."
            : `Could not post (${err.status})`
          : "Network error.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-5">
      <h3 className="text-xs font-extrabold tracking-[0.22em] uppercase text-ink-muted mb-3">
        Comments
      </h3>
      {loading ? (
        <p className="text-sm text-ink-subtle">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-subtle">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border bg-surface-2 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink-strong">
                  {c.clientName || "Guest"}
                </span>
                <span className="text-[11px] text-ink-subtle tabular-nums">
                  {new Date(c.createdAt * 1000).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-muted whitespace-pre-wrap">
                {c.body}
              </p>
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
          {error && (
            <p className="text-sm font-semibold text-negative">{error}</p>
          )}
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="inline-flex items-center rounded-md bg-accent border border-accent px-3.5 py-2 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50"
          >
            {pending ? "Posting…" : "Post"}
          </button>
        </form>
      )}
    </div>
  );
}
