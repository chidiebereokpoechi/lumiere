"use client";

import { useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import type { ClientComment } from "@/lib/api/comments";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TextInput, Textarea } from "@/components/ui/text-input";

function when(epoch: number): string {
  return formatDate(epoch);
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
      <h2 className="text-xs font-extrabold tracking-wider text-ink-muted mb-4">
        Comments
      </h2>
      <div className="max-w-2xl space-y-4">
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
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-ink-muted">
            Thanks — your comment was submitted and will appear once the creator
            approves it.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <TextInput
              value={name}
              onChange={setName}
              placeholder="Your name (optional)"
            />
            <Textarea
              value={body}
              onChange={setBody}
              rows={3}
              placeholder="Leave a comment…"
            />
            {error && (
              <p className="text-sm font-semibold text-negative">{error}</p>
            )}
            <Button
              type="submit"
              disabled={pending || !body.trim()}
              className="tracking-wider"
            >
              {pending ? "Posting…" : "Post comment"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
