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
import type { CommentScope } from "@/lib/api/comments";
import type { ClientList } from "@/lib/api/lists";
import { useRangeSelect } from "@/hooks/use-range-select";
import { useDragSelect } from "@/hooks/use-drag-select";
import { useCoverGate } from "@/hooks/use-cover-gate";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/lib/toast";
import { confirmDialog, promptDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronLeft,
  Download,
  Heart,
  ImageIcon,
  Zip,
} from "@/components/ui/icons";
import { AlbumsLanding, type AlbumItem } from "./albums-landing";
import { GalleryCover } from "./gallery-cover";
import { GalleryTab } from "./gallery-tab";
import { GalleryGrid } from "./gallery-grid";
import { Lightbox } from "./lightbox";
import { SelectionBar } from "./selection-bar";
import { EmailModal } from "./email-modal";
import { ListPickerModal } from "./list-picker-modal";
import { DownloadModal } from "./download-modal";
import { ItemActionSheet } from "./item-action-sheet";
import { ListActionSheet } from "./list-action-sheet";
import { ItemComments } from "./item-comments";

interface Props {
  gallery: MinimalGallery;
  folders: ClientFolder[];
  files: ClientFile[];
  initialFavorites: string[];
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

  // Selection mode (declared early so the cover gate can stand down while it's
  // active — otherwise the reveal pull fights drag-to-select at the gallery top).
  const [selectionMode, setSelectionMode] = useState(false);

  // The cover is a full-screen overlay above the gallery that tracks the gesture
  // live and settles cleanly. Deep-linking to a collection skips it. Entering is
  // easy; coming back takes a deliberate hard pull (see useCoverGate).
  const {
    shown: coverShown,
    progress: coverProgress,
    dragging: coverDragging,
    dismiss,
  } = useCoverGate(!initialCollection, { disabled: selectionMode });
  const enterGallery = useCallback(() => {
    dismiss();
    window.scrollTo({ top: 0 });
  }, [dismiss]);
  // Pin the page at the gallery top while the cover overlay is up.
  useEffect(() => {
    document.body.style.overflow = coverShown ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [coverShown]);

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

  // 'collections' nav shows an albums landing you drill into; `atLanding` is the
  // top-level grid-of-albums state (no specific collection open).
  const collectionsMode = gallery.navStyle === "collections";
  const [atLanding, setAtLanding] = useState(
    collectionsMode && !initialCollection,
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
  // Favorites that actually exist in this gallery's delivered files — the raw
  // set can hold ids for since-deleted/hidden files, so don't trust its size.
  const favoriteCount = useMemo(
    () => allFiles.reduce((n, f) => (favorites.has(f.id) ? n + 1 : n), 0),
    [allFiles, favorites],
  );

  // Selection (shift-range) + drag-to-select share the same anchor.
  const { selected, setSelected, toggle, clear, selectAll, anchorRef } =
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
      setAtLanding(false);
      setOpenId(null);
      clear();
      // On the bare-slug domain (gallery.chidsism.com/:slug/...) we keep the
      // URL bar /:slug/:view; on the canonical domain it stays /g/:slug/:view.
      const cleanRoot =
        window.location.pathname.split("/").filter(Boolean)[0] !== "g";
      const prefix = cleanRoot ? "" : "/g";
      window.history.pushState(
        null,
        "",
        `${prefix}/${gallery.slug}/${viewSlug(v)}`,
      );
      window.scrollTo({ top: 0 }); // each collection starts at the gallery top
    },
    [gallery.slug, viewSlug, clear],
  );

  // Back to the albums landing (collections nav).
  const goLanding = useCallback(() => {
    setAtLanding(true);
    setOpenId(null);
    setSelectionMode(false);
    clear();
    window.history.pushState(null, "", `/g/${gallery.slug}`);
    window.scrollTo({ top: 0 });
  }, [gallery.slug, clear]);

