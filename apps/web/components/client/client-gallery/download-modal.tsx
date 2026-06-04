"use client";

import { useState } from "react";
import type { ClientFolder } from "@/lib/api/client-gallery";
import type { ClientList } from "@/lib/api/lists";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Check, Download } from "@/components/ui/icons";

// Lets the client pick which sets, lists, and/or favorites to download as one ZIP.
export function DownloadModal({
  folders,
  folderCounts,
  lists,
  canFavorite,
  favoritesCount,
  onClose,
  onDownload,
}: {
  folders: ClientFolder[];
  folderCounts: Map<string, number>;
  lists: ClientList[];
  canFavorite: boolean;
  favoritesCount: number;
  onClose: () => void;
  onDownload: (
    folderIds: string[],
    favorites: boolean,
    listFileIds: string[],
  ) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState(false);

  const nonEmptyFolders = folders.filter(
    (f) => (folderCounts.get(f.id) ?? 0) > 0,
  );
  const nonEmptyLists = lists.filter((l) => l.fileIds.length > 0);
  const allSelected =
    selected.size === nonEmptyFolders.length &&
    (!canFavorite || favorites) &&
    nonEmptyFolders.length > 0;
  const nothing = selected.size === 0 && selectedLists.size === 0 && !favorites;

  const toggleIn =
    (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
      set((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
  const toggleFolder = toggleIn(setSelected);
  const toggleList = toggleIn(setSelectedLists);

  const listFileIds = () => {
    const ids = new Set<string>();
    for (const l of nonEmptyLists)
      if (selectedLists.has(l.id)) l.fileIds.forEach((id) => ids.add(id));
    return [...ids];
  };

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
    <Modal
      onClose={onClose}
      labelledBy="download-title"
      className="w-[min(92vw,28rem)]"
    >
      <h2
        id="download-title"
        className="text-xs font-extrabold tracking-wider text-ink-muted"
      >
        Download
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Choose what to include - it downloads as one ZIP.
      </p>

      <ul className="mt-4 flex flex-col gap-2 max-h-72 overflow-y-auto">
        <Row
          checked={allSelected}
          onToggle={toggleAll}
          label="Everything"
          bold
        />
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
        {nonEmptyLists.length > 0 && (
          <>
            <li className="mt-2 text-xs font-bold tracking-wider text-ink-muted">
              Lists
            </li>
            {nonEmptyLists.map((l) => (
              <Row
                key={l.id}
                checked={selectedLists.has(l.id)}
                onToggle={() => toggleList(l.id)}
                label={l.name}
                count={l.fileIds.length}
              />
            ))}
          </>
        )}
      </ul>

      <div className="mt-5 flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          className="tracking-wider"
        >
          Cancel
        </Button>
        <Button
          onClick={() => onDownload([...selected], favorites, listFileIds())}
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
        className="flex w-full items-center gap-4 text-left hover:bg-surface-2"
      >
        <span
          className={`h-5 w-5 inline-flex items-center justify-center rounded border-2 ${checked ? "bg-accent border-accent text-white" : "border-border"}`}
        >
          {checked && <Check size={16} />}
        </span>
        <span
          className={`flex-1 text-xs text-ink-strong ${bold ? "font-bold" : ""}`}
        >
          {label}
        </span>
        {count !== undefined && (
          <span className="text-xs text-ink-muted tabular-nums">{count}</span>
        )}
      </button>
    </li>
  );
}
