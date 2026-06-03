"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { apiClient, apiClientMutation, ApiError } from "@/lib/api-client";
import type { GalleryFile } from "@/lib/api/files";
import type { Folder } from "@/lib/api/folders";
import { uploadMultipart } from "@/lib/upload/multipart";
import { Select } from "@/components/ui/select";
import { confirmDialog, promptDialog } from "@/components/ui/dialog";
import {
  More,
  Check,
  Eye,
  EyeOff,
  Pen,
  Trash,
  Plus,
  Upload,
  Download,
  Play,
  Music,
  FileDoc,
  Close,
  ChevronLeft,
  ChevronRight,
  SpinnerIcon,
} from "@/components/ui/icons";

// Anything above this uploads directly to storage via presigned multipart
// (bypassing the app + the dev rewrite proxy, which caps bodies at 10MB).
// Kept under that cap so the single-request path never hits the proxy limit.
const MULTIPART_THRESHOLD = 8 * 1024 * 1024;
// How many files upload at once (each large file already parallelizes parts).
const FILE_CONCURRENCY = 3;

interface Props {
  galleryId: string;
  gallerySlug: string;
  initialFiles: GalleryFile[];
  initialFolders: Folder[];
  initialCoverFileId: string | null;
}

type UploadState = "uploading" | "processing" | "ready" | "error";
interface UploadTile {
  key: string;
  filename: string;
  status: UploadState;
  progress: number;
  reason?: string;
}
interface JobEvent {
  type: "queued" | "processing" | "ready" | "error" | "done";
  photoId?: string;
  filename?: string;
  reason?: string;
}

async function getCsrfToken(): Promise<string> {
  const m = document.cookie.match(/(?:^|; )lumiere_csrf=([^;]+)/);
  if (m) return decodeURIComponent(m[1]!);
  const { token } = await apiClient<{ token: string }>("/api/auth/csrf");
  return token;
}

