"use client";

import { useEffect, useRef, useState } from "react";
import type { GalleryFile } from "@/lib/api/files";
import type { Folder } from "@/lib/api/folders";
import { More, Check, Play } from "@/components/ui/icons";
import { Spinner, Badge, TypeIcon } from "./bits";

export function FileTile({
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
    <div className="group relative flex flex-col gap-1.5">
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
              <span className="text-xs text-ink-muted">Processing</span>
            </div>
          )
        ) : file.type === "video" ? (
          <>
            {file.s3KeyThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/img/${galleryId}/${file.id}/thumb`}
                alt={name}
                draggable={false}
                className="h-full w-full object-contain bg-black"
              />
            ) : (
              <video
                src={`${streamUrl}#t=0.1`}
                preload="metadata"
                muted
                playsInline
                className="h-full w-full object-contain bg-black"
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-black/50 text-white">
                <Play size={20} />
              </span>
            </span>
            <Badge>Video</Badge>
          </>
        ) : file.s3KeyThumbnail ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/img/${galleryId}/${file.id}/thumb`}
              alt={name}
              draggable={false}
              className="h-full w-full object-cover"
            />
            <Badge>{file.type === "audio" ? "Audio" : "File"}</Badge>
          </>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-3 text-center">
            <TypeIcon type={file.type} />
            <Badge>{file.type === "audio" ? "Audio" : "File"}</Badge>
          </div>
        )}

        {!dragging && isCover && (
          <span className="absolute bottom-2 left-2 rounded-md bg-surface-strong text-ink-inverse px-2 py-0.5 text-[10px] font-extrabold tracking-wider">
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
            className={`absolute top-2 left-2 h-4 w-4 inline-flex items-center justify-center rounded-full border-2 transition-all ${selected ? "bg-accent border-accent text-white opacity-100" : "bg-black/30 border-white/80 text-transparent opacity-0 group-hover:opacity-100"}`}
          >
            <Check size={16} />
          </button>
        )}

        {!dragging && selected && (
          <div className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-accent rounded-lg" />
        )}
      </div>
      {/* Menu lives outside the overflow-hidden media box so its dropdown
          isn't clipped by the tile. */}
      {!dragging && (
        <TileMenu
          file={file}
          busy={busy}
          folders={folders}
          activeFolder={activeFolder}
          onOpen={onOpen}
          onDownload={onDownload}
          onRename={onRename}
          onCopyName={onCopyName}
          onMove={onMove}
          onDelete={onDelete}
        />
      )}
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
  busy,
  folders,
  activeFolder,
  onOpen,
  onDownload,
  onRename,
  onCopyName,
  onMove,
  onDelete,
}: {
  file: GalleryFile;
  busy: boolean;
  folders: Folder[];
  activeFolder: string;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onCopyName: () => void;
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
        <More size={16} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-md border border-border bg-surface shadow-lg p-1.5 text-sm z-20">
          <MenuItem onClick={run(onOpen)} label="Open" />
          <MenuItem onClick={run(onDownload)} label="Download" />
          <MenuItem onClick={run(onRename)} label="Rename" />
          <MenuItem onClick={run(onCopyName)} label="Copy filename" />
          {otherFolders.length > 0 && (
            <>
              <div className="my-1 mx-1 h-px bg-border" />
              <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-bold tracking-wider text-ink-muted">
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
