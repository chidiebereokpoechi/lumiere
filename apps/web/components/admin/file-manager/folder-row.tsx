"use client";

import { cn } from "@/lib/cn";
import { Eye, EyeOff, Pen, Close, Grip } from "@/components/ui/icons";

// Vertical set/folder row for the sidebar: select, count, drop-target for file
// drags, a drag handle to reorder sets, plus hover actions (hide / rename /
// delete).
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
          className={cn(
            "shrink-0 cursor-grab active:cursor-grabbing",
            active || isDropTarget
              ? "text-ink-inverse/60 hover:text-ink-inverse"
              : "text-ink-subtle hover:text-ink-strong",
          )}
        >
          <Grip size={15} />
        </button>
      )}
      <span className="flex-1 min-w-0 inline-flex items-center gap-1.5 text-left text-sm font-semibold">
        {hidden && <EyeOff size={14} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "tabular-nums text-xs shrink-0 group-hover/row:hidden",
          active || isDropTarget ? "text-ink-inverse/70" : "text-ink-subtle",
        )}
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
            className={
              active
                ? "text-ink-inverse/80 hover:text-ink-inverse"
                : "text-ink-subtle hover:text-negative"
            }
          >
            <Close size={14} />
          </button>
        )}
      </span>
    </div>
  );
}
