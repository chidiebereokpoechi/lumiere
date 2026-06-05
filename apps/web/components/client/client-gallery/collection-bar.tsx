"use client";

import { Check, Download, ImageIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

// Persistent bottom bar inside a collection (collections nav). Mirrors the
// lightbox action row's language: a centered row of bordered buttons. Surfaces
// the primary save path — Save to Photos on touch when the collection is all
// media, otherwise a ZIP download — plus an entry into selection mode.
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
    <div className="fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-border px-2 sm:px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-row items-center justify-center gap-2">
        {canDownload &&
          (showSavePhotos ? (
            <Button
              onClick={onSavePhotos}
              disabled={savingPhotos || count === 0}
              className="tracking-wider"
            >
              <ImageIcon size={20} />
              {savingPhotos ? "Preparing…" : "Save to Photos"}
            </Button>
          ) : (
            <Button
              onClick={onDownload}
              disabled={count === 0}
              className="tracking-wider"
            >
              <Download size={20} />
              Download
            </Button>
          ))}
        <Button
          variant="secondary"
          onClick={onSelect}
          disabled={count === 0}
          className="tracking-wider"
        >
          <Check size={20} />
          Select
        </Button>
      </div>
    </div>
  );
}