export function FileManager({
  galleryId,
  gallerySlug,
  initialFiles,
  initialFolders,
  initialCoverFileId,
}: Props) {
  const router = useRouter();
  const [files, setFiles] = useState<GalleryFile[]>(initialFiles);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [activeFolder, setActiveFolder] = useState<string>(
    initialFolders[0]?.id ?? "",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fileOverFolder, setFileOverFolder] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(initialCoverFileId);
  const [tiles, setTiles] = useState<UploadTile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inflight = useRef(0);

  const refreshFiles = useCallback(async () => {
    try {
      setFiles(
        await apiClient<GalleryFile[]>(`/api/galleries/${galleryId}/files`),
      );
    } catch {
      router.refresh();
    }
  }, [galleryId, router]);

  const refreshFolders = useCallback(async () => {
    try {
      const fresh = await apiClient<Folder[]>(
        `/api/galleries/${galleryId}/folders`,
      );
      setFolders(fresh);
      setActiveFolder((cur) =>
        fresh.some((f) => f.id === cur) ? cur : (fresh[0]?.id ?? ""),
      );
    } catch {
      /* non-critical */
    }
  }, [galleryId]);

  const updateTile = useCallback((key: string, patch: Partial<UploadTile>) => {
    setTiles((prev) =>
      prev.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    );
  }, []);

  const settle = useCallback(
    (_key: string) => {
      inflight.current -= 1;
      void refreshFiles();
      if (inflight.current <= 0) {
        window.setTimeout(
          () => setTiles((prev) => prev.filter((t) => t.status === "error")),
          800,
        );
      }
    },
    [refreshFiles],
  );

  // After bytes are uploaded the placeholder is dropped and the real (processing)
  // row takes its slot; these events just refresh it in place to ready/error.
  const watchBatch = useCallback(
    (batchId: string, key: string) => {
      const es = new EventSource(`/events?batch=${batchId}`);
      es.onmessage = (ev) => {
        let data: JobEvent;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.type === "ready" || data.type === "error") void refreshFiles();
        else if (data.type === "done") {
          es.close();
          settle(key);
        }
      };
      es.onerror = () => {
        es.close();
        settle(key);
      };
    },
    [refreshFiles, settle],
  );

  const uploadOne = useCallback(
    (file: File, key: string, token: string, folderId: string) => {
      return new Promise<void>((resolve) => {
        const form = new FormData();
        form.append("files", file);
        const xhr = new XMLHttpRequest();
        const q = folderId ? `?folderId=${folderId}` : "";
        xhr.open("POST", `/api/galleries/${galleryId}/files${q}`);
        xhr.withCredentials = true;
        xhr.setRequestHeader("X-CSRF-Token", token);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            updateTile(key, {
              status: "uploading",
              progress: Math.round((e.loaded / e.total) * 100),
            });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            // Bytes are in; the server row now exists (processing/ready) at its end
            // position. Drop the placeholder and let the real tile show in place.
            setTiles((prev) => prev.filter((t) => t.key !== key));
            void refreshFiles();
            let batchId = "";
            try {
              batchId = JSON.parse(xhr.responseText).batchId;
            } catch {
              /* ignore */
            }
            if (batchId) watchBatch(batchId, key);
            else settle(key);
          } else {
            updateTile(key, { status: "error", reason: `HTTP ${xhr.status}` });
            setError(`Upload failed (${xhr.status})`);
            settle(key);
          }
          resolve();
        };
        xhr.onerror = () => {
          updateTile(key, { status: "error", reason: "network error" });
          setError("Network error during upload");
          settle(key);
          resolve();
        };
        xhr.send(form);
      });
    },
    [galleryId, updateTile, watchBatch, settle, refreshFiles],
  );

  const upload = useCallback(
    async (fileList: FileList | File[], folderId: string) => {
      const arr = Array.from(fileList);
      if (arr.length === 0 || !folderId) return;
      setError(null);
      const seeded = arr.map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        file: f,
      }));
      setTiles((prev) => [
        ...seeded.map((s) => ({
          key: s.key,
          filename: s.file.name,
          status: "uploading" as UploadState,
          progress: 0,
        })),
        ...prev,
      ]);
      inflight.current += seeded.length;
      let token: string;
      try {
        token = await getCsrfToken();
      } catch {
        setError("Could not start upload (auth).");
        seeded.forEach((s) => {
          updateTile(s.key, { status: "error", reason: "auth" });
          settle(s.key);
        });
        return;
      }

      const one = async (s: { key: string; file: File }) => {
        if (s.file.size > MULTIPART_THRESHOLD) {
          try {
            await uploadMultipart({
              galleryId,
              folderId,
              file: s.file,
              onProgress: (p) =>
                updateTile(s.key, { status: "uploading", progress: p }),
            });
            // Hand off to the real row (processing for images, ready otherwise).
            setTiles((prev) => prev.filter((t) => t.key !== s.key));
            void refreshFiles();
          } catch (err) {
            updateTile(s.key, {
              status: "error",
              reason: err instanceof Error ? err.message : "failed",
            });
            setError("Upload failed");
          } finally {
            settle(s.key);
          }
        } else {
          await uploadOne(s.file, s.key, token, folderId);
        }
      };

      // Upload several files at once (each large file already runs its parts
      // concurrently, so cap files-in-flight to keep total connections sane).
      let i = 0;
      await Promise.all(
        Array.from(
          { length: Math.min(FILE_CONCURRENCY, seeded.length) },
          async () => {
            while (i < seeded.length) await one(seeded[i++]!);
          },
        ),
      );
    },
    [galleryId, uploadOne, updateTile, settle, refreshFiles],
  );

  // ---- folders ---------------------------------------------------------
  async function createFolder() {
    const name = (
      await promptDialog({
        title: "New set",
        label: "Set name",
        placeholder: "e.g. Highlights",
        confirmLabel: "Create",
      })
    )?.trim();
    if (!name) return;
    try {
      const created = await apiClientMutation<Folder>(
        `/api/galleries/${galleryId}/folders`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      await refreshFolders();
      if (created?.id) setActiveFolder(created.id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not create folder (${err.status})`
          : "Network error",
      );
    }
  }
  async function renameFolder(folder: Folder) {
    const name = (
      await promptDialog({
        title: "Rename set",
        label: "Set name",
        defaultValue: folder.name,
        confirmLabel: "Rename",
      })
    )?.trim();
    if (!name || name === folder.name) return;
    try {
      await apiClientMutation(
        `/api/galleries/${galleryId}/folders/${folder.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      await refreshFolders();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not rename folder (${err.status})`
          : "Network error",
      );
    }
  }
  async function toggleFolderHidden(folder: Folder) {
    try {
      await apiClientMutation(
        `/api/galleries/${galleryId}/folders/${folder.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hidden: !folder.hidden }),
        },
      );
      await refreshFolders();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not update folder (${err.status})`
          : "Network error",
      );
    }
  }
  async function deleteFolder(folder: Folder) {
    if (folders.length <= 1) {
      setError("A gallery must have at least one set.");
      return;
    }
    const ok = await confirmDialog({
      title: "Delete set",
      message: `Delete "${folder.name}"? Its contents move into another set (nothing is deleted).`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiClientMutation(
        `/api/galleries/${galleryId}/folders/${folder.id}`,
        { method: "DELETE" },
      );
      if (activeFolder === folder.id)
        setActiveFolder(folders.find((f) => f.id !== folder.id)?.id ?? "");
      await refreshFolders();
      await refreshFiles();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not delete folder (${err.status})`
          : "Network error",
      );
    }
  }

  // ---- file ops --------------------------------------------------------
  const moveFiles = useCallback(
    async (ids: string[], folderId: string) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      setFiles((prev) =>
        prev.map((f) => (idSet.has(f.id) ? { ...f, folderId } : f)),
      );
      try {
        await apiClientMutation(`/api/galleries/${galleryId}/files/move`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileIds: ids, folderId }),
        });
        await refreshFolders();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `Could not move (${err.status})`
            : "Network error",
        );
        void refreshFiles();
      }
    },
    [galleryId, refreshFolders, refreshFiles],
  );

  // Create a folder then move the given files into it (used by the move bar
  // action and by dropping a drag onto the New-folder target).
  const createFolderAndMove = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const name = (
        await promptDialog({
          title: "New set",
          label: "Set name",
          placeholder: "Set name",
          confirmLabel: "Create",
        })
      )?.trim();
      if (!name) return;
      try {
        const created = await apiClientMutation<Folder>(
          `/api/galleries/${galleryId}/folders`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name }),
          },
        );
        await refreshFolders();
        await moveFiles(ids, created.id);
        setActiveFolder(created.id);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `Could not create folder (${err.status})`
            : "Network error",
        );
      }
    },
    [galleryId, refreshFolders, moveFiles],
  );

  async function moveSelected(folderId: string) {
    if (selected.size === 0) return;
    const ids = [...selected];
    setSelected(new Set());
    await moveFiles(ids, folderId);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const n = selected.size;
    const ok = await confirmDialog({
      title: `Delete ${n} item${n > 1 ? "s" : ""}`,
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const ids = [...selected];
    setSelected(new Set());
    setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
    setCover((c) => (c && ids.includes(c) ? null : c));
    await Promise.all(
      ids.map((id) =>
        apiClientMutation(`/api/galleries/${galleryId}/files/${id}`, {
          method: "DELETE",
        }).catch(() => {
          /* best-effort */
        }),
      ),
    );
    void refreshFolders();
  }

  async function onDelete(file: GalleryFile) {
    const ok = await confirmDialog({
      title: "Delete file",
      message: `Delete "${file.displayName ?? file.filenameOriginal}"? Cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(file.id);
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/files/${file.id}`, {
        method: "DELETE",
      });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (cover === file.id) setCover(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Delete failed (${err.status})`
          : "Network error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onSetCover(file: GalleryFile) {
    setBusyId(file.id);
    const prev = cover;
    setCover(file.id);
    try {
      await apiClientMutation(`/api/galleries/${galleryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coverFileId: file.id }),
      });
    } catch (err) {
      setCover(prev);
      setError(
        err instanceof ApiError
          ? `Could not set cover (${err.status})`
          : "Network error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function renameFile(file: GalleryFile) {
    const next = await promptDialog({
      title: "Rename file",
      label: "Display name",
      defaultValue: file.displayName ?? file.filenameOriginal,
      confirmLabel: "Rename",
    });
    if (next === null) return;
    const displayName = next.trim() === "" ? null : next.trim();
    setFiles((prev) =>
      prev.map((f) => (f.id === file.id ? { ...f, displayName } : f)),
    );
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/files/${file.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Rename failed (${err.status})`
          : "Network error",
      );
      void refreshFiles();
    }
  }

  async function copyFilename(file: GalleryFile) {
    try {
      await navigator.clipboard.writeText(file.filenameOriginal);
    } catch {
      setError("Clipboard unavailable");
    }
  }

  function downloadFile(file: GalleryFile) {
    const a = document.createElement("a");
    a.href = `/api/gallery/${gallerySlug}/files/${file.id}/download`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Apply a sort to the active folder: reorder + persist positions (manual is
  // a no-op — drag order stays). The client respects position, so this sticks.
  type SortMode =
    | "manual"
    | "name-asc"
    | "name-desc"
    | "newest"
    | "oldest"
    | "size-desc";
  const [sortMode, setSortMode] = useState<SortMode>("manual");
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
      void apiClientMutation(`/api/galleries/${galleryId}/files/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileIds: ids }),
      }).catch((err) => {
        setError(
          err instanceof ApiError
            ? `Sort failed (${err.status})`
            : "Network error",
        );
        void refreshFiles();
      });
    },
    [files, activeFolder, galleryId, refreshFiles],
  );

  // Shift-click selects the contiguous range (in display order) from the last
  // plain-clicked anchor — additive, never deselecting the existing selection.
  const selectAnchor = useRef<string | null>(null);
  const toggleSelect = useCallback((id: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && selectAnchor.current) {
        const a = orderRef.current.indexOf(selectAnchor.current);
        const b = orderRef.current.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(orderRef.current[i]!);
          return next; // keep anchor so further shift-clicks re-range from it
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selectAnchor.current = id;
      return next;
    });
  }, []);

  // ---- pointer-based sortable -----------------------------------------
  const [dragId, setDragId] = useState<string | null>(null);
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [dropNew, setDropNew] = useState(false);
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);
  const orderRef = useRef<string[]>([]);
  const dragIdRef = useRef<string | null>(null);
  const dragPayload = useRef<string[]>([]);
  const draggingIdsRef = useRef<Set<string>>(new Set());
  const dropFolderRef = useRef<string | null>(null);
  const dropNewRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragInfo = useRef<{
    offsetX: number;
    offsetY: number;
    w: number;
    h: number;
    startX: number;
    startY: number;
  } | null>(null);
  const canDrag = tiles.length === 0;

  const tileNodes = useRef(new Map<string, HTMLElement>());
  // Page-relative positions (viewport rect + scroll). Storing them scroll-aware
  // means scrolling between renders doesn't register as movement — otherwise the
  // FLIP would animate every tile by the scroll delta (a visible stagger).
  const prevRects = useRef(new Map<string, { left: number; top: number }>());
  const registerTile = useCallback((id: string, node: HTMLElement | null) => {
    if (node) tileNodes.current.set(id, node);
    else tileNodes.current.delete(id);
  }, []);

  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  useEffect(() => {
    if (dragIdRef.current) return;
    const rebuilt = files
      .filter((f) => f.folderId === activeFolder)
      .map((f) => ({ id: f.id, pos: f.position ?? 0 }))
      .sort((a, b) => a.pos - b.pos)
      .map((x) => x.id);
    orderRef.current = rebuilt;
    setOrder(rebuilt);
  }, [files, activeFolder]);

  const folderEmpty = order.length === 0 && tiles.length === 0;

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
    [positionOverlay, activeFolder],
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
      void createFolderAndMove(payload);
      setSelected(new Set());
      return;
    }
    if (targetFolder) {
      void moveFiles(payload, targetFolder);
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
    void apiClientMutation(`/api/galleries/${galleryId}/files/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileIds: finalOrder }),
    }).catch((err) => {
      setError(
        err instanceof ApiError
          ? `Reorder failed (${err.status})`
          : "Network error",
      );
      void refreshFiles();
    });
  }, [galleryId, refreshFiles, onPointerMove, moveFiles, createFolderAndMove]);

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

  // ---- page-wide drop --------------------------------------------------
  function handleFiles(
    fileList: FileList | File[],
    folderId: string = activeFolder,
  ) {
    if (folderId) void upload(fileList, folderId);
  }
  const dragDepth = useRef(0);
  const overlayFile = overlayId ? fileById.get(overlayId) : null;

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-accent-soft border border-accent/40 px-4 py-3 text-sm font-semibold text-ink-strong"
        >
          {error}
        </div>
      )}

      {tiles.length > 0 && <UploadSummary tiles={tiles} />}

      {/* Two-column: sets sidebar + media grid */}
      <div className="flex gap-6 items-start">
        {/* Sets sidebar */}
        <aside className="w-80 h-full shrink-0 border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider text-ink-subtle">
              Sets
            </span>
            <button
              type="button"
              data-newfolder
              onClick={createFolder}
              title="Add set"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  setDropNew(true);
                }
              }}
              onDragLeave={() => setDropNew(false)}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return;
                e.preventDefault();
                e.stopPropagation();
                setDropNew(false);
                const files = Array.from(e.dataTransfer.files);
                if (!files.length) return;
                void (async () => {
                  const name = (
                    await promptDialog({
                      title: "New set",
                      label: "Set name",
                      confirmLabel: "Create",
                    })
                  )?.trim();
                  if (!name) return;
                  try {
                    const created = await apiClientMutation<Folder>(
                      `/api/galleries/${galleryId}/folders`,
                      {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ name }),
                      },
                    );
                    await refreshFolders();
                    setActiveFolder(created.id);
                    handleFiles(files, created.id);
                  } catch (err) {
                    setError(
                      err instanceof ApiError
                        ? `Could not create set (${err.status})`
                        : "Network error",
                    );
                  }
                })();
              }}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-dashed transition-all ${dropNew ? "bg-accent text-white border-accent ring-4 ring-accent/40" : "border-border text-ink-muted hover:text-ink-strong hover:border-border-strong"}`}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="space-y-3">
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                id={f.id}
                active={activeFolder === f.id}
                isDropTarget={dropFolderId === f.id || fileOverFolder === f.id}
                hidden={f.hidden}
                onClick={() => setActiveFolder(f.id)}
                label={f.name}
                count={f.photoCount}
                onRename={() => renameFolder(f)}
                onToggleHidden={() => toggleFolderHidden(f)}
                onDelete={
                  folders.length > 1 ? () => deleteFolder(f) : undefined
                }
                onFileEnter={() => setFileOverFolder(f.id)}
                onFileLeave={() =>
                  setFileOverFolder((c) => (c === f.id ? null : c))
                }
                onFileDrop={(fl) => {
                  setFileOverFolder(null);
                  handleFiles(fl, f.id);
                }}
              />
            ))}
          </div>
        </aside>

        {/* Media column */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-extrabold tracking-wider text-ink-strong truncate">
              {folders.find((f) => f.id === activeFolder)?.name ?? "Media"}
            </h2>
            <span className="text-sm text-ink-subtle tabular-nums">
              {order.length}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="hidden sm:inline text-xs font-bold tracking-wider text-ink-subtle">
                Sort
              </span>
              <Select
                value={sortMode}
                onChange={(v) => applySort(v)}
                className="w-40"
                options={[
                  { value: "manual", label: "Manual" },
                  { value: "name-asc", label: "Name A-Z" },
                  { value: "name-desc", label: "Name Z-A" },
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                  { value: "size-desc", label: "Largest" },
                ]}
              />
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md bg-accent border border-accent px-4 py-2 text-sm font-bold tracking-wider text-white hover:bg-accent-dark hover:border-accent-dark transition-colors"
            >
              <Upload size={15} />
              Upload
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* Folder content — drop boundary */}
          <div
            className="relative space-y-6 min-h-64"
            onDragEnter={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                dragDepth.current += 1;
                setDragging(true);
              }
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) e.preventDefault();
            }}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragging(false);
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              if (e.dataTransfer.files?.length)
                handleFiles(e.dataTransfer.files);
            }}
          >
            {dragging && (
              <div className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center justify-center gap-2 bg-accent-soft/70 border-2 border-dashed border-accent text-white">
                <Upload size={36} />
                <p className="text-base font-bold tracking-wider">
                  Drop into this folder
                </p>
              </div>
            )}

            {folderEmpty ? (
              <p className="text-sm text-ink-muted">
                This folder is empty. Drop media here or use Upload.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
                      dragging={draggingIds.has(file.id)}
                      folders={folders}
                      activeFolder={activeFolder}
                      onRef={(n) => registerTile(file.id, n)}
                      onPointerDownReorder={(e) => beginDrag(file.id, e)}
                      onToggleSelect={(shift) => toggleSelect(file.id, shift)}
                      onOpen={() => setPreviewId(file.id)}
                      onDelete={() => onDelete(file)}
                      onSetCover={() => onSetCover(file)}
                      onRename={() => renameFile(file)}
                      onCopyName={() => copyFilename(file)}
                      onDownload={() => downloadFile(file)}
                      onMove={(folderId) => moveFiles([file.id], folderId)}
                    />
                  );
                })}

                {/* Upload placeholders sit at the end (upload order) — the same slot
                the processed file lands in, so nothing jumps. */}
                {tiles.map((t) => (
                  <div
                    key={t.key}
                    className="relative aspect-square rounded-lg border border-border bg-surface-sunken flex flex-col items-center justify-center gap-2 p-3 text-center overflow-hidden"
                  >
                    {t.status === "error" ? (
                      <span className="text-xs font-semibold text-negative px-1">
                        Failed{t.reason ? `: ${t.reason}` : ""}
                      </span>
                    ) : t.status === "uploading" ? (
                      <>
                        <span className="text-sm font-bold tabular-nums text-ink-strong">
                          {t.progress}%
                        </span>
                        <div className="w-4/5 h-1.5 rounded-pill bg-surface overflow-hidden">
                          <div
                            className="h-full bg-accent transition-[width] duration-150"
                            style={{ width: `${t.progress}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <Spinner />
                        <span className="text-xs text-ink-muted">
                          Processing…
                        </span>
                      </>
                    )}
                    <span className="text-[11px] text-ink-subtle truncate max-w-full">
                      {t.filename}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selection move bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-ink-strong tabular-nums">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-3">
            <Select
              value=""
              placeholder="Move to…"
              className="w-44"
              onChange={(v) => {
                if (v === "__new__") void createFolderAndMove([...selected]);
                else if (v) void moveSelected(v);
              }}
              options={[
                ...folders.map((f) => ({ value: f.id, label: f.name })),
                { value: "__new__", label: "+ New set…" },
              ]}
            />
            <button
              type="button"
              onClick={deleteSelected}
              className="inline-flex items-center gap-1.5 rounded-md border border-negative/40 px-3 py-2 text-sm font-semibold text-negative hover:bg-negative/10 transition-colors"
            >
              <Trash size={15} />
              Delete
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-sm font-semibold tracking-wider text-ink-muted hover:text-ink-strong"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Drag overlay — clumped stack when dragging multiple */}
      {overlayFile && dragInfo.current && (
        <div
          ref={overlayRef}
          className="fixed top-0 left-0 z-50 pointer-events-none"
          style={{
            width: dragInfo.current.w,
            height: dragInfo.current.h,
            willChange: "transform",
            transform: `translate(${dragInfo.current.startX - dragInfo.current.offsetX}px, ${dragInfo.current.startY - dragInfo.current.offsetY}px)`,
          }}
        >
          <div
            className={`relative h-full w-full origin-center transition-transform duration-200 ease-out ${dropFolderId || dropNew ? "scale-[0.35]" : "scale-[1.04]"}`}
          >
            {draggingIds.size > 1 && (
              <>
                <div className="absolute inset-0 rounded-lg bg-surface-sunken border border-border ring-2 ring-accent/50 rotate-6 translate-x-1.5 translate-y-1.5" />
                <div className="absolute inset-0 rounded-lg bg-surface-sunken border border-border ring-2 ring-accent/60 -rotate-3 -translate-x-1 translate-y-0.5" />
              </>
            )}
            <div className="relative h-full w-full overflow-hidden rounded-lg ring-2 ring-accent shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
              {overlayFile.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/img/${galleryId}/${overlayFile.id}/thumb`}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-contain bg-surface"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-surface-sunken text-ink-muted">
                  <TypeIcon type={overlayFile.type} />
                </div>
              )}
            </div>
            {draggingIds.size > 1 && (
              <span className="absolute -top-2 -right-2 min-w-6 h-6 px-1.5 inline-flex items-center justify-center rounded-full bg-accent text-white text-xs font-bold tabular-nums ring-2 ring-surface">
                {draggingIds.size}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Admin preview (Open) */}
      {previewId &&
        (() => {
          const pf = fileById.get(previewId);
          if (!pf) return null;
          const idx = order.indexOf(previewId);
          const step = (d: number) => {
            if (order.length === 0) return;
            const n = order[(idx + d + order.length) % order.length];
            if (n) setPreviewId(n);
          };
          return (
            <AdminPreview
              file={pf}
              galleryId={galleryId}
              gallerySlug={gallerySlug}
              index={idx}
              total={order.length}
              onClose={() => setPreviewId(null)}
              onStep={step}
            />
          );
        })()}
    </div>
  );
}

// Minimal admin media preview — light surface, keyboard + arrow nav.
function AdminPreview({
  file,
  galleryId,
  gallerySlug,
  index,
  total,
  onClose,
  onStep,
}: {
  file: GalleryFile;
  galleryId: string;
  gallerySlug: string;
  index: number;
  total: number;
  onClose: () => void;
  onStep: (d: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onStep(-1);
      else if (e.key === "ArrowRight") onStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  const name = file.displayName ?? file.filenameOriginal;
  const streamUrl = `/api/gallery/${gallerySlug}/files/${file.id}/stream`;
  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" onClick={onClose}>
      <div
        className="shrink-0 flex items-center justify-between px-4 h-14"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="h-10 w-10 -ml-1 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
        >
          <ChevronLeft size={24} />
        </button>
        <a
          href={`/api/gallery/${gallerySlug}/files/${file.id}/download`}
          aria-label="Download"
          className="h-10 w-10 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
        >
          <Download size={20} />
        </a>
      </div>
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-4 sm:px-12"
        onClick={onClose}
      >
        <div
          className="max-h-full max-w-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {file.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/img/${galleryId}/${file.id}/preview`}
              alt={name}
              className="max-h-[80svh] max-w-full object-contain"
            />
          ) : file.type === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={streamUrl}
              controls
              className="max-h-[80svh] max-w-full"
            />
          ) : file.type === "audio" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio src={streamUrl} controls className="w-[min(90vw,32rem)]" />
          ) : (
            <div className="w-[min(90vw,28rem)] rounded-lg border border-border bg-surface p-8 text-center">
              <TypeIcon type={file.type} />
              <p className="mt-3 text-sm font-semibold text-ink-strong truncate">
                {name}
              </p>
            </div>
          )}
        </div>
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStep(-1);
              }}
              aria-label="Previous"
              className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStep(1);
              }}
              aria-label="Next"
              className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
            >
              <ChevronRight size={26} />
            </button>
          </>
        )}
      </div>
      <div
        className="shrink-0 text-center pt-1 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-ink-muted tabular-nums truncate px-6">
          {name}
          {total > 1 ? `  ·  ${index + 1} / ${total}` : ""}
        </p>
      </div>
    </div>
  );
}

