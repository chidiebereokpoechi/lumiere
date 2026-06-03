"use client";

import type { WatermarkPreset } from "@/lib/api/watermarks";
import { Pen, Trash } from "@/components/ui/icons";
import { draftFrom } from "./draft";
import { WatermarkPreview } from "./watermark-preview";

// Grid card for a saved preset: compact preview + edit/delete actions.
export function PresetCard({
  preset,
  onEdit,
  onDelete,
}: {
  preset: WatermarkPreset;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <WatermarkPreview draft={draftFrom(preset)} compact />
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-strong truncate">
            {preset.name}
          </p>
          <p className="text-[11px] tracking-wider text-ink-muted">
            {preset.type}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            title="Edit"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink-strong"
          >
            <Pen size={16} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-negative"
          >
            <Trash size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
