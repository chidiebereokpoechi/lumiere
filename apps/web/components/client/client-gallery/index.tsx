"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient, postJson } from "@/lib/api-client";
import { downloadViaAnchor } from "@/lib/download";
import { toSlug } from "@/lib/format";
import type {
  ClientFile,
  ClientFolder,
  MinimalGallery,
} from "@/lib/api/client-gallery";
import type { ClientComment } from "@/lib/api/comments";
import type { ClientList } from "@/lib/api/lists";
import { useRangeSelect } from "@/hooks/use-range-select";
import { useDragSelect } from "@/hooks/use-drag-select";
import { CommentsSection } from "@/components/client/comments-section";
import { confirmDialog } from "@/components/ui/dialog";
import { Download } from "@/components/ui/icons";
import { GalleryCover } from "./gallery-cover";
import { GalleryTab } from "./gallery-tab";
import { GalleryGrid } from "./gallery-grid";
import { Lightbox } from "./lightbox";
import { SelectionBar } from "./selection-bar";
import { EmailModal } from "./email-modal";
import { ListPickerModal } from "./list-picker-modal";

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

// The current view — a folder, favorites, or a list — selected from one tab
// row. Mutually exclusive, mirrored in the URL (/g/:slug/:collection) so it's
// deep-linkable and back/forward works.
type View =
  | { kind: "folder"; id: string }
  | { kind: "favorites" }
  | { kind: "list"; id: string };

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
  const fileIds = useMemo(() => files.map((f) => f.id), [files]);

  // Selection (shift-range) + drag-to-select share the same anchor.
  const { selected, setSelected, toggle, clear, anchorRef } =
    useRangeSelect(fileIds);
  const { beginDragSelect, dragSelecting, suppressClickRef } = useDragSelect({
    items: files,
    selected,
    setSelected,
    anchorRef,
  });

  const switchView = useCallback(
    (v: View) => {
      setView(v);
      setOpenId(null);
      clear();
      window.history.pushState(null, "", `/g/${gallery.slug}/${viewSlug(v)}`);
      scrollToGrid(false);
    },
    [gallery.slug, viewSlug, scrollToGrid, clear],
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

  useEffect(() => {
    void apiClient(`/api/gallery/${gallery.slug}/track-view`, {
      method: "POST",
    }).catch(() => {});
  }, [gallery.slug]);

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
      await postJson(`/api/gallery/${gallery.slug}/identify`, { email: value });
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
      void postJson(
        `/api/gallery/${gallery.slug}/favorite`,
        { fileId: id },
        wasFav ? "DELETE" : "POST",
      ).catch(() => {
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
        const l = (await postJson(`/api/gallery/${gallery.slug}/lists`, {
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
          void postJson(`/api/gallery/${gallery.slug}/lists/${listId}/items`, {
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

  // ---- Downloads ----
  const triggerDownload = useCallback(
    (qs: string) => {
      downloadViaAnchor(`/api/gallery/${gallery.slug}/download?${qs}`);
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

  // Photos + videos among the current selection — drives "Save to Photos"
  // (the iOS share sheet writes both to the camera roll).
  const selectedImages = useMemo(
    () =>
      files.filter(
        (f) => selected.has(f.id) && (f.type === "image" || f.type === "video"),
      ),
    [files, selected],
  );

  // Save photos/videos to the camera roll via the Web Share sheet. Fetches each
  // as a File, then shares. Falls back to the ZIP download when sharing files
  // isn't supported or the fetch is blocked.
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
            const fallbackType =
              f.type === "video" ? "video/mp4" : "image/jpeg";
            return new File([blob], f.filename || `${f.id}`, {
              type: blob.type || f.mimeType || fallbackType,
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

  // ---- Lightbox navigation ----
  const openIndex =
    openId === null ? -1 : files.findIndex((f) => f.id === openId);
  const open = openIndex >= 0 ? files[openIndex]! : null;
  const close = useCallback(() => setOpenId(null), []);
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

  // On touch, once a selection exists, tapping a tile toggles it instead of
  // opening the lightbox (and we hide the heart so the tile reads as selectable).
  const selecting = coarse && selected.size > 0;
  const gridMode = gallery.layout === "grid";
  const emptyText =
    view.kind === "list"
      ? "This list is empty."
      : view.kind === "favorites"
        ? "No favorites yet."
        : "Nothing in this folder yet.";

  return (
    <main className="min-h-dvh bg-bg pb-24">
      <GalleryCover gallery={gallery} onView={() => scrollToGrid()} />

      {/* Sticky chrome: a slim title bar with actions, then the tab row. */}
      <div ref={gridRef} className="sticky top-0 z-30 bg-bg">
        <div className="px-2 sm:px-8 h-12 sm:h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-[700] text-lg tracking-wider text-ink-strong">
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
                onClick={downloadView}
                aria-label="Download"
                title="Download these"
                className="inline-flex items-center gap-2 text-ink-muted hover:text-ink-strong"
              >
                <Download size={24} />
              </button>
            </div>
          )}
        </div>
        {allFiles.length > 0 && (
          <nav className="px-2 sm:px-8 pb-2 sm:pb-4 flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]">
            {folders.map((f) => (
              <GalleryTab
                key={f.id}
                active={view.kind === "folder" && view.id === f.id}
                onClick={() => switchView({ kind: "folder", id: f.id })}
                label={f.name}
                count={folderCounts.get(f.id) ?? 0}
              />
            ))}
            {canFavorite && (
              <GalleryTab
                active={view.kind === "favorites"}
                onClick={() => switchView({ kind: "favorites" })}
                label="Favorites"
                count={favorites.size}
              />
            )}
            {lists.map((l) => (
              <GalleryTab
                key={l.id}
                active={view.kind === "list" && view.id === l.id}
                onClick={() => switchView({ kind: "list", id: l.id })}
                label={l.name}
                count={l.fileIds.length}
                onDelete={async () => {
                  if (
                    await confirmDialog({
                      title: "Delete list",
                      message: `Delete "${l.name}"?`,
                      confirmLabel: "Delete",
                      danger: true,
                    })
                  )
                    deleteList(l.id);
                }}
              />
            ))}
          </nav>
        )}
      </div>

      {/* Edge-to-edge grid — minimal chrome, photo-forward. min-height fills the
          viewport so short galleries still scroll the cover fully away. */}
      <section ref={sectionRef} className="px-2 sm:px-8 min-h-svh">
        <GalleryGrid
          files={files}
          gridMode={gridMode}
          selected={selected}
          favorites={favorites}
          dragSelecting={dragSelecting}
          emptyText={emptyText}
          canDownload={canDownload}
          canFavorite={canFavorite}
          actionVis={actionVis}
          selecting={selecting}
          suppressClickRef={suppressClickRef}
          onOpen={setOpenId}
          onToggleSelect={toggle}
          onBeginDragSelect={beginDragSelect}
          onToggleFavorite={(id) => requireEmail(() => toggleFavorite(id))}
        />
      </section>

      {gallery.allowComments && (
        <CommentsSection
          slug={gallery.slug}
          initialComments={comments.filter((c) => !c.fileId)}
        />
      )}

      {selected.size > 0 && (
        <SelectionBar
          count={selected.size}
          canDownload={canDownload}
          showSavePhotos={coarse && selectedImages.length > 0}
          savingPhotos={savingPhotos}
          onClear={clear}
          onAddToList={() => openPicker([...selected])}
          onSavePhotos={() => sharePhotos(selectedImages)}
          onDownload={downloadSelected}
        />
      )}

      {open && (
        <Lightbox
          file={open}
          index={openIndex}
          total={files.length}
          slug={gallery.slug}
          allowComments={gallery.allowComments}
          canDownload={canDownload}
          canFavorite={canFavorite}
          coarse={coarse}
          isFavorite={favorites.has(open.id)}
          savingPhotos={savingPhotos}
          onClose={close}
          onStep={step}
          onToggleFavorite={() => requireEmail(() => toggleFavorite(open.id))}
          onAddToList={() => openPicker([open.id])}
          onShare={() => sharePhotos([open])}
        />
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
