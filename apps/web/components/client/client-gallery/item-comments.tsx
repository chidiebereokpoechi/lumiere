"use client";

import { useEffect, useState } from "react";
import {
  apiClient,
  apiErrorMessage,
  ApiError,
  postJson,
} from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { ClientComment } from "@/lib/api/comments";
import { Button } from "@/components/ui/button";
import { TextInput, Textarea } from "@/components/ui/text-input";

// Approved comments for a single item + a submit form. Fetches lazily per file.
export function ItemComments({
  slug,
  fileId,
}: {
  slug: string;
  fileId: string;
}) {
  const [items, setItems] = useState<ClientComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPosted(false);
    setBody("");
    apiClient<{ comments: ClientComment[] }>(
      `/api/gallery/${slug}/comments?fileId=${fileId}`,
    )
      .then((r) => {
        if (alive) setItems(r.comments);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, fileId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    setError(null);
    try {
      await postJson(`/api/gallery/${slug}/comments`, {
        body: body.trim(),
        fileId,
        ...(name.trim() ? { clientName: name.trim() } : {}),
      });
      setPosted(true);
      setBody("");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Slow down — too many comments."
          : apiErrorMessage(err, "Could not post"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-4">
      <h3 className="text-xs font-extrabold tracking-wider text-ink-muted mb-3">
        Comments
      </h3>
      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border bg-surface-2 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink-strong">
                  {c.clientName || "Guest"}
                </span>
                <span className="text-[11px] text-ink-muted tabular-nums">
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

      {posted ? (
        <p className="mt-4 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink-muted">
          Submitted — it appears once the creator approves it.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Your name (optional)"
            className="px-3 py-2"
          />
          <Textarea
            value={body}
            onChange={setBody}
            rows={3}
            placeholder="Leave a comment on this item…"
            className="px-3 py-2"
          />
          {error && (
            <p className="text-sm font-semibold text-negative">{error}</p>
          )}
          <Button
            type="submit"
            disabled={pending || !body.trim()}
            className="px-3.5 py-2 tracking-wider"
          >
            {pending ? "Posting…" : "Post"}
          </Button>
        </form>
      )}
    </div>
  );
}
