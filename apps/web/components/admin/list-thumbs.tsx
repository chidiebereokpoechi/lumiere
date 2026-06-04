"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Comment } from "@/components/ui/icons";
import type { CommentScope } from "@/lib/api/comments";

export interface ThumbComment {
  author: string | null;
  body: string;
  scope: CommentScope;
  collection: string | null;
  createdAt: number;
  isApproved: boolean;
}

export interface ThumbItem {
  id: string;
  type: "image" | "video" | "audio" | "file" | null;
  name: string;
  comments: ThumbComment[];
}

function when(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// A wrapped row of list/favorites thumbnails. Image/video tiles open a preview
// lightbox on click (admin JWT authorizes /img); audio/file/removed are inert.
// Tiles with comments show a badge, and the lightbox lists those comments.
export function ListThumbs({
  galleryId,
  items,
}: {
  galleryId: string;
  items: ThumbItem[];
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  if (items.length === 0) return null;

  const preview = items.find((it) => it.id === previewId) ?? null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((it) => {
        const hasPreview = it.type === "image" || it.type === "video";
        const media =
          it.type === "image" || it.type === "video" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/img/${galleryId}/${it.id}/thumb`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
              <span className="text-[10px] font-semibold text-ink-muted">
                {it.type ?? "-"}
              </span>
            </span>
          );
        const badge = it.comments.length > 0 && (
          <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/55 px-1 text-[10px] font-bold text-white tabular-nums">
            <Comment size={12} />
            {it.comments.length}
          </span>
        );
        const cls =
          "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface-sunken";
        return hasPreview ? (
          <button
            key={it.id}
            type="button"
            title={it.name}
            aria-label={`Preview ${it.name}`}
            onClick={() => setPreviewId(it.id)}
            className={`${cls} hover:border-border-strong transition-colors`}
          >
            {media}
            {badge}
          </button>
        ) : (
          <div key={it.id} title={it.name} className={cls}>
            {media}
            {badge}
          </div>
        );
      })}

      {preview && (
        <Modal
          onClose={() => setPreviewId(null)}
          className="w-[min(92vw,42rem)] overflow-hidden p-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/img/${galleryId}/${preview.id}/preview`}
            alt=""
            className="max-h-[70svh] w-full object-contain bg-surface-sunken"
          />
          {preview.comments.length > 0 && (
            <div className="max-h-52 space-y-3 overflow-auto border-t border-border p-4">
              {preview.comments.map((c, i) => (
                <div key={i}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink-strong">
                      {c.author ?? "Guest"}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                      {when(c.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold tracking-wider text-ink-muted">
                    {c.scope === "set"
                      ? c.isApproved
                        ? "Comment"
                        : "Comment · pending"
                      : `Note${c.collection ? ` · ${c.collection}` : ""}`}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
                    {c.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