  // Album cards for the collections landing.
  const collectionAlbums = useMemo<AlbumItem[]>(
    () =>
      folders.map((f) => {
        const fs = allFiles.filter((x) => x.folderId === f.id);
        return {
          key: f.id,
          label: f.name,
          count: fs.length,
          peek: fs.slice(0, 4),
          onOpen: () => switchView({ kind: "folder", id: f.id }),
        };
      }),
    [folders, allFiles, switchView],
  );
  const listAlbums = useMemo<AlbumItem[]>(() => {
    const arr: AlbumItem[] = [];
    if (canFavorite && favoriteCount > 0) {
      const fs = allFiles.filter((f) => favorites.has(f.id));
      arr.push({
        key: "__fav__",
        label: "Favorites",
        favorite: true,
        count: fs.length,
        peek: fs.slice(0, 4),
        onOpen: () => switchView({ kind: "favorites" }),
      });
    }
    for (const l of lists) {
      const ids = new Set(l.fileIds);
      const fs = allFiles.filter((f) => ids.has(f.id));
      arr.push({
        key: l.id,
        label: l.name,
        count: l.fileIds.length,
        peek: fs.slice(0, 4),
        onOpen: () => switchView({ kind: "list", id: l.id }),
      });
    }
    return arr;
  }, [lists, allFiles, favorites, favoriteCount, canFavorite, switchView]);

  // Options + value for the in-collection "switch collection" Select.
  const viewKey = (v: View) =>
    v.kind === "favorites" ? "fav" : `${v.kind === "list" ? "l" : "f"}:${v.id}`;
  const collectionOptions = useMemo(() => {
    const opts = folders.map((f) => ({
      value: `f:${f.id}`,
      label: f.name,
      group: "Collections",
    }));
    if (canFavorite && favoriteCount > 0)
      opts.push({ value: "fav", label: "Favorites", group: "Your lists" });
    for (const l of lists)
      opts.push({ value: `l:${l.id}`, label: l.name, group: "Your lists" });
    return opts;
  }, [folders, lists, canFavorite, favoriteCount]);
  const selectCollection = (key: string) => {
    if (key === "fav") switchView({ kind: "favorites" });
    else if (key.startsWith("l:"))
      switchView({ kind: "list", id: key.slice(2) });
    else switchView({ kind: "folder", id: key.slice(2) });
  };

  // Keep the view in sync with browser back/forward.
  useEffect(() => {
    const onPop = () => {
      const parts = window.location.pathname.split("/").filter(Boolean);
      // /g/:slug/:view (canonical) vs /:slug/:view (gallery.chidsism.com).
      const seg = (parts[0] === "g" ? parts[2] : parts[1]) ?? null;
      const resolved = resolveCollection(seg);
      // No segment in collections nav = back at the albums landing.
      if (collectionsMode) setAtLanding(!resolved);
      setView(
        resolved ??
          (folders[0]
            ? { kind: "folder", id: folders[0].id }
            : { kind: "favorites" }),
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [resolveCollection, folders, collectionsMode]);

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
        toast.success(`Created list “${l.name}”`);
        return l;
      } catch {
        toast.error("Couldn’t create that list. Try again.");
        return null;
      }
    },
    [gallery.slug],
  );

