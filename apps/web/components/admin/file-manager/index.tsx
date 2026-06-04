"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiClient,
  apiClientMutation,
  apiErrorMessage,
  mutateJson,
} from "@/lib/api-client";
import { downloadViaAnchor } from "@/lib/download";
import { toast } from "@/lib/toast";
import type { GalleryFile } from "@/lib/api/files";
import type { Folder } from "@/lib/api/folders";
import { useRangeSelect } from "@/hooks/use-range-select";
import { useUploads } from "@/hooks/use-uploads";
import { useFolderReorder } from "@/hooks/use-folder-reorder";
import { useTileSortable } from "@/hooks/use-tile-sortable";
import { Select } from "@/components/ui/select";
import { confirmDialog, promptDialog } from "@/components/ui/dialog";
import { Plus, Upload, Trash, Filter } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { FileTile } from "./file-tile";
import { FolderRow } from "./folder-row";
import { AdminPreview } from "./admin-preview";
import { UploadSummary } from "./upload-summary";
import { Spinner, TypeIcon } from "./bits";
import { type CoverState } from "./cover-control";

interface Props {
  galleryId: string;
  gallerySlug: string;
  initialFiles: GalleryFile[];
  initialFolders: Folder[];
  initialCover: CoverState;
}

export function FileManager({
  galleryId,
  gallerySlug,
  initialFiles,
  initialFolders,
  initialCover,
}: Props) {
  const router = useRouter();
  const [files, setFiles] = useState<GalleryFile[]>(initialFiles);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [activeFolder, setActiveFolder] = useState<string>(
    initialFolders[0]?.id ?? "",
  );
  const [fileOverFolder, setFileOverFolder] = useState<string | null>(null);
  const [cover, setCover] = useState<CoverState>(initialCover);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

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

  // Uploads (progress tiles + SSE job watch). Drag-reorder is suspended while
  // any upload is in flight so placeholders don't fight the sortable.
  const { tiles, upload } = useUploads({
    galleryId,
    refreshFiles,
    onError: setError,
  });
  const canDrag = tiles.length === 0;

  // Display order of the active folder, drag-sort, and selection share `orderRef`.
  const orderRef = useRef<string[]>([]);
  const orderedGetter = useCallback(() => orderRef.current, []);
  const { selected, setSelected, toggle } = useRangeSelect(orderedGetter);

  // ---- folders ---------------------------------------------------------
  const { draggingFolderId, beginFolderDrag } = useFolderReorder({
    galleryId,
    setFolders,
    refreshFolders,
    onError: setError,
  });

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
      const created = await mutateJson<Folder>(
        `/api/galleries/${galleryId}/folders`,
        { name },
      );
      await refreshFolders();
      if (created?.id) setActiveFolder(created.id);
      toast.success(`Created set “${name}”`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create folder"));
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
      await mutateJson(
        `/api/galleries/${galleryId}/folders/${folder.id}`,
        { name },
        "PATCH",
      );
      await refreshFolders();
      toast.success(`Renamed to “${name}”`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not rename folder"));
    }
  }
  async function toggleFolderHidden(folder: Folder) {
    try {
      await mutateJson(
        `/api/galleries/${galleryId}/folders/${folder.id}`,
        { hidden: !folder.hidden },
        "PATCH",
      );
      await refreshFolders();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update folder"));
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
        {
          method: "DELETE",
        },
      );
      if (activeFolder === folder.id)
        setActiveFolder(folders.find((f) => f.id !== folder.id)?.id ?? "");
      await refreshFolders();
      await refreshFiles();
      toast.success(`Deleted set “${folder.name}”`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not delete folder"));
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
        await mutateJson(`/api/galleries/${galleryId}/files/move`, {
          fileIds: ids,
          folderId,
        });
        await refreshFolders();
      } catch (err) {
        setError(apiErrorMessage(err, "Could not move"));
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
        const created = await mutateJson<Folder>(
          `/api/galleries/${galleryId}/folders`,
          { name },
        );
        await refreshFolders();
        await moveFiles(ids, created.id);
        setActiveFolder(created.id);
      } catch (err) {
        setError(apiErrorMessage(err, "Could not create folder"));
      }
    },
    [galleryId, refreshFolders, moveFiles],
  );

  // ---- pointer-based sortable + sort modes -----------------------------
  const {
    order,
    registerTile,
    beginDrag,
    sortMode,
    applySort,
    draggingIds,
    overlayId,
    dropFolderId,
    dropNew,
    setDropNew,
    dragInfo,
    overlayRef,
  } = useTileSortable({
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
    onError: setError,
  });

  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const folderEmpty = order.length === 0 && tiles.length === 0;
  const overlayFile = overlayId ? fileById.get(overlayId) : null;

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
    setCover((c) =>
      c.fileId && ids.includes(c.fileId) ? { ...c, fileId: null } : c,
    );
    const results = await Promise.allSettled(
      ids.map((id) =>
        apiClientMutation(`/api/galleries/${galleryId}/files/${id}`, {
          method: "DELETE",
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = ids.length - failed;
    if (failed === 0) {
      toast.success(
        `Deleted ${succeeded} ${succeeded === 1 ? "item" : "items"}`,
      );
    } else if (succeeded === 0) {
      toast.error(
        `Couldn’t delete ${ids.length} ${ids.length === 1 ? "item" : "items"}`,
      );
    } else {
      toast.error(`Deleted ${succeeded} of ${ids.length} - ${failed} failed`);
    }
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
      setCover((c) => (c.fileId === file.id ? { ...c, fileId: null } : c));
      toast.success("File deleted");
    } catch (err) {
      setError(apiErrorMessage(err, "Delete failed"));
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
      await mutateJson(
        `/api/galleries/${galleryId}/files/${file.id}`,
        { displayName },
        "PATCH",
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Rename failed"));
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
    downloadViaAnchor(`/api/gallery/${gallerySlug}/files/${file.id}/download`);
  }

  // ---- page-wide drop --------------------------------------------------
  function handleFiles(
    fileList: FileList | File[],
    folderId: string = activeFolder,
  ) {
    if (!folderId) return;
    setError(null);
    void upload(fileList, folderId);
  }

  return (
    <div className="space-y-4">
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
      <div className="flex gap-4 items-start">
        {/* Sets sidebar - sticky below the gallery header while the grid scrolls. */}
        <aside className="w-80 shrink-0 self-start lg:sticky lg:top-[184px] lg:max-h-[calc(100dvh-200px)] lg:overflow-y-auto border border-border p-4 scrollbar-none [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold tracking-wider text-ink-muted">
              Sets
            </span>
          </div>
          <div className="space-y-4">
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
                draggingFolder={draggingFolderId === f.id}
                reorderable={folders.length > 1}
                onReorderStart={(e) => beginFolderDrag(f.id, e)}
              />
            ))}
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
                const dropped = Array.from(e.dataTransfer.files);
                if (!dropped.length) return;
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
                    const created = await mutateJson<Folder>(
                      `/api/galleries/${galleryId}/folders`,
                      { name },
                    );
                    await refreshFolders();
                    setActiveFolder(created.id);
                    handleFiles(dropped, created.id);
                  } catch (err) {
                    setError(apiErrorMessage(err, "Could not create set"));
                  }
                })();
              }}
              className={`inline-flex h-5 w-5 items-center justify-center rounded-md border border-dashed transition-all ${dropNew ? "bg-accent text-white border-accent ring-4 ring-accent/40" : "border-border text-ink-muted hover:text-ink-strong hover:border-border-strong"}`}
            >
              <Plus size={16} />
            </button>
          </div>
        </aside>

        {/* Media column */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-xl font-extrabold tracking-wider text-ink-strong truncate">
              {folders.find((f) => f.id === activeFolder)?.name ?? "Media"}
            </h2>
            <span className="text-sm text-ink-muted tabular-nums">
              {order.length}
            </span>
            <div className="ml-auto flex items-center gap-4">
              <Filter
                size={20}
                className="shrink-0 text-ink-muted"
                aria-hidden
              />
              <Select
                value={sortMode}
                onChange={(v) => applySort(v as typeof sortMode)}
                className="w-40"
                options={[
                  { value: "manual", label: "Manual sort" },
                  { value: "name-asc", label: "Name A-Z" },
                  { value: "name-desc", label: "Name Z-A" },
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                  { value: "size-desc", label: "Largest" },
                ]}
              />
            </div>
            <Button
              onClick={() => inputRef.current?.click()}
              className="px-3.5 tracking-wider"
            >
              <Upload size={16} />
              Upload
            </Button>
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

          {/* Folder content - drop boundary */}
          <div
            className="relative space-y-4 min-h-64"
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
                      isCover={!cover.imageKey && cover.fileId === file.id}
                      selected={selected.has(file.id)}
                      busy={busyId === file.id}
                      reorderable={canDrag}
                      dragging={draggingIds.has(file.id)}
                      folders={folders}
                      activeFolder={activeFolder}
                      onRef={(n) => registerTile(file.id, n)}
                      onPointerDownReorder={(e) => beginDrag(file.id, e)}
                      onToggleSelect={(shift) => toggle(file.id, shift)}
                      onOpen={() => setPreviewId(file.id)}
                      onDelete={() => onDelete(file)}
                      onRename={() => renameFile(file)}
                      onCopyName={() => copyFilename(file)}
                      onDownload={() => downloadFile(file)}
                      onMove={(folderId) => moveFiles([file.id], folderId)}
                    />
                  );
                })}

                {/* Upload placeholders sit at the end (upload order) - the same slot
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
                          Processing
                        </span>
                      </>
                    )}
                    <span className="text-[11px] text-ink-muted truncate max-w-full">
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
          <div className="flex items-center gap-4">
            <Select
              value=""
              placeholder="Move to"
              className="w-44"
              onChange={(v) => {
                if (v === "__new__") void createFolderAndMove([...selected]);
                else if (v) void moveSelected(v);
              }}
              options={[
                ...folders.map((f) => ({ value: f.id, label: f.name })),
                { value: "__new__", label: "+ New set" },
              ]}
            />
            <Button
              variant="danger"
              onClick={deleteSelected}
              className="tracking-wider"
            >
              <Trash size={16} />
              Delete
            </Button>
            <Button
              variant="ghost"
              onClick={() => setSelected(new Set())}
              className="tracking-wider"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Drag overlay - clumped stack when dragging multiple */}
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
                <div className="absolute inset-0 rounded-lg bg-surface-sunken border border-border ring-2 ring-accent/50 rotate-4 translate-x-1.5 translate-y-1.5" />
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
              <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1.5 inline-flex items-center justify-center rounded-full bg-accent text-white text-xs font-bold tabular-nums ring-2 ring-surface">
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
