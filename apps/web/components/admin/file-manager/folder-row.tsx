"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { EyeOff, Grip, More } from "@/components/ui/icons";

// Vertical set/folder row for the sidebar: select, count, drop-target for file
// drags, a drag handle to reorder sets, plus a ⋯ menu (hide / rename / delete).
export function FolderRow({
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
  reorderable,
  draggingFolder,
  onReorderStart,
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
  reorderable?: boolean;
  draggingFolder?: boolean;
  onReorderStart?: (e: React.PointerEvent) => void;
}) {
  const hasFiles = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files");
  const dim = hidden && !active && !isDropTarget;
  const onTint =
    active || isDropTarget
      ? "text-ink-inverse/70 hover:text-ink-inverse"
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
      className={cn(
        "group/row flex items-center gap-4 rounded-md border px-4 py-4 cursor-pointer transition-colors focus-visible:outline-none",
        isDropTarget
          ? "bg-accent text-ink-inverse border-accent ring-2 ring-accent/40"
          : active
            ? "bg-surface-strong text-ink-inverse border-surface-strong"
            : "bg-surface text-ink-muted border-border hover:text-ink-strong hover:border-border-strong",
        dim && "opacity-60",
        draggingFolder && "opacity-60 ring-2 ring-accent",
      )}
    >
      {reorderable && (
        <button
          type="button"
          aria-label="Reorder set"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation();
            onReorderStart?.(e);
          }}
          style={{ touchAction: "none" }}
          className={cn("shrink-0 cursor-grab active:cursor-grabbing", onTint)}
        >
          <Grip size={16} />
        </button>
      )}
      <span className="flex-1 min-w-0 inline-flex items-center gap-1.5 text-left text-sm font-semibold">
        {hidden && <EyeOff size={16} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "tabular-nums text-xs shrink-0",
          active || isDropTarget ? "text-ink-inverse/70" : "text-ink-subtle",
        )}
      >
        {count}
      </span>
      {(onToggleHidden || onRename || onDelete) && (
        <FolderMenu
          hidden={hidden}
          tint={onTint}
          onRename={onRename}
          onDelete={onDelete}
          onToggleHidden={onToggleHidden}
        />
      )}
    </div>
  );
}

// ⋯ actions menu for a set. Outside-click closes; each action stops propagation
// so it doesn't also select the row.
function FolderMenu({
  hidden,
  tint,
  onRename,
  onDelete,
  onToggleHidden,
}: {
  hidden?: boolean;
  tint: string;
  onRename?: () => void;
  onDelete?: () => void;
  onToggleHidden?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    fn?.();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="Set actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn("-mr-1 inline-flex items-center justify-center", tint)}
      >
        <More size={16} />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-border bg-surface shadow-lg p-1.5 text-sm text-ink-strong"
          onClick={(e) => e.stopPropagation()}
        >
          {onToggleHidden && (
            <button
              type="button"
              onClick={run(onToggleHidden)}
              className="w-full text-left rounded px-2.5 py-1.5 hover:bg-surface-2"
            >
              {hidden ? "Show to clients" : "Hide from clients"}
            </button>
          )}
          {onRename && (
            <button
              type="button"
              onClick={run(onRename)}
              className="w-full text-left rounded px-2.5 py-1.5 hover:bg-surface-2"
            >
              Rename
            </button>
          )}
          {onDelete && (
            <>
              <div className="my-1 mx-1 h-px bg-border" />
              <button
                type="button"
                onClick={run(onDelete)}
                className="w-full text-left rounded px-2.5 py-1.5 text-negative hover:bg-surface-2"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
