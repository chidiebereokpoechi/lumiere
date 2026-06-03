"use client";

import {
  Bookmark,
  Download,
  Heart,
  ImageIcon,
} from "@/components/ui/icons";

// Bottom sheet shown in selection mode — same language as the long-press and
// add-to-list sheets: a header (count + Done) over labeled action rows that act
// on the current selection. Disabled until something is selected.
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
  onSavePhotos: () => void;
  onDownload: () => void;
}) {
  const disabled = count === 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.15)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between px-3 pt-1 pb-1">
        <span className="text-sm font-extrabold tracking-wider text-ink-strong tabular-nums">
          {count > 0 ? `${count} selected` : "Select items"}
        </span>
        <button
          type="button"
          onClick={onDone}
          className="px-2 py-1 text-sm font-semibold tracking-wider text-ink-muted hover:text-ink-strong"
        >
          Done
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap">
        {canFavorite && (
          <Row
            icon={<Heart size={20} />}
            label={allFavorited ? "Unfavorite" : "Favorite"}
            onClick={onFavorite}
            disabled={disabled}
          />
        )}
        <Row
          icon={<Bookmark size={20} />}
          label="Add to list"
          onClick={onAddToList}
          disabled={disabled}
        />
        {canDownload && showSavePhotos && (
          <Row
            icon={<ImageIcon size={20} />}
            label={savingPhotos ? "Preparing…" : "Save to photos"}
            onClick={onSavePhotos}
            disabled={disabled || savingPhotos}
          />
        )}
        {canDownload && (
          <Row
            icon={<Download size={20} />}
            label="Download"
            onClick={onDownload}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex sm:flex-1 items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-semibold text-ink-strong hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
    >
      <span className="text-ink-muted">{icon}</span>
      {label}
    </button>
  );
}
