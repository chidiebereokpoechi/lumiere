"use client";

import { Bookmark, Download, ImageIcon } from "@/components/ui/icons";

// Fixed bottom action bar shown while a selection exists. Respects the iOS
// home-indicator inset.
export function SelectionBar({
  count,
  canDownload,
  showSavePhotos,
  savingPhotos,
  onClear,
  onAddToList,
  onSavePhotos,
  onDownload,
}: {
  count: number;
  canDownload: boolean;
  showSavePhotos: boolean;
  savingPhotos: boolean;
  onClear: () => void;
  onAddToList: () => void;
  onSavePhotos: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-2 flex-wrap flex-col">
        <div className="flex justify-between items-center gap-4">
          <span className="text-sm font-semibold text-ink-strong tabular-nums">
            {count} selected
          </span>
          <button
            type="button"
            onClick={onClear}
            className="px-2 py-2.5 text-sm font-semibold tracking-wider text-ink-muted hover:text-ink-strong"
          >
            Clear
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onAddToList}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm font-bold tracking-wider text-ink-strong hover:border-border-strong transition-colors"
          >
            <Bookmark size={24} />
          </button>
          {/* Save photos straight to the camera roll on touch devices */}
          {canDownload && showSavePhotos && (
            <button
              type="button"
              onClick={onSavePhotos}
              disabled={savingPhotos}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm font-bold tracking-wider text-ink-strong hover:border-border-strong transition-colors"
            >
              <ImageIcon size={24} />
              {savingPhotos ? "Preparing…" : "Save to photos"}
            </button>
          )}
          {canDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm font-bold tracking-wider text-ink-strong hover:border-border-strong transition-colors"
            >
              <Download size={24} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
