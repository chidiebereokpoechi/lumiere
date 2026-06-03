"use client";

import { useState } from "react";
import type { ClientList } from "@/lib/api/lists";
import { Check } from "@/components/ui/icons";

// Toggle file(s) in/out of lists, or create a new list and add them.
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
  const [name, setName] = useState("");
  // A list "contains" the target when every targeted file is in it.
  const contains = (l: ClientList) =>
    fileIds.every((id) => l.fileIds.includes(id));

  return (
    <div
      className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-6"
      >
        <h2 className="text-lg font-extrabold tracking-tight text-ink-strong">
          Add to list
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {fileIds.length === 1 ? "1 item" : `${fileIds.length} items`}
        </p>
        <ul className="mt-4 space-y-1 max-h-64 overflow-y-auto">
          {lists.length === 0 && (
            <li className="text-sm text-ink-subtle py-2">
              No lists yet — create one below.
            </li>
          )}
          {lists.map((l) => {
            const member = contains(l);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onToggle(l.id, !member)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <span
                    className={`h-5 w-5 inline-flex items-center justify-center rounded border-2 ${member ? "bg-accent border-accent text-white" : "border-border"}`}
                  >
                    {member && <Check size={24} />}
                  </span>
                  <span className="flex-1 text-sm text-ink-strong">
                    {l.name}
                  </span>
                  <span className="text-xs text-ink-subtle tabular-nums">
                    {l.fileIds.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim()) {
              await onCreate(name.trim());
              setName("");
            }
          }}
          className="mt-4 flex items-center gap-2 border-t border-border pt-4"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New list name…"
            className="flex-1 rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-accent border border-accent px-3 py-2 text-sm font-bold tracking-wider text-white hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50"
          >
            Create
          </button>
        </form>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold tracking-wider text-ink-muted hover:text-ink-strong"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