  const deleteList = useCallback(
    (id: string) => {
      const removed = lists.find((l) => l.id === id);
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
      })
        .then(() => {
          if (removed) toast.success(`Deleted list “${removed.name}”`);
        })
        .catch(() => {
          toast.error("Couldn’t delete that list.");
        });
    },
    [gallery.slug, folders, lists],
  );

  const renameList = useCallback(
    (id: string, name: string) => {
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
      void postJson(
        `/api/gallery/${gallery.slug}/lists/${id}`,
        { name },
        "PATCH",
      )
        .then(() => toast.success(`Renamed list to “${name}”`))
        .catch(() => toast.error("Couldn’t rename that list."));
    },
    [gallery.slug],
  );

  const setMembership = useCallback(
    (listId: string, fileIds: string[], member: boolean) => {
      const list = lists.find((l) => l.id === listId);
      const listName = list?.name ?? "list";
      // Only count the changes that actually mutate state — re-adding an item
      // already in the list shouldn't claim "1 added".
      const existing = new Set(list?.fileIds ?? []);
      const changed = member
        ? fileIds.filter((id) => !existing.has(id))
        : fileIds.filter((id) => existing.has(id));

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
      const ops = fileIds.map((fid) =>
        member
          ? postJson(`/api/gallery/${gallery.slug}/lists/${listId}/items`, {
              fileId: fid,
            })
          : apiClient(
              `/api/gallery/${gallery.slug}/lists/${listId}/items/${fid}`,
              { method: "DELETE" },
            ),
      );
      const noun = (n: number) => (n === 1 ? "item" : "items");
      if (changed.length > 0) {
        Promise.allSettled(ops).then((results) => {
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed === 0) {
            toast.success(
              `${changed.length} ${noun(changed.length)} ${member ? "added to" : "removed from"} “${listName}”`,
            );
          } else if (failed < ops.length) {
            toast.error(
              `${ops.length - failed} of ${ops.length} ${noun(ops.length)} ${member ? "added to" : "removed from"} “${listName}”`,
            );
          } else {
            toast.error(`Couldn’t update “${listName}”. Try again.`);
          }
        });
      }
    },
    [gallery.slug, lists],
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
      toast.info("Preparing download…");
      downloadViaAnchor(`/api/gallery/${gallery.slug}/download?${qs}`);
    },
    [gallery.slug],
  );

  const downloadSelected = useCallback(() => {
    if (selected.size === 0) return;
    triggerDownload(`ids=${[...selected].join(",")}`);
  }, [selected, triggerDownload]);

  // Download picker (multi-set + favorites → one ZIP).
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadPicked = useCallback(
    (folderIds: string[], favs: boolean, listFileIds: string[]) => {
      const parts: string[] = [];
      if (folderIds.length) parts.push(`folderIds=${folderIds.join(",")}`);
      if (favs) parts.push("favorites=1");
      if (listFileIds.length) parts.push(`ids=${listFileIds.join(",")}`);
      if (parts.length === 0) return;
      triggerDownload(parts.join("&"));
      setDownloadOpen(false);
    },
    [triggerDownload],
  );

  // Photos + videos among the current selection — drives "Save to Photos"
  // (the iOS share sheet writes both to the camera roll).
  const selectedImages = useMemo(
    () =>
      files.filter(
        (f) => selected.has(f.id) && (f.type === "image" || f.type === "video"),
      ),
    [files, selected],
  );
  // Whether the current collection / selection is entirely save-to-Photos
  // eligible (images + videos, no audio/docs) — drives the top media action.
  const isMedia = (f: ClientFile) => f.type === "image" || f.type === "video";
  const collectionAllMedia = files.length > 0 && files.every(isMedia);
  const selectionAllMedia =
    selected.size > 0 && selectedImages.length === selected.size;

  // Save photos/videos to the camera roll via the Web Share sheet. Fetches each
  // as a File, then shares. Falls back to the ZIP download when sharing files
  // isn't supported or the fetch is blocked.
  const sharePhotos = useCallback(
    async (imgs: ClientFile[]) => {
      if (imgs.length === 0 || savingPhotos) return;
      setSavingPhotos(true);
      const toastId = toast.loading("Preparing to save to Photos…");
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
          toast.update(toastId, {
            kind: "info",
            message: "Opening share sheet…",
          });
          await nav.share({ files: fileObjs });
          toast.update(toastId, {
            kind: "success",
            message: `Saved ${imgs.length} ${imgs.length === 1 ? "item" : "items"}`,
            duration: 3000,
          });
        } else {
          toast.update(toastId, {
            kind: "error",
            message: "Couldn’t save to Photos — downloading as ZIP",
            duration: 5000,
          });
          triggerDownload(`ids=${imgs.map((f) => f.id).join(",")}`);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User dismissed the share sheet — quietly close the toast.
          toast.dismiss(toastId);
        } else {
          toast.update(toastId, {
            kind: "error",
            message: "Couldn’t save to Photos — downloading as ZIP",
            duration: 5000,
          });
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

  // Explicit selection mode (Apple-Photos-style): checkboxes appear, tapping a
  // tile toggles it. Entered via the Select button or long-press; Done exits.
  const enterSelection = useCallback(
    (id?: string) => {
      setSelectionMode(true);
      if (id) toggle(id, false);
    },
    [toggle],
  );
  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    clear();
  }, [clear]);

  // Deselecting the last item (one at a time) drops out of selection mode.
  // Tracked with a flag so entering empty (Select button) doesn't immediately
  // exit; `suppressExit` lets "Deselect all" clear without leaving.
  const hadSelection = useRef(false);
  const suppressExit = useRef(false);
  useEffect(() => {
    if (!selectionMode) {
      hadSelection.current = false;
      suppressExit.current = false;
      return;
    }
    if (selected.size > 0) hadSelection.current = true;
    else if (hadSelection.current && !suppressExit.current)
      setSelectionMode(false);
    suppressExit.current = false;
  }, [selected, selectionMode]);
  const deselectAll = useCallback(() => {
    suppressExit.current = true;
    clear();
  }, [clear]);
  const allSelected = files.length > 0 && selected.size === files.length;

  // Switching the active set/collection exits selection mode + clears it.
  useEffect(() => {
    setSelectionMode(false);
    clear();
  }, [view, clear]);
  const bulkFavorite = useCallback(() => {
    if (selected.size === 0) return;
    requireEmail(() => {
      // All already favorited → unfavorite the selection; otherwise favorite it.
      const allFav = [...selected].every((id) => favorites.has(id));
      for (const id of selected) {
        if (allFav ? favorites.has(id) : !favorites.has(id)) toggleFavorite(id);
      }
    });
  }, [selected, favorites, requireEmail, toggleFavorite]);

  // Long-press quick-action menu target.
  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheetFile = sheetId ? allFiles.find((f) => f.id === sheetId) : null;
  const [listMenuId, setListMenuId] = useState<string | null>(null);
  const listMenu = listMenuId ? lists.find((l) => l.id === listMenuId) : null;

  // When viewing a list, expose quick removal of items from it.
  const currentListId = view.kind === "list" ? view.id : null;
  const removeFromList = useCallback(
    (ids: string[]) => {
      if (currentListId) setMembership(currentListId, ids, false);
    },
    [currentListId, setMembership],
  );

  // Comment scope follows the current view (set vs the private list/favorites
  // context). Drives the lightbox/grid comment widgets + which files show a badge.
  const commentScope: CommentScope = view.kind === "folder" ? "set" : view.kind;
  const commentListId = view.kind === "list" ? view.id : undefined;
  const [commentedIds, setCommentedIds] = useState<Set<string>>(new Set());
  const [commentsFileId, setCommentsFileId] = useState<string | null>(null);
  useEffect(() => {
    if (!gallery.allowComments) {
      setCommentedIds(new Set());
      return;
    }
    let alive = true;
    const qs = `scope=${commentScope}${commentListId ? `&listId=${commentListId}` : ""}`;
    apiClient<{ fileIds: string[] }>(
      `/api/gallery/${gallery.slug}/comment-flags?${qs}`,
    )
      .then((r) => {
        if (alive) setCommentedIds(new Set(r.fileIds));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Refetch when the lightbox/expand modal closes (a comment may have changed).
  }, [
    gallery.slug,
    gallery.allowComments,
    commentScope,
    commentListId,
    email,
    openId,
    commentsFileId,
  ]);

  const gridMode = gallery.layout === "grid";
  const emptyText =
    view.kind === "list"
      ? "This list is empty."
      : view.kind === "favorites"
        ? "No favorites yet."
        : "Nothing in this folder yet.";

  return (
    <main className="min-h-dvh bg-bg pb-24">
      <GalleryCover
        gallery={gallery}
        progress={coverProgress}
        dragging={coverDragging}
        onDismiss={enterGallery}
      />

      {/* Sticky chrome: a slim title bar with actions, then the tab row. */}
      <div className="sticky top-0 z-30 bg-bg">
        <div className="p-2 sm:p-8 flex items-center justify-between gap-3">
          {collectionsMode && !atLanding ? (
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={goLanding}
                aria-label="Back to collections"
                className="inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
              >
                <ChevronLeft size={24} />
              </button>
              <Select
                value={viewKey(view)}
                onChange={selectCollection}
                options={collectionOptions}
                className="w-44 sm:w-56"
              />
            </div>
          ) : (
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
          )}
          {allFiles.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              {(() => {
                const onClick = () => {
                  if (!selectionMode) enterSelection();
                  else if (allSelected) deselectAll();
                  else selectAll();
                };
                const label = !selectionMode
                  ? "Select"
                  : allSelected
                    ? "Deselect all"
                    : "Select all";
                // Album mode (inside any collection): a real button. Tabs mode:
                // the compact text affordance (when favorites/downloads enable it).
                if (collectionsMode && !atLanding) {
                  return (
                    <Button
                      variant="secondary"
                      onClick={onClick}
                      className="px-3.5 tracking-wider"
                    >
                      <Check size={16} />
                      {label}
                    </Button>
                  );
                }
                if ((canFavorite || canDownload) && !collectionsMode) {
                  return (
                    <button
                      type="button"
                      onClick={onClick}
                      className="text-sm font-bold tracking-wider text-ink-muted hover:text-ink-strong whitespace-nowrap"
                    >
                      {label}
                    </button>
                  );
                }
                return null;
              })()}
              {canDownload &&
                (() => {
                  // Inside a collection (or a selection) the action targets that
                  // collection/selection directly: Save to Photos on touch when
                  // it's all media (no camera roll on desktop, so desktop keeps
                  // the download), else a direct ZIP download. The Zip *picker*
                  // icon only appears at the landing/tabs top level.
                  const inCollection = collectionsMode && !atLanding;
                  const direct = selectionMode || inCollection;
                  const allMedia = selectionMode
                    ? selectionAllMedia
                    : collectionAllMedia;
                  if (direct && coarse && allMedia) {
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          sharePhotos(selectionMode ? selectedImages : files)
                        }
                        disabled={savingPhotos}
                        aria-label="Save to Photos"
                        title="Save to Photos"
                        className="inline-flex items-center gap-2 text-ink-muted hover:text-ink-strong disabled:opacity-50"
                      >
                        <ImageIcon size={24} />
                      </button>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectionMode) downloadSelected();
                        else if (inCollection)
                          triggerDownload(
                            `ids=${files.map((f) => f.id).join(",")}`,
                          );
                        else setDownloadOpen(true);
                      }}
                      disabled={selectionMode && selected.size === 0}
                      aria-label="Download"
                      title="Download"
                      className="inline-flex items-center gap-2 text-ink-muted hover:text-ink-strong disabled:opacity-50"
                    >
                      {direct ? <Download size={24} /> : <Zip size={24} />}
                    </button>
                  );
                })()}
            </div>
          )}
        </div>
        {!collectionsMode &&
          allFiles.length > 0 &&
          !(coarse && selectionMode) && (
            <nav className="px-2 sm:px-8 pb-2 sm:pb-4 flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]">
              {/* With favorites, surface them first + marked with a red heart. */}
              {canFavorite && favoriteCount > 0 && (
                <GalleryTab
                  active={view.kind === "favorites"}
                  onClick={() => switchView({ kind: "favorites" })}
                  label="Favorites"
                  count={favoriteCount}
                  icon={<Heart size={16} className="text-heart" />}
                />
              )}
              {folders.map((f) => (
                <GalleryTab
                  key={f.id}
                  active={view.kind === "folder" && view.id === f.id}
                  onClick={() => switchView({ kind: "folder", id: f.id })}
                  label={f.name}
                  count={folderCounts.get(f.id) ?? 0}
                />
              ))}
            </nav>
          )}
        {/* Client-made lists get their own row, distinct from the sets above. */}
        {!collectionsMode && lists.length > 0 && !(coarse && selectionMode) && (
          <nav className="px-2 sm:px-8 pb-2 sm:pb-4 flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]">
            {lists.map((l) => (
              <GalleryTab
                key={l.id}
                active={view.kind === "list" && view.id === l.id}
                onClick={() => switchView({ kind: "list", id: l.id })}
                label={l.name}
                count={l.fileIds.length}
                onMenu={() => setListMenuId(l.id)}
              />
            ))}
          </nav>
        )}
      </div>

      {/* Collections landing (albums grid you drill into) or the per-collection
          media grid. min-height fills the viewport so short content still
          scrolls the cover fully away. */}
      <section className="min-h-svh">
        {collectionsMode && atLanding ? (
          <AlbumsLanding
            collections={collectionAlbums}
            yourLists={listAlbums}
          />
        ) : (
          <div className="px-2 sm:px-8">
            <GalleryGrid
              files={files}
              gridMode={gridMode}
              selected={selected}
              favorites={favorites}
              commentedIds={gallery.allowComments ? commentedIds : new Set()}
              dragSelecting={dragSelecting}
              emptyText={emptyText}
              canDownload={canDownload}
              canFavorite={canFavorite}
              actionVis={actionVis}
              selectionMode={selectionMode}
              desktop={!coarse}
              suppressClickRef={suppressClickRef}
              onOpen={setOpenId}
              onToggleSelect={toggle}
              onBeginDragSelect={gridMode ? beginDragSelect : () => {}}
              onToggleFavorite={(id) => requireEmail(() => toggleFavorite(id))}
              onBulkFavorite={bulkFavorite}
              onLongPress={setSheetId}
              onOpenComments={setCommentsFileId}
            />
          </div>
        )}
      </section>

      {selectionMode && (
        <SelectionBar
          count={selected.size}
          canDownload={canDownload}
          canFavorite={canFavorite}
          allFavorited={
            selected.size > 0 && [...selected].every((id) => favorites.has(id))
          }
          showSavePhotos={coarse && selectedImages.length > 0}
          savingPhotos={savingPhotos}
          onDone={exitSelection}
          onFavorite={() => {
            bulkFavorite();
            exitSelection();
          }}
          onAddToList={() => {
            openPicker([...selected]);
            exitSelection();
          }}
          onRemoveFromList={
            currentListId
              ? () => {
                  removeFromList([...selected]);
                  exitSelection();
                }
              : undefined
          }
          onSavePhotos={() => {
            sharePhotos(selectedImages);
            exitSelection();
          }}
          onDownload={() => {
            downloadSelected();
            exitSelection();
          }}
        />
      )}

      {open && (
        <Lightbox
          file={open}
          index={openIndex}
          total={files.length}
          slug={gallery.slug}
          allowComments={gallery.allowComments}
          commentScope={commentScope}
          commentListId={commentListId}
          email={email}
          onRequireEmail={() => requireEmail(() => {})}
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

      {downloadOpen && (
        <DownloadModal
          folders={folders}
          folderCounts={folderCounts}
          lists={lists}
          canFavorite={canFavorite}
          favoritesCount={favoriteCount}
          onClose={() => setDownloadOpen(false)}
          onDownload={downloadPicked}
        />
      )}

      {sheetFile && (
        <ItemActionSheet
          file={sheetFile}
          canDownload={canDownload}
          canFavorite={canFavorite}
          coarse={coarse}
          isFavorite={favorites.has(sheetFile.id)}
          onSelect={() => enterSelection(sheetFile.id)}
          onFavorite={() => requireEmail(() => toggleFavorite(sheetFile.id))}
          onAddToList={() => openPicker([sheetFile.id])}
          onRemoveFromList={
            currentListId ? () => removeFromList([sheetFile.id]) : undefined
          }
          onDownload={() => triggerDownload(`ids=${sheetFile.id}`)}
          onShare={() => sharePhotos([sheetFile])}
          onClose={() => setSheetId(null)}
        />
      )}

      {listMenu && (
        <ListActionSheet
          name={listMenu.name}
          onRename={async () => {
            const next = (
              await promptDialog({
                title: "Rename list",
                label: "List name",
                defaultValue: listMenu.name,
                confirmLabel: "Rename",
              })
            )?.trim();
            if (next && next !== listMenu.name) renameList(listMenu.id, next);
          }}
          onDelete={async () => {
            if (
              await confirmDialog({
                title: "Delete list",
                message: `Delete "${listMenu.name}"?`,
                confirmLabel: "Delete",
                danger: true,
              })
            )
              deleteList(listMenu.id);
          }}
          onClose={() => setListMenuId(null)}
        />
      )}

      {commentsFileId && (
        <Modal
          onClose={() => setCommentsFileId(null)}
          className="p-0 w-[min(92vw,26rem)]"
        >
          <ItemComments
            slug={gallery.slug}
            fileId={commentsFileId}
            scope={commentScope}
            listId={commentListId}
            email={email}
            onRequireEmail={() => requireEmail(() => {})}
          />
        </Modal>
      )}
      <Toaster />
    </main>
  );
}
