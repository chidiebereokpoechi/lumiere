"use client";

import { useEffect } from "react";
import type { ClientFile } from "@/lib/api/client-gallery";
import {
  Bookmark,
  Check,
  Close,
  Download,
  Heart,
  HeartOpen,
  ImageIcon,
} from "@/components/ui/icons";

// Bottom action sheet shown on long-press of a gallery item (Apple-Photos-style
// quick actions). Backdrop + Escape close.
export function ItemActionSheet({
  file,
  canDownload,
  canFavorite,
  coarse,
  isFavorite,
  onSelect,
  onFavorite,
  onAddToList,
  onRemoveFromList,
  onDownload,
  onShare,
  onClose,
}: {
  file: ClientFile;
  canDownload: boolean;
  canFavorite: boolean;
  coarse: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  onAddToList: () => void;
  onRemoveFromList?: () => void;
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
        className="w-full sm:w-[min(92vw,22rem)] bg-surface border-t sm:border border-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.15)]"
      >
        <p className="px-3 py-2 text-sm font-semibold text-ink-strong truncate">
          {file.filename}
        </p>
        <SheetItem icon={<Check size={20} />} label="Select" onClick={act(onSelect)} />
        {canFavorite && (
          <SheetItem
            icon={isFavorite ? <Heart size={20} /> : <HeartOpen size={20} />}
            label={isFavorite ? "Remove favorite" : "Favorite"}
            onClick={act(onFavorite)}
          />
        )}
        <SheetItem
          icon={<Bookmark size={20} />}
          label="Add to list"
          onClick={act(onAddToList)}
        />
        {onRemoveFromList && (
          <SheetItem
            icon={<Close size={20} />}
            label="Remove from list"
            onClick={act(onRemoveFromList)}
          />
        )}
        {canShare && (
          <SheetItem
            icon={<ImageIcon size={20} />}
            label="Save to photos"
            onClick={act(onShare)}
          />
        )}
        {canDownload && (
          <SheetItem
            icon={<Download size={20} />}
            label="Download"
            onClick={act(onDownload)}
          />
        )}
      </div>
    </div>
  );
}

function SheetItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-semibold text-ink-strong hover:bg-surface-2"
    >
      <span className="text-ink-muted">{icon}</span>
      {label}
    </button>
  );
}
