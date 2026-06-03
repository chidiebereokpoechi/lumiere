"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { apiErrorMessage, mutateJson } from "@/lib/api-client";
import type { GalleryFile } from "@/lib/api/files";

export type SortMode =
  | "manual"
  | "name-asc"
  | "name-desc"
  | "newest"
  | "oldest"
  | "size-desc";

interface DragInfo {
  offsetX: number;
  offsetY: number;
  w: number;
  h: number;
  startX: number;
  startY: number;
}

/**
 * Pointer-based sortable for the admin media grid. Owns the display `order` of
 * the active folder, FLIP-animates reflow on reorder, and drives drag gestures:
 * reorder within a folder (single or multi-selected block), drop onto another
 * set's chip to move, or drop on the "New set" target. Also applies + persists
 * the sort modes. `orderRef` mirrors `order` for callers that read it during a
 * drag (e.g. range-select).
 */
export function useTileSortable({
  galleryId,
  files,
  activeFolder,
  selected,
  setSelected,
  setFiles,
  refreshFiles,
  moveFiles,
  createFolderAndMove,
  canDrag,
  orderRef,
  onError,
}: {
  galleryId: string;
  files: GalleryFile[];
  activeFolder: string;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  setFiles: Dispatch<SetStateAction<GalleryFile[]>>;
  refreshFiles: () => void;
  moveFiles: (ids: string[], folderId: string) => void;
  createFolderAndMove: (ids: string[]) => void;
  canDrag: boolean;
  orderRef: MutableRefObject<string[]>;
  onError: (msg: string) => void;
}) {
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [dropNew, setDropNew] = useState(false);
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("manual");

  const dragIdRef = useRef<string | null>(null);
  const dragPayload = useRef<string[]>([]);
  const draggingIdsRef = useRef<Set<string>>(new Set());
  const dropFolderRef = useRef<string | null>(null);
  const dropNewRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragInfo = useRef<DragInfo | null>(null);

  const tileNodes = useRef(new Map<string, HTMLElement>());
  // Page-relative positions (viewport rect + scroll). Storing them scroll-aware
  // means scrolling between renders doesn't register as movement — otherwise the
  // FLIP would animate every tile by the scroll delta (a visible stagger).
  const prevRects = useRef(new Map<string, { left: number; top: number }>());
  const registerTile = useCallback((id: string, node: HTMLElement | null) => {
    if (node) tileNodes.current.set(id, node);
    else tileNodes.current.delete(id);
  }, []);

  // Rebuild the order from persisted positions when the file set / folder
  // changes — but never mid-drag (that would fight the live reorder).
  useEffect(() => {
    if (dragIdRef.current) return;
    const rebuilt = files
      .filter((f) => f.folderId === activeFolder)
      .map((f) => ({ id: f.id, pos: f.position ?? 0 }))
      .sort((a, b) => a.pos - b.pos)
      .map((x) => x.id);
    orderRef.current = rebuilt;
    setOrder(rebuilt);
  }, [files, activeFolder, orderRef]);

  useLayoutEffect(() => {
    const nodes = tileNodes.current;
    const sx = window.scrollX,
      sy = window.scrollY;
    const newRects = new Map<string, { left: number; top: number }>();
    nodes.forEach((node, id) => {
      const r = node.getBoundingClientRect();
      newRects.set(id, { left: r.left + sx, top: r.top + sy });
    });
    nodes.forEach((node, id) => {
      if (draggingIdsRef.current.has(id)) return;
      const prev = prevRects.current.get(id);
      const next = newRects.get(id);
      if (!prev || !next) return;
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;
      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.pointerEvents = "none";
      requestAnimationFrame(() => {
        node.style.transition = "transform 200ms cubic-bezier(0.22,1,0.36,1)";
        node.style.transform = "";
      });
      window.setTimeout(() => {
        node.style.pointerEvents = "";
      }, 210);
    });
    prevRects.current = newRects;
  }, [order]);

  // Apply a sort to the active folder: reorder + persist positions (manual is a
  // no-op — drag order stays). The client respects position, so this sticks.
  const applySort = useCallback(
    (mode: SortMode) => {
      setSortMode(mode);
      if (mode === "manual") return;
      const inFolder = files.filter((f) => f.folderId === activeFolder);
      const name = (f: GalleryFile) =>
        (f.displayName ?? f.filenameOriginal).toLowerCase();
      const sorted = [...inFolder].sort((a, b) => {
        switch (mode) {
          case "name-asc":
            return name(a).localeCompare(name(b));
          case "name-desc":
            return name(b).localeCompare(name(a));
          case "newest":
            return b.createdAt - a.createdAt;
          case "oldest":
            return a.createdAt - b.createdAt;
          case "size-desc":
            return (b.fileSize ?? 0) - (a.fileSize ?? 0);
          default:
            return 0;
        }
      });
      const ids = sorted.map((f) => f.id);
      orderRef.current = ids;
      setOrder(ids);
      const posOf = new Map(ids.map((k, i) => [k, i]));
      setFiles((ps) =>
        ps.map((f) =>
          posOf.has(f.id) ? { ...f, position: posOf.get(f.id)! } : f,
        ),
      );
      void mutateJson(`/api/galleries/${galleryId}/files/reorder`, {
        fileIds: ids,
      }).catch((err) => {
        onError(apiErrorMessage(err, "Sort failed"));
        refreshFiles();
      });
    },
    [files, activeFolder, galleryId, refreshFiles, setFiles, orderRef, onError],
  );

  const positionOverlay = useCallback((x: number, y: number) => {
    const ov = overlayRef.current;
    const info = dragInfo.current;
    if (!ov || !info) return;
    ov.style.transform = `translate(${x - info.offsetX}px, ${y - info.offsetY}px)`;
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const dragging = dragIdRef.current;
      if (!dragging) return;
      positionOverlay(e.clientX, e.clientY);
      const el = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement | null;

      // Over the "New folder" drop target?
      if (el?.closest<HTMLElement>("[data-newfolder]")) {
        if (!dropNewRef.current) {
          dropNewRef.current = true;
          setDropNew(true);
        }
        if (dropFolderRef.current !== null) {
          dropFolderRef.current = null;
          setDropFolderId(null);
        }
        return;
      }
      if (dropNewRef.current) {
        dropNewRef.current = false;
        setDropNew(false);
      }

      // Over a folder chip?
      const overFolder =
        el?.closest<HTMLElement>("[data-folder]")?.dataset.folder ?? null;
      if (overFolder && overFolder !== activeFolder) {
        if (dropFolderRef.current !== overFolder) {
          dropFolderRef.current = overFolder;
          setDropFolderId(overFolder);
        }
        return;
      }
      if (dropFolderRef.current !== null) {
        dropFolderRef.current = null;
        setDropFolderId(null);
      }

      const overId = el?.closest<HTMLElement>("[data-mid]")?.dataset.mid;
      if (!overId) return;
      const payload = dragPayload.current;
      if (payload.length > 1) {
        // Bulk reorder: move the whole selected block to the drop position,
        // preserving the block's internal order.
        const sel = new Set(payload);
        if (sel.has(overId)) return; // hovering within the moving group
        setOrder((prev) => {
          const block = prev.filter((id) => sel.has(id));
          const rest = prev.filter((id) => !sel.has(id));
          const to = rest.indexOf(overId);
          if (to === -1) return prev;
          const next = [...rest.slice(0, to), ...block, ...rest.slice(to)];
          orderRef.current = next;
          return next;
        });
        return;
      }
      if (overId === dragging) return;
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
    },
    [positionOverlay, activeFolder, orderRef],
  );

  const onPointerUp = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    document.body.style.userSelect = "";
    const payload = dragPayload.current;
    const targetFolder = dropFolderRef.current;
    const toNew = dropNewRef.current;
    dragIdRef.current = null;
    dragInfo.current = null;
    dragPayload.current = [];
    dropFolderRef.current = null;
    dropNewRef.current = false;
    draggingIdsRef.current = new Set();
    setDragId(null);
    setOverlayId(null);
    setDropFolderId(null);
    setDropNew(false);
    setDraggingIds(new Set());

    if (toNew) {
      createFolderAndMove(payload);
      setSelected(new Set());
      return;
    }
    if (targetFolder) {
      moveFiles(payload, targetFolder);
      setSelected(new Set());
      return;
    }
    const finalOrder = orderRef.current;
    const posOf = new Map(finalOrder.map((k, i) => [k, i]));
    setFiles((ps) =>
      ps.map((f) =>
        posOf.has(f.id) ? { ...f, position: posOf.get(f.id)! } : f,
      ),
    );
    void mutateJson(`/api/galleries/${galleryId}/files/reorder`, {
      fileIds: finalOrder,
    }).catch((err) => {
      onError(apiErrorMessage(err, "Reorder failed"));
      refreshFiles();
    });
  }, [
    galleryId,
    refreshFiles,
    onPointerMove,
    moveFiles,
    createFolderAndMove,
    setFiles,
    setSelected,
    orderRef,
    onError,
  ]);

  const beginDrag = useCallback(
    (id: string, e: React.PointerEvent<HTMLElement>) => {
      if (!canDrag || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button")) return;
      const rect = e.currentTarget.getBoundingClientRect();
      dragInfo.current = {
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        w: rect.width,
        h: rect.height,
        startX: e.clientX,
        startY: e.clientY,
      };
      dragIdRef.current = id;
      const payload =
        selected.has(id) && selected.size > 0 ? [...selected] : [id];
      dragPayload.current = payload;
      draggingIdsRef.current = new Set(payload);
      setDraggingIds(new Set(payload));
      setDragId(id);
      setOverlayId(id);
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [canDrag, selected, onPointerMove, onPointerUp],
  );

  return {
    order,
    registerTile,
    beginDrag,
    sortMode,
    applySort,
    dragId,
    draggingIds,
    overlayId,
    dropFolderId,
    dropNew,
    setDropNew,
    dragInfo,
    overlayRef,
  };
}
