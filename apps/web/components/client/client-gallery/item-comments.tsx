"use client";

import { useEffect, useState } from "react";
import { apiClient, apiErrorMessage, ApiError, postJson } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { CommentScope, ItemComment } from "@/lib/api/comments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/text-input";

// Per-item comments. Behavior depends on the collection the item is viewed in:
//   'set'              → public thread, pending the creator's approval.
//   'list'/'favorites' → a private editable note, visible only to its author
//                        + the creator. Authoring requires an identified session.
export function ItemComments({
  slug,
  fileId,
  scope,
  listId,
  email,
  onRequireEmail,
}: {
  slug: string;
  fileId: string;
  scope: CommentScope;
  listId?: string;
  email: string | null;
  onRequireEmail: () => void;
}) {
  const isPrivate = scope !== "set";
  const [items, setItems] = useState<ItemComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<"pending" | "saved" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = `fileId=${fileId}&scope=${scope}${listId ? `&listId=${listId}` : ""}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFlash(null);
    apiClient<{ comments: ItemComment[] }>(`/api/gallery/${slug}/comments?${qs}`)
      .then((r) => {
        if (!alive) return;
        setItems(r.comments);
        // Private note: prefill the editor with the existing note.
        if (isPrivate) setBody(r.comments[0]?.body ?? "");
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, qs, isPrivate, email]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    if (!email) {
      onRequireEmail();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await postJson(`/api/gallery/${slug}/comments`, {
        body: body.trim(),
        fileId,
        scope,
        ...(listId ? { listId } : {}),
      });
      if (isPrivate) {
        setFlash("saved");
        // Reflect the saved note locally.
        setItems([
          { id: "self", body: body.trim(), author: null, createdAt: 0, mine: true },
        ]);
      } else {
        setFlash("pending");
        setBody("");
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Slow down — too many comments."
          : apiErrorMessage(err, "Could not save"),
      );
    } finally {
      setPending(false);
    }
  }

  async function removeNote() {
    const note = items[0];
    if (!note || note.id === "self") {
      setBody("");
      setItems([]);
      return;
    }
    setError(null);
    try {
      await apiClient(`/api/gallery/${slug}/comments/${note.id}`, { method: "DELETE" });
      setBody("");
      setItems([]);
      setFlash(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not remove"));
    }
  }

  return (
    <div className="p-4">
      <h3 className="text-xs font-extrabold tracking-wider text-ink-muted mb-3">
        {isPrivate ? "Private note" : "Comments"}
      </h3>

      {!isPrivate && (
        <>
          {loading ? (
            <p className="text-sm text-ink-subtle">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-subtle">No comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-border bg-surface-2 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-strong truncate">
                      {c.author ?? "Guest"}
                    </span>
                    <span className="text-[11px] text-ink-subtle tabular-nums">
                      {formatDate(c.createdAt, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted whitespace-pre-wrap">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {isPrivate && (
        <p className="text-xs text-ink-subtle mb-2">
          Only you and the photographer can see this.
        </p>
      )}

      {/* Composer */}
      {!email ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onRequireEmail}
          className="mt-2 tracking-wider"
        >
          {isPrivate ? "Sign in to add a note" : "Sign in to comment"}
        </Button>
      ) : flash === "pending" ? (
        <p className="mt-4 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink-muted">
          Submitted — it appears once the creator approves it.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <Textarea
            value={body}
            onChange={setBody}
            rows={3}
            placeholder={
              isPrivate ? "Add a private note…" : "Leave a comment on this item…"
            }
            className="px-3 py-2"
          />
          {error && (
            <p className="text-sm font-semibold text-negative">{error}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={pending || !body.trim()}
              className="px-3.5 py-2 tracking-wider"
            >
              {pending ? "Saving…" : isPrivate ? "Save note" : "Post"}
            </Button>
            {isPrivate && items.length > 0 && (
              <button
                type="button"
                onClick={removeNote}
                className="text-sm font-semibold tracking-wider text-ink-muted hover:text-negative"
              >
                Remove
              </button>
            )}
            {flash === "saved" && (
              <span className="text-xs text-ink-subtle">Saved</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
