"use client";

import { useEffect, useState } from "react";
import type { ClientList } from "@/lib/api/lists";
import { Bookmark, Check, Plus } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";

// Bottom sheet to add file(s) to lists — Instagram-bookmarks / Spotify-playlist
// style: a "New list" row on top, then the lists with a tick when the target is
// already in them. Toggling is immediate; tapping the backdrop / Escape closes.
export function ListPickerModal({
  fileIds,
  lists,
  onClose,
  onToggle,
  onCreate,
}: {
  fileIds: string[];
  lists: ClientList[];
  onClose: () => void;
  onToggle: (listId: string, member: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A list "contains" the target when every targeted file is in it.
  const contains = (l: ClientList) =>
    fileIds.every((id) => l.fileIds.includes(id));

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      await onCreate(name.trim());
      setName("");
      setCreating(false);
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-60 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[min(92vw,24rem)] max-h-[80svh] flex flex-col bg-surface border-t sm:border border-border shadow-[0_-8px_30px_rgba(0,0,0,0.15)]"
      >
        <div className="px-4 pt-3 pb-2">
          <p
            id="list-picker-title"
            className="text-sm font-extrabold tracking-wider text-ink-strong"
          >
            Add to list
          </p>
          <p className="text-xs text-ink-subtle">
            {fileIds.length === 1 ? "1 item" : `${fileIds.length} items`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {/* New list */}
          {creating ? (
            <form
              onSubmit={submitNew}
              className="flex items-center gap-2 px-3 py-2"
            >
              <TextInput
                value={name}
                onChange={setName}
                autoFocus
                placeholder="New list name…"
                className="flex-1 px-3 py-2"
              />
              <Button
                type="submit"
                disabled={!name.trim() || pending}
                className="tracking-wider"
              >
                {pending ? "…" : "Create"}
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-semibold text-ink-strong hover:bg-surface-2"
            >
              <span className="h-9 w-9 inline-flex items-center justify-center bg-surface-2 text-ink-muted">
                <Plus size={20} />
              </span>
              New list
            </button>
          )}

          {lists.map((l) => {
            const member = contains(l);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onToggle(l.id, !member);
                  onClose();
                }}
                aria-pressed={member}
                className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-surface-2"
              >
                <span className="h-9 w-9 shrink-0 inline-flex items-center justify-center bg-surface-2 text-ink-muted">
                  <Bookmark size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-ink-strong truncate">
                    {l.name}
                  </span>
                  <span className="block text-xs text-ink-subtle tabular-nums">
                    {l.fileIds.length} item{l.fileIds.length === 1 ? "" : "s"}
                  </span>
                </span>
                <span
                  className={`h-6 w-6 shrink-0 inline-flex items-center justify-center border-2 ${member ? "bg-accent border-accent text-white" : "border-border text-transparent"}`}
                >
                  <Check size={16} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
