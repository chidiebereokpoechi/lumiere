"use client";

import { useEffect } from "react";
import type { ClientFile } from "@/lib/api/client-gallery";
import {
  Bookmark,
  Check,
  Close,
  Comment,
  Download,
  Heart,
  HeartOpen,
  ImageIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

// Quick-action menu on long-press of a gallery item. Same language as the
// selection / collection bars: a header (filename + Done) over a centered row
// of bordered buttons. Backdrop + Escape close.
export function ItemActionSheet({
  file,
  canDownload,
  canFavorite,
  allowComments,
  coarse,
  isFavorite,
  onSelect,
  onFavorite,
  onAddToList,
  onRemoveFromList,
  onComment,
  onDownload,
  onShare,
  onClose,
}: {
  file: ClientFile;
  canDownload: boolean;
  canFavorite: boolean;
  allowComments: boolean;
  coarse: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  onAddToList: () => void;
  onRemoveFromList?: () => void;
  onComment: () => void;
  onDownload: () => void;
  onShare: () => void;
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
  const canShare =
    canDownload && coarse && (file.type === "image" || file.type === "video");

  return (
    <div
      className="fixed inset-0 z-60 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        role="menu"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[min(92vw,26rem)] bg-surface border-t sm:border border-border px-2 sm:px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="min-w-0 truncate text-sm font-bold tracking-wider text-ink-strong">
            {file.filename}
          </span>
          <Button
            variant="ghost"
            onClick={onClose}
            className="px-3 py-1.5 tracking-wider"
          >
            Done
          </Button>
        </div>

        <div className="flex flex-row flex-wrap items-center justify-center gap-2">
          <Button
            variant="secondary"
            onClick={act(onSelect)}
            className="tracking-wider"
          >
            <Check size={20} />
            Select
          </Button>
          {canFavorite && (
            <Button
              variant="secondary"
              onClick={act(onFavorite)}
              className="tracking-wider"
            >
              {isFavorite ? <Heart size={20} /> : <HeartOpen size={20} />}
              {isFavorite ? "Unfavorite" : "Favorite"}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={act(onAddToList)}
            className="tracking-wider"
          >
            <Bookmark size={20} />
            Add to list
          </Button>
          {onRemoveFromList && (
            <Button
              variant="secondary"
              onClick={act(onRemoveFromList)}
              className="tracking-wider"
            >
              <Close size={20} />
              Remove
            </Button>
          )}
          {allowComments && (
            <Button
              variant="secondary"
              onClick={act(onComment)}
              className="tracking-wider"
            >
              <Comment size={20} />
              Comment
            </Button>
          )}
          {/* Hybrid save: Save to Photos on touch media, else a download. */}
          {canShare ? (
            <Button onClick={act(onShare)} className="tracking-wider">
              <ImageIcon size={20} />
              Save to Photos
            </Button>
          ) : (
            canDownload && (
              <Button onClick={act(onDownload)} className="tracking-wider">
                <Download size={20} />
                Download
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
