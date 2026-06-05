"use client";

import {
  Bookmark,
  Close,
  Download,
  Heart,
  ImageIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

// Bottom bar shown in selection mode. Same language as the collection bar /
// lightbox action row: a header (count + Done) over a centered row of bordered
// buttons acting on the current selection. Disabled until something's selected.
export function SelectionBar({
  count,
  canDownload,
  canFavorite,
  allFavorited,
  showSavePhotos,
  savingPhotos,
  onDone,
  onFavorite,
  onAddToList,
  onRemoveFromList,
  onSavePhotos,
  onDownload,
}: {
  count: number;
  canDownload: boolean;
  canFavorite: boolean;
  allFavorited: boolean;
  showSavePhotos: boolean;
  savingPhotos: boolean;
  onDone: () => void;
  onFavorite: () => void;
  onAddToList: () => void;
  onRemoveFromList?: () => void;
  onSavePhotos: () => void;
  onDownload: () => void;
}) {
  const disabled = count === 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-border px-2 sm:px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-sm font-extrabold tracking-wider text-ink-strong tabular-nums">
          {count > 0 ? `${count} selected` : "Select items"}
        </span>
        <Button
          variant="ghost"
          onClick={onDone}
          className="px-3 py-1.5 tracking-wider"
        >
          Done
        </Button>
      </div>

      <div className="flex flex-row flex-wrap items-center justify-center gap-2">
        {canFavorite && (
          <Button
            variant="secondary"
            onClick={onFavorite}
            disabled={disabled}
            className="tracking-wider"
          >
            <Heart size={20} />
            {allFavorited ? "Unfavorite" : "Favorite"}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={onAddToList}
          disabled={disabled}
          className="tracking-wider"
        >
          <Bookmark size={20} />
          Add to list
        </Button>
        {onRemoveFromList && (
          <Button
            variant="secondary"
            onClick={onRemoveFromList}
            disabled={disabled}
            className="tracking-wider"
          >
            <Close size={20} />
            Remove
          </Button>
        )}
        {/* Hybrid save: Save to Photos when the selection is all media on touch,
            else a download. */}
        {canDownload &&
          (showSavePhotos ? (
            <Button
              onClick={onSavePhotos}
              disabled={disabled || savingPhotos}
              className="tracking-wider"
            >
              <ImageIcon size={20} />
              {savingPhotos ? "Preparing…" : "Save to Photos"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={onDownload}
              disabled={disabled}
              className="tracking-wider"
            >
              <Download size={20} />
              Download
            </Button>
          ))}
      </div>
    </div>
  );
}
