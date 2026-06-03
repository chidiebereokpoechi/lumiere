"use client";

import { Bookmark, Download, ImageIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

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
          <Button
            variant="secondary"
            onClick={onAddToList}
            className="px-3.5 tracking-wider"
          >
            <Bookmark size={24} />
          </Button>
          {/* Save photos straight to the camera roll on touch devices */}
          {canDownload && showSavePhotos && (
            <Button
              variant="secondary"
              onClick={onSavePhotos}
              disabled={savingPhotos}
              className="px-3.5 tracking-wider"
            >
              <ImageIcon size={24} />
              {savingPhotos ? "Preparing…" : "Save to photos"}
            </Button>
          )}
          {canDownload && (
            <Button
              variant="secondary"
              onClick={onDownload}
              className="px-3.5 tracking-wider"
            >
              <Download size={24} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
