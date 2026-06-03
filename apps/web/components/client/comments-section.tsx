"use client";

import { useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import type { ClientComment } from "@/lib/api/comments";

function when(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CommentsSection({
  slug,
  initialComments,
}: {
  slug: string;
  initialComments: ClientComment[];
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setPending(true);
    try {
      await apiClient(`/api/gallery/${slug}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          ...(name.trim() ? { clientName: name.trim() } : {}),
        }),
      });
      setPosted(true);
      setBody("");
      setName("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 429
            ? "Slow down — too many comments. Try again later."
            : `Could not post (${err.status})`
          : "Network error. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="px-4 sm:px-8 pb-12">
      <h2 className="text-xs font-extrabold tracking-[0.22em] text-ink-muted mb-4">
        Comments
      </h2>
      <div className="max-w-2xl space-y-6">
        {initialComments.length > 0 && (
          <ul className="space-y-4">
            {initialComments.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-ink-strong">
                    {c.clientName || "Guest"}
                  </span>
                  <span className="text-xs text-ink-subtle tabular-nums">
                    {when(c.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-muted whitespace-pre-wrap">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        {posted ? (
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-ink-muted">
            Thanks — your comment was submitted and will appear once the creator
            approves it.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Leave a comment…"
              className="w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle focus:border-accent transition-colors resize-y"
            />
            {error && (
              <p className="text-sm font-semibold text-negative">{error}</p>
            )}
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="inline-flex items-center rounded-md bg-accent border border-accent px-4 py-2.5 text-sm font-bold tracking-wider text-white hover:bg-accent-dark hover:border-accent-dark hover:text-white transition-colors disabled:opacity-50"
            >
              {pending ? "Posting…" : "Post comment"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
