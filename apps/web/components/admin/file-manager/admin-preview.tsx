"use client";

import { useEffect } from "react";
import type { GalleryFile } from "@/lib/api/files";
import { ChevronLeft, ChevronRight, Download } from "@/components/ui/icons";
import { TypeIcon } from "./bits";

// Minimal admin media preview — full-bleed surface, keyboard + arrow nav.
export function AdminPreview({
  file,
  galleryId,
  gallerySlug,
  index,
  total,
  onClose,
  onStep,
}: {
  file: GalleryFile;
  galleryId: string;
  gallerySlug: string;
  index: number;
  total: number;
  onClose: () => void;
  onStep: (d: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onStep(-1);
      else if (e.key === "ArrowRight") onStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  const name = file.displayName ?? file.filenameOriginal;
  const streamUrl = `/api/gallery/${gallerySlug}/files/${file.id}/stream`;
  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" onClick={onClose}>
      <div
        className="shrink-0 flex items-center justify-between px-4 h-14"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="h-10 w-10 -ml-1 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
        >
          <ChevronLeft size={24} />
        </button>
        <a
          href={`/api/gallery/${gallerySlug}/files/${file.id}/download`}
          aria-label="Download"
          className="h-10 w-10 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
        >
          <Download size={20} />
        </a>
      </div>
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-4 sm:px-12"
        onClick={onClose}
      >
        <div
          className="max-h-full max-w-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {file.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/img/${galleryId}/${file.id}/preview`}
              alt={name}
              className="max-h-[80svh] max-w-full object-contain"
            />
          ) : file.type === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={streamUrl}
              controls
              className="max-h-[80svh] max-w-full"
            />
          ) : file.type === "audio" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio src={streamUrl} controls className="w-[min(90vw,32rem)]" />
          ) : (
            <div className="w-[min(90vw,28rem)] rounded-lg border border-border bg-surface p-8 text-center">
              <TypeIcon type={file.type} />
              <p className="mt-3 text-sm font-semibold text-ink-strong truncate">
                {name}
              </p>
            </div>
          )}
        </div>
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStep(-1);
              }}
              aria-label="Previous"
              className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStep(1);
              }}
              aria-label="Next"
              className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
            >
              <ChevronRight size={26} />
            </button>
          </>
        )}
      </div>
      <div
        className="shrink-0 text-center pt-1 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-ink-muted tabular-nums truncate px-6">
          {name}
          {total > 1 ? `  ·  ${index + 1} / ${total}` : ""}
        </p>
      </div>
    </div>
  );
}
