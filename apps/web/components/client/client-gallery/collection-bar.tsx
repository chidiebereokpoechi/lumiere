"use client";

import { Check, Download, ImageIcon } from "@/components/ui/icons";

// Persistent bottom bar shown inside a collection (collections nav), in the same
// language as the selection / long-press sheets. Surfaces the primary save path
// — Save to Photos on touch when the collection is all media (the mobile-saving
// happy path), otherwise a ZIP download — plus an entry into selection mode.
export function CollectionBar({
  count,
  canDownload,
  showSavePhotos,
  savingPhotos,
  onSelect,
  onSavePhotos,
  onDownload,
}: {
  count: number;
  canDownload: boolean;
  showSavePhotos: boolean;
  savingPhotos: boolean;
  onSelect: () => void;
  onSavePhotos: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.15)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col sm:flex-row sm:flex-wrap">
        {canDownload &&
          (showSavePhotos ? (
            <Row
              icon={<ImageIcon size={20} />}
              label={savingPhotos ? "Preparing…" : "Save to photos"}
              onClick={onSavePhotos}
              disabled={savingPhotos || count === 0}
            />
          ) : (
            <Row
              icon={<Download size={20} />}
              label="Download"
              onClick={onDownload}
              disabled={count === 0}
            />
          ))}
        <Row
          icon={<Check size={20} />}
          label="Select"
          onClick={onSelect}
          disabled={count === 0}
        />
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
