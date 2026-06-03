"use client";

import { useEffect } from "react";
import { Pen, Trash } from "@/components/ui/icons";

// Bottom action sheet for a client list — same language as the long-press /
// add-to-list sheets. Backdrop + Escape close.
export function ListActionSheet({
  name,
  onRename,
  onDelete,
  onClose,
}: {
  name: string;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div
      className="fixed inset-0 z-60 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        role="menu"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[min(92vw,22rem)] bg-surface border-t sm:border border-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.15)]"
      >
        <p className="px-3 py-2 text-sm font-semibold text-ink-strong truncate">
          {name}
        </p>
        <button
          type="button"
          role="menuitem"
          onClick={act(onRename)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-semibold text-ink-strong hover:bg-surface-2"
        >
          <span className="text-ink-muted">
            <Pen size={20} />
          </span>
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={act(onDelete)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-semibold text-negative hover:bg-surface-2"
        >
          <span>
            <Trash size={20} />
          </span>
          Delete
        </button>
      </div>
    </div>
  );
}
