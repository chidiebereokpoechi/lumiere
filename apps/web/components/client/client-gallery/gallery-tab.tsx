"use client";

import { cn } from "@/lib/cn";
import { More } from "@/components/ui/icons";

// Plain text tab — a folder, favorites, or a list. Active gets a filled
// treatment; list tabs get a ⋯ that opens the list action sheet.
export function GalleryTab({
  active,
  onClick,
  label,
  count,
  icon,
  onMenu,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
  onMenu?: () => void;
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
        onMenu ? "pr-2" : "pr-4",
        active
          ? "bg-surface-strong text-ink-inverse border-surface-strong"
          : "bg-surface text-ink-muted border-border hover:bg-surface-2 hover:text-ink-strong hover:border-border-strong",
      )}
    >
      {icon && <span className="shrink-0 inline-flex">{icon}</span>}
      <span className="truncate max-w-[42vw] sm:max-w-56">{label}</span>
      <span
        className={`tabular-nums text-xs ${active ? "text-ink-inverse/70" : "text-ink-subtle"}`}
      >
        {count}
      </span>
      {onMenu && (
        <button
          type="button"
          aria-label="List actions"
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
          className={`inline-flex h-5 w-5 items-center justify-center ${active ? "text-ink-inverse/80 hover:text-ink-inverse" : "text-ink-subtle hover:text-ink-strong"}`}
        >
          <More size={16} />
        </button>
      )}
    </span>
  );
}