function FileTile({
  file,
  galleryId,
  gallerySlug,
  isCover,
  selected,
  busy,
  reorderable,
  dragging,
  folders,
  activeFolder,
  onRef,
  onPointerDownReorder,
  onToggleSelect,
  onOpen,
  onDelete,
  onSetCover,
  onRename,
  onCopyName,
  onDownload,
  onMove,
}: {
  file: GalleryFile;
  galleryId: string;
  gallerySlug: string;
  isCover: boolean;
  selected: boolean;
  busy: boolean;
  reorderable: boolean;
  dragging: boolean;
  folders: Folder[];
  activeFolder: string;
  onRef: (n: HTMLElement | null) => void;
  onPointerDownReorder: (e: React.PointerEvent<HTMLElement>) => void;
  onToggleSelect: (shift: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
  onSetCover: () => void;
  onRename: () => void;
  onCopyName: () => void;
  onDownload: () => void;
  onMove: (folderId: string) => void;
}) {
  const name = file.displayName ?? file.filenameOriginal;
  const ready =
    file.uploadStatus !== "processing" && file.uploadStatus !== "error";
  const streamUrl = `/api/gallery/${gallerySlug}/files/${file.id}/stream`;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={onRef}
        data-mid={file.id}
        onPointerDown={reorderable ? onPointerDownReorder : undefined}
        style={reorderable ? { touchAction: "none" } : undefined}
        className={`group relative aspect-square overflow-hidden rounded-lg border border-border ${dragging ? "border-dashed bg-surface-2" : file.type === "image" ? "bg-surface" : "bg-surface-sunken"} ${reorderable && !dragging ? "cursor-grab" : ""}`}
      >
        {dragging ? (
          <div className="h-full w-full" />
        ) : file.type === "image" ? (
          file.uploadStatus === "error" ? (
            <div className="h-full w-full flex items-center justify-center text-xs font-semibold text-negative">
              Failed
            </div>
          ) : ready ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/img/${galleryId}/${file.id}/thumb`}
              alt={name}
              draggable={false}
              className={`h-full w-full object-contain ${selected ? "brightness-90" : ""}`}
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center gap-2">
              <Spinner />
              <span className="text-xs text-ink-muted">Processing…</span>
            </div>
          )
        ) : file.type === "video" ? (
          <>
            <video
              src={`${streamUrl}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              className="h-full w-full object-contain bg-black"
            />
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-black/50 text-white">
                <Play size={18} />
              </span>
            </span>
            <Badge>Video</Badge>
          </>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-3 text-center">
            <TypeIcon type={file.type} />
            <Badge>{file.type === "audio" ? "Audio" : "File"}</Badge>
          </div>
        )}

        {!dragging && isCover && (
          <span className="absolute bottom-2 left-2 rounded-md bg-surface-strong text-ink-inverse px-2 py-0.5 text-[10px] font-extrabold tracking-widest">
            Cover
          </span>
        )}

        {!dragging && (
          <button
            type="button"
            onClick={(e) => onToggleSelect(e.shiftKey)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-pressed={selected}
            aria-label={selected ? "Deselect" : "Select"}
            className={`absolute top-2 left-2 h-7 w-7 inline-flex items-center justify-center rounded-full border-2 transition-all ${selected ? "bg-accent border-accent text-white opacity-100" : "bg-black/30 border-white/80 text-transparent opacity-0 group-hover:opacity-100"}`}
          >
            <Check size={16} />
          </button>
        )}

        {!dragging && selected && (
          <div className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-accent rounded-lg" />
        )}

        {!dragging && (
          <TileMenu
            file={file}
            ready={ready}
            isCover={isCover}
            busy={busy}
            folders={folders}
            activeFolder={activeFolder}
            onOpen={onOpen}
            onDownload={onDownload}
            onRename={onRename}
            onCopyName={onCopyName}
            onSetCover={onSetCover}
            onMove={onMove}
            onDelete={onDelete}
          />
        )}
      </div>
      <span
        title={name}
        className="px-0.5 text-sm leading-tight text-ink-muted truncate"
      >
        {name}
      </span>
    </div>
  );
}

// Per-tile ⋯ actions menu.
function TileMenu({
  file,
  ready,
  isCover,
  busy,
  folders,
  activeFolder,
  onOpen,
  onDownload,
  onRename,
  onCopyName,
  onSetCover,
  onMove,
  onDelete,
}: {
  file: GalleryFile;
  ready: boolean;
  isCover: boolean;
  busy: boolean;
  folders: Folder[];
  activeFolder: string;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onCopyName: () => void;
  onSetCover: () => void;
  onMove: (folderId: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const otherFolders = folders.filter((f) => f.id !== activeFolder);

  return (
    <div
      ref={ref}
      className="absolute top-2 right-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label="Actions"
        className={`h-8 w-8 inline-flex items-center justify-center rounded-md bg-surface text-ink-strong hover:bg-surface disabled:opacity-50 transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <More size={18} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-md border border-border bg-surface shadow-lg p-1.5 text-sm z-20">
          <MenuItem onClick={run(onOpen)} label="Open" />
          <MenuItem onClick={run(onDownload)} label="Download" />
          <MenuItem onClick={run(onRename)} label="Rename" />
          {file.type === "image" && ready && !isCover && (
            <MenuItem onClick={run(onSetCover)} label="Set as cover" />
          )}
          <MenuItem onClick={run(onCopyName)} label="Copy filename" />
          {otherFolders.length > 0 && (
            <>
              <div className="my-1 mx-1 h-px bg-border" />
              <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-bold tracking-wider text-ink-subtle">
                Move to
              </p>
              {otherFolders.map((f) => (
                <MenuItem
                  key={f.id}
                  onClick={run(() => onMove(f.id))}
                  label={f.name}
                />
              ))}
            </>
          )}
          <div className="my-1 mx-1 h-px bg-border" />
          <MenuItem onClick={run(onDelete)} label="Delete" danger />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  label,
  danger,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded px-2.5 py-1.5 truncate hover:bg-surface-2 ${danger ? "text-negative" : "text-ink-strong"}`}
    >
      {label}
    </button>
  );
}

function TypeIcon({ type }: { type: GalleryFile["type"] }) {
  const Icon = type === "audio" ? Music : FileDoc;
  return <Icon size={28} className="text-ink-muted" />;
}

// Vertical set/folder row for the sidebar: select, count, drop-target for file
// drags, plus hover actions (hide / rename / delete).
function FolderRow({
  id,
  active,
  isDropTarget,
  hidden,
  onClick,
  label,
  count,
  onRename,
  onDelete,
  onToggleHidden,
  onFileEnter,
  onFileLeave,
  onFileDrop,
}: {
  id: string;
  active: boolean;
  isDropTarget?: boolean;
  hidden?: boolean;
  onClick: () => void;
  label: string;
  count: number;
  onRename?: () => void;
  onDelete?: () => void;
  onToggleHidden?: () => void;
  onFileEnter?: () => void;
  onFileLeave?: () => void;
  onFileDrop?: (files: FileList) => void;
}) {
  const hasFiles = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files");
  const dim = hidden && !active && !isDropTarget ? "opacity-60" : "";
  const iconTint =
    active || isDropTarget
      ? "text-ink-inverse/80 hover:text-ink-inverse"
      : "text-ink-subtle hover:text-ink-strong";
  return (
    <div
      data-folder={id}
      onDragEnter={(e) => {
        if (hasFiles(e)) onFileEnter?.();
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={() => onFileLeave?.()}
      onDrop={(e) => {
        if (hasFiles(e)) {
          e.preventDefault();
          e.stopPropagation();
          onFileDrop?.(e.dataTransfer.files);
        }
      }}
      title={hidden ? "Hidden from clients" : undefined}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group/row flex items-center gap-1 rounded-md border px-4 py-4 cursor-pointer transition-colors focus-visible:outline-none ${
        isDropTarget
          ? "bg-accent text-ink-inverse border-accent ring-2 ring-accent/40"
          : active
            ? "bg-surface-strong text-ink-inverse border-surface-strong"
            : "bg-surface text-ink-muted border-border hover:text-ink-strong hover:border-border-strong"
      } ${dim}`}
    >
      <span className="flex-1 min-w-0 inline-flex items-center gap-1.5 text-left text-sm font-semibold">
        {hidden && <EyeOff size={14} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`tabular-nums text-xs shrink-0 group-hover/row:hidden ${active || isDropTarget ? "text-ink-inverse/70" : "text-ink-subtle"}`}
      >
        {count}
      </span>
      <span className="hidden group-hover/row:inline-flex items-center gap-1 shrink-0">
        {onToggleHidden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden();
            }}
            title={hidden ? "Show to clients" : "Hide from clients"}
            className={iconTint}
          >
            {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        )}
        {onRename && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            title="Rename"
            className={iconTint}
          >
            <Pen size={14} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete set"
            className={`${active ? "text-ink-inverse/80 hover:text-ink-inverse" : "text-ink-subtle hover:text-negative"}`}
          >
            <Close size={14} />
          </button>
        )}
      </span>
    </div>
  );
}

function UploadSummary({ tiles }: { tiles: UploadTile[] }) {
  const total = tiles.length;
  const done = tiles.filter(
    (t) => t.status === "ready" || t.status === "error",
  ).length;
  const failed = tiles.filter((t) => t.status === "error").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink-strong">
          Uploading {total} item{total !== 1 ? "s" : ""} — one at a time
        </span>
        <span className="tabular-nums text-ink-muted">
          {done}/{total}
          {failed ? ` · ${failed} failed` : ""}
        </span>
      </div>
      <div className="h-2 rounded-pill bg-surface-sunken overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Spinner() {
  return <SpinnerIcon size={20} className="animate-spin text-ink-subtle" />;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-surface-strong text-ink-inverse px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest">
      {children}
    </span>
  );
}
