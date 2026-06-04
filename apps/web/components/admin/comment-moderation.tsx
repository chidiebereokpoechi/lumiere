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
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";

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
  // The file shown in the preview lightbox (clicked from a comment's thumbnail).
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  // Only public (set-level) comments go through approval; private notes don't.
  const pendingCount = useMemo(
    () => comments.filter((c) => c.scope === "set" && !c.isApproved).length,
    [comments],
  );
  const visible = useMemo(() => {
    if (filter === "pending")
      return comments.filter((c) => c.scope === "set" && !c.isApproved);
    if (filter === "approved")
      return comments.filter((c) => c.scope === "set" && c.isApproved);
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
      toast.success(isApproved ? "Comment approved" : "Comment unapproved");
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
      toast.success("Comment deleted");
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

      <div className="flex items-center gap-4">
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
              className="flex gap-4 rounded-lg border border-border bg-surface p-4"
            >
              {/* What was commented on — click to open a larger preview. */}
              {c.fileId && (
                <button
                  type="button"
                  onClick={() => setPreviewFileId(c.fileId)}
                  aria-label={`Preview ${c.filename ?? "media"}`}
                  className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-sunken border border-border hover:border-border-strong transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/img/${galleryId}/${c.fileId}/thumb`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 truncate text-sm font-semibold text-ink-strong">
                    {c.clientEmail || c.clientName || "Guest"}
                  </div>
                  <span className="text-xs text-ink-muted tabular-nums shrink-0">
                    {when(c.createdAt)}
                  </span>
                </div>
                {c.scope === "set" ? (
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold tracking-wider ${
                      c.isApproved
                        ? "bg-surface-sunken text-positive"
                        : "bg-accent-soft text-white"
                    }`}
                  >
                    {c.isApproved ? "Approved" : "Pending"}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-surface-sunken px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-ink-muted">
                    Private ·{" "}
                    {c.scope === "favorites"
                      ? "Favorites"
                      : (c.listName ?? "List")}
                  </span>
                )}
                {/* Where the comment lives + the filename. */}
                <p className="mt-0.5 text-xs text-ink-muted truncate">
                  {c.collection && (
                    <span className="font-semibold text-ink-strong">
                      {c.collection}
                    </span>
                  )}
                  {c.collection && c.filename && " · "}
                  {c.filename}
                </p>
                <p className="text-sm text-ink-muted whitespace-pre-wrap">
                  {c.body}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="ml-auto flex items-center gap-2">
                    {/* Approval only applies to public set-level comments. */}
                    {c.scope === "set" &&
                      (c.isApproved ? (
                        <Button
                          variant="secondary"
                          disabled={busyId === c.id}
                          onClick={() => setApproved(c, false)}
                          className="px-3 py-1.5 tracking-wider"
                        >
                          Unapprove
                        </Button>
                      ) : (
                        <Button
                          disabled={busyId === c.id}
                          onClick={() => setApproved(c, true)}
                          className="px-3 py-1.5 tracking-wider"
                        >
                          Approve
                        </Button>
                      ))}
                    <Button
                      variant="danger"
                      disabled={busyId === c.id}
                      onClick={() => remove(c)}
                      className="px-3 py-1.5 tracking-wider"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {previewFileId && (
        <Modal
          onClose={() => setPreviewFileId(null)}
          className="w-[min(92vw,48rem)] border-0 bg-transparent p-0 overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/img/${galleryId}/${previewFileId}/preview`}
            alt=""
            className="max-h-[85svh] w-full rounded-lg object-contain"
          />
        </Modal>
      )}
    </div>
  );
}
