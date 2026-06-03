"use client";

import { useEffect, useState } from "react";
import { apiClient, apiErrorMessage, ApiError, postJson } from "@/lib/api-client";
import type { ClientComment } from "@/lib/api/comments";

// Approved comments for a single item + a submit form. Fetches lazily per file.
export function ItemComments({ slug, fileId }: { slug: string; fileId: string }) {
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
                <span className="text-sm font-semibold text-ink-strong">
                  {c.clientName || "Guest"}
                </span>
                <span className="text-[11px] text-ink-subtle tabular-nums">
                  {new Date(c.createdAt * 1000).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  })}
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Leave a comment on this item…"
            className="w-full rounded-md bg-surface-2 border border-border px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors resize-y"
          />
          {error && (
            <p className="text-sm font-semibold text-negative">{error}</p>
          )}
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="inline-flex items-center rounded-md bg-accent border border-accent px-3.5 py-2 text-sm font-bold tracking-wider text-white hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50"
          >
            {pending ? "Posting…" : "Post"}
          </button>
        </form>
      )}
    </div>
  );
}
