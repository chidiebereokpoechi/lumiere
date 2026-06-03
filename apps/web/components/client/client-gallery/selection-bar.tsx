"use client";

import {
  Bookmark,
  Download,
  Heart,
  ImageIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

// Fixed bottom action bar shown while in selection mode. Respects the iOS
// home-indicator inset. Bulk favorite / add-to-list / save / download act on the
// current selection; Done exits selection mode.
export function SelectionBar({
  count,
  canDownload,
  canFavorite,
  showSavePhotos,
  savingPhotos,
  onDone,
  onFavorite,
  onAddToList,
  onSavePhotos,
  onDownload,
}: {
  count: number;
  canDownload: boolean;
  canFavorite: boolean;
  showSavePhotos: boolean;
  savingPhotos: boolean;
  onDone: () => void;
  onFavorite: () => void;
  onAddToList: () => void;
  onSavePhotos: () => void;
  onDownload: () => void;
}) {
  const disabled = count === 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-2 flex-wrap flex-col">
        <div className="flex justify-between items-center gap-4 w-full sm:w-auto">
          <span className="text-sm font-semibold text-ink-strong tabular-nums">
            {count > 0 ? `${count} selected` : "Select items"}
          </span>
          <button
            type="button"
            onClick={onDone}
            className="px-2 py-2.5 text-sm font-semibold tracking-wider text-ink-muted hover:text-ink-strong"
          >
            Done
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canFavorite && (
            <Button
              variant="secondary"
              onClick={onFavorite}
              disabled={disabled}
              className="px-3.5 tracking-wider"
            >
              <Heart size={24} />
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={onAddToList}
            disabled={disabled}
            className="px-3.5 tracking-wider"
          >
            <Bookmark size={24} />
          </Button>
          {/* Save photos straight to the camera roll on touch devices */}
          {canDownload && showSavePhotos && (
            <Button
              variant="secondary"
              onClick={onSavePhotos}
              disabled={savingPhotos || disabled}
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
              disabled={disabled}
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
