"use client";

import { cn } from "@/lib/cn";
import { Close } from "@/components/ui/icons";

// Plain text tab — a folder, favorites, or a list. Active gets a filled
// treatment; list tabs reveal a delete affordance.
export function GalleryTab({
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
        "group/tab shrink-0 inline-flex items-center gap-1.5 rounded-md border cursor-pointer pl-4 py-2.5 text-sm font-bold tracking-wider whitespace-nowrap transition-colors focus-visible:outline-none",
        onDelete ? "pr-2" : "pr-4",
        active
          ? "bg-surface-strong text-ink-inverse border-surface-strong"
          : "bg-surface text-ink-muted border-border hover:bg-surface-2 hover:text-ink-strong hover:border-border-strong",
      )}
    >
      <span className="truncate max-w-[42vw] sm:max-w-56">{label}</span>
      <span
        className={`tabular-nums text-xs ${active ? "text-ink-inverse/70" : "text-ink-subtle"}`}
      >
        {count}
      </span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete list"
          className={`inline-flex h-5 w-5 items-center justify-center ${active ? "text-ink-inverse/80 hover:text-ink-inverse" : "text-ink-subtle hover:text-negative"}`}
        >
          <Close size={16} />
        </button>
      )}
    </span>
  );
}
