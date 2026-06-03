"use client";

import { useState } from "react";
import type { ClientFolder } from "@/lib/api/client-gallery";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Check, Download } from "@/components/ui/icons";

// Lets the client pick which sets (and/or favorites) to download as one ZIP.
export function DownloadModal({
  folders,
  folderCounts,
  canFavorite,
  favoritesCount,
  onClose,
  onDownload,
}: {
  folders: ClientFolder[];
  folderCounts: Map<string, number>;
  canFavorite: boolean;
  favoritesCount: number;
  onClose: () => void;
  onDownload: (folderIds: string[], favorites: boolean) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState(false);

  const nonEmptyFolders = folders.filter((f) => (folderCounts.get(f.id) ?? 0) > 0);
  const allSelected =
    selected.size === nonEmptyFolders.length &&
    (!canFavorite || favorites) &&
    nonEmptyFolders.length > 0;
  const nothing = selected.size === 0 && !favorites;

  const toggleFolder = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      setFavorites(false);
    } else {
      setSelected(new Set(nonEmptyFolders.map((f) => f.id)));
      if (canFavorite && favoritesCount > 0) setFavorites(true);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="download-title">
      <h2
        id="download-title"
        className="text-lg font-extrabold tracking-tight text-ink-strong"
      >
        Download
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Choose what to include — it downloads as one ZIP.
      </p>

      <ul className="mt-4 space-y-1 max-h-72 overflow-y-auto">
        <Row checked={allSelected} onToggle={toggleAll} label="Everything" bold />
        {nonEmptyFolders.map((f) => (
          <Row
            key={f.id}
            checked={selected.has(f.id)}
            onToggle={() => toggleFolder(f.id)}
            label={f.name}
            count={folderCounts.get(f.id) ?? 0}
          />
        ))}
        {canFavorite && favoritesCount > 0 && (
          <Row
            checked={favorites}
            onToggle={() => setFavorites((v) => !v)}
            label="Favorites"
            count={favoritesCount}
          />
        )}
      </ul>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold tracking-wider text-ink-muted hover:text-ink-strong"
        >
          Cancel
        </button>
        <Button
          onClick={() => onDownload([...selected], favorites)}
          disabled={nothing}
          className="tracking-wider"
        >
          <Download size={16} />
          Download
        </Button>
      </div>
    </Modal>
  );
}

function Row({
  checked,
  onToggle,
  label,
  count,
  bold,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  count?: number;
  bold?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
      >
        <span
          className={`h-5 w-5 inline-flex items-center justify-center rounded border-2 ${checked ? "bg-accent border-accent text-white" : "border-border"}`}
        >
          {checked && <Check size={16} />}
        </span>
        <span
          className={`flex-1 text-sm text-ink-strong ${bold ? "font-bold" : ""}`}
        >
          {label}
        </span>
        {count !== undefined && (
          <span className="text-xs text-ink-subtle tabular-nums">{count}</span>
        )}
      </button>
    </li>
  );
}
