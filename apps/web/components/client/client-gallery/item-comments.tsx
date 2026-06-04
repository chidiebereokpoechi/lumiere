"use client";

import { useEffect, useState } from "react";
import { apiClient, apiErrorMessage, ApiError, postJson } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { CommentScope, ItemComment } from "@/lib/api/comments";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/text-input";

// Per-item comment. One comment/note per author (editable):
//   'set'              → a public comment (pending the creator's approval),
//                        shown alongside other people's approved comments.
//   'list'/'favorites' → a private note, visible only to its author + creator.
// Authoring requires an identified session.
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
  const [others, setOthers] = useState<ItemComment[]>([]);
  const [mine, setMine] = useState<ItemComment | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = `fileId=${fileId}&scope=${scope}${listId ? `&listId=${listId}` : ""}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSaved(false);
    apiClient<{ comments: ItemComment[] }>(`/api/gallery/${slug}/comments?${qs}`)
      .then((r) => {
        if (!alive) return;
        const own = r.comments.find((c) => c.mine) ?? null;
        setOthers(r.comments.filter((c) => !c.mine));
        setMine(own);
        setBody(own?.body ?? "");
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, qs, email]);

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
      const res = (await postJson(`/api/gallery/${slug}/comments`, {
        body: body.trim(),
        fileId,
        scope,
        ...(listId ? { listId } : {}),
      })) as { id: string };
      setMine({
        id: res.id,
        body: body.trim(),
        author: email,
        createdAt: mine?.createdAt ?? 0,
        mine: true,
        pending: !isPrivate, // public comments go back to pending on edit
      });
      setSaved(true);
      toast.success(isPrivate ? "Note saved" : "Comment sent for approval");
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

  async function removeMine() {
    if (mine && mine.id !== "self") {
      try {
        await apiClient(`/api/gallery/${slug}/comments/${mine.id}`, {
          method: "DELETE",
        });
      } catch (err) {
        setError(apiErrorMessage(err, "Could not remove"));
        return;
      }
    }
    setMine(null);
    setBody("");
    setSaved(false);
    toast.success(isPrivate ? "Note removed" : "Comment removed");
  }

  // An approved public comment is locked — no editing or removing.
  const locked = !isPrivate && !!mine && !mine.pending;
  const saveLabel = pending
    ? "Saving…"
    : isPrivate
      ? "Save note"
      : mine
        ? "Update comment"
        : "Post comment";

  return (
    <div className="p-4">
      <h3 className="text-xs font-extrabold tracking-wider text-ink-muted mb-3">
        {isPrivate ? "Private note" : "Comments"}
      </h3>

      {/* Other people's approved public comments (set scope only). */}
      {!isPrivate && (
        <>
          {loading ? (
            <p className="text-sm text-ink-subtle">Loading…</p>
          ) : others.length === 0 && !mine ? (
            <p className="text-sm text-ink-subtle">No comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {others.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-border bg-surface-2 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-strong truncate">
                      {c.author ?? "Guest"}
                    </span>
                    <span className="text-[11px] text-ink-subtle tabular-nums shrink-0">
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

      {/* Your single editable comment/note. Once a public comment is approved
          it locks — no further edits or removal. */}
      {!email ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onRequireEmail}
          className="mt-2 tracking-wider"
        >
          {isPrivate ? "Sign in to add a note" : "Sign in to comment"}
        </Button>
      ) : locked ? (
        <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold tracking-wider text-ink-subtle">
              Your comment
            </span>
            <span className="text-[10px] font-bold tracking-wider text-positive">
              Approved
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted whitespace-pre-wrap">
            {mine?.body}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          {!isPrivate && (
            <p className="text-xs font-bold tracking-wider text-ink-subtle">
              {mine ? "Your comment" : "Add your comment"}
            </p>
          )}
          <Textarea
            value={body}
            onChange={setBody}
            rows={3}
            placeholder={isPrivate ? "Add a private note…" : "Leave a comment…"}
            className="px-3 py-2"
          />
          {error && (
            <p className="text-sm font-semibold text-negative">{error}</p>
          )}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={
                pending || !body.trim() || body.trim() === (mine?.body ?? "")
              }
              className="px-3.5 py-2 tracking-wider"
            >
              {saveLabel}
            </Button>
            {mine && (
              <Button
                type="button"
                variant="ghost"
                onClick={removeMine}
                className="px-3.5 py-2 tracking-wider text-ink-muted hover:text-negative"
              >
                Remove
              </Button>
            )}
            {!isPrivate && mine?.pending && (
              <span className="text-xs text-ink-subtle">Pending approval</span>
            )}
            {saved && isPrivate && (
              <span className="text-xs text-ink-subtle">Saved</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
