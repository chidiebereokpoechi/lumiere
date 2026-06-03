"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { apiErrorMessage, mutateJson } from "@/lib/api-client";
import type { Folder } from "@/lib/api/folders";

/**
 * Pointer-drag reordering of the sets (folders) sidebar. Reorders the live
 * `folders` list as the pointer moves over rows (hit-tested by `data-folder`),
 * then persists the new order on release. The order is what clients see.
 */
export function useFolderReorder({
  galleryId,
  setFolders,
  refreshFolders,
  onError,
}: {
  galleryId: string;
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  refreshFolders: () => void;
  onError: (msg: string) => void;
}) {
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);

  const persistFolderOrder = useCallback(
    (ids: string[]) => {
      void mutateJson(`/api/galleries/${galleryId}/folders/reorder`, {
        folderIds: ids,
      }).catch((err) => {
        onError(apiErrorMessage(err, "Reorder failed"));
        refreshFolders();
      });
    },
    [galleryId, refreshFolders, onError],
  );

  const beginFolderDrag = useCallback(
    (id: string, e: React.PointerEvent) => {
      e.preventDefault();
      setDraggingFolderId(id);
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        const el = document.elementFromPoint(
          ev.clientX,
          ev.clientY,
        ) as HTMLElement | null;
        const overId =
          el?.closest<HTMLElement>("[data-folder]")?.dataset.folder;
        if (!overId || overId === id) return;
        setFolders((prev) => {
          const from = prev.findIndex((f) => f.id === id);
          const to = prev.findIndex((f) => f.id === overId);
          if (from === -1 || to === -1 || from === to) return prev;
          const copy = [...prev];
          const [moved] = copy.splice(from, 1);
          copy.splice(to, 0, moved!);
          return copy;
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        setDraggingFolderId(null);
        setFolders((cur) => {
          persistFolderOrder(cur.map((f) => f.id));
          return cur;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [persistFolderOrder, setFolders],
  );

  return { draggingFolderId, beginFolderDrag };
}
