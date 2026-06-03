"use client";

import { useMemo, useState } from "react";
import {
  apiClientMutation,
  apiErrorMessage,
  mutateJson,
} from "@/lib/api-client";
import type { AdminComment } from "@/lib/api/comments";
import { confirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function when(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CommentModeration({
  galleryId,
  initialComments,
}: {
  galleryId: string;
  initialComments: AdminComment[];
}) {
  const [comments, setComments] = useState<AdminComment[]>(initialComments);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => comments.filter((c) => !c.isApproved).length,
    [comments],
  );
  const visible = useMemo(() => {
    if (filter === "pending") return comments.filter((c) => !c.isApproved);
    if (filter === "approved") return comments.filter((c) => c.isApproved);
    return comments;
  }, [comments, filter]);

  async function setApproved(c: AdminComment, isApproved: boolean) {
    setBusyId(c.id);
    setError(null);
    try {
      await mutateJson(
        `/api/galleries/${galleryId}/comments/${c.id}`,
        { isApproved },
        "PATCH",
      );
      setComments((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, isApproved } : x)),
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Update failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(c: AdminComment) {
    if (
      !(await confirmDialog({
        title: "Delete comment",
        message: "This cannot be undone.",
        confirmLabel: "Delete",
        danger: true,
      }))
    )
      return;
    setBusyId(c.id);
    setError(null);
    try {
      await apiClientMutation(`/api/galleries/${galleryId}/comments/${c.id}`, {
        method: "DELETE",
      });
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      setError(apiErrorMessage(err, "Delete failed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-accent-soft border border-accent/40 px-4 py-3 text-sm font-semibold text-ink-strong"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        {(["all", "pending", "approved"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
              filter === f
                ? "bg-surface-strong text-ink-inverse border-surface-strong"
                : "bg-surface text-ink-muted border-border hover:text-ink-strong hover:border-border-strong"
            }`}
          >
            {f}
            {f === "pending" && pendingCount > 0 && (
              <span className="tabular-nums opacity-80">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No {filter === "all" ? "" : filter} comments.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-ink-strong">
                    {c.clientName || "Guest"}
                  </span>
                  {c.clientEmail && (
                    <span className="ml-2 text-xs text-ink-muted">
                      {c.clientEmail}
                    </span>
                  )}
                </div>
                <span className="text-xs text-ink-muted tabular-nums shrink-0">
                  {when(c.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink-muted whitespace-pre-wrap">
                {c.body}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold tracking-wider ${
                    c.isApproved
                      ? "bg-surface-sunken text-positive"
                      : "bg-accent-soft text-white"
                  }`}
                >
                  {c.isApproved ? "Approved" : "Pending"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {c.isApproved ? (
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => setApproved(c, false)}
                      className="text-sm font-semibold text-ink-muted hover:text-ink-strong disabled:opacity-50"
                    >
                      Unapprove
                    </button>
                  ) : (
                    <Button
                      disabled={busyId === c.id}
                      onClick={() => setApproved(c, true)}
                      className="px-3 py-1.5 tracking-wider"
                    >
                      Approve
                    </Button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => remove(c)}
                    className="text-sm font-semibold text-negative hover:opacity-80 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
