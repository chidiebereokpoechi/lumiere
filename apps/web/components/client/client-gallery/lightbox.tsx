"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientFile } from "@/lib/api/client-gallery";
import { formatBytes } from "@/lib/format";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Comment,
  Download,
  FileDoc,
  Heart,
  HeartOpen,
  ImageIcon,
} from "@/components/ui/icons";
import { AudioPlayer } from "./audio-player";
import { ItemComments } from "./item-comments";

// Full-screen media viewer. Owns the gestures local to it: keyboard nav, swipe
// (steps left/right, downward fling closes), the comments drawer toggle, and
// whether the open media is actively playing (which suspends swipe so the
// player keeps its own gestures). Steps reset playing via the file.id effect.
export function Lightbox({
  file,
  index,
  total,
  slug,
  allowComments,
  canDownload,
  canFavorite,
  coarse,
  isFavorite,
  savingPhotos,
  onClose,
  onStep,
  onToggleFavorite,
  onAddToList,
  onShare,
}: {
  file: ClientFile;
  index: number;
  total: number;
  slug: string;
  allowComments: boolean;
  canDownload: boolean;
  canFavorite: boolean;
  coarse: boolean;
  isFavorite: boolean;
  savingPhotos: boolean;
  onClose: () => void;
  onStep: (dir: number) => void;
  onToggleFavorite: () => void;
  onAddToList: () => void;
  onShare: () => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [mediaPlaying, setMediaPlaying] = useState(false);

  // Reset transient playing state whenever the open item changes.
  useEffect(() => setMediaPlaying(false), [file.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onStep(-1);
      else if (e.key === "ArrowRight") onStep(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  // Swipe in the lightbox: left/right steps, a downward fling closes.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
      onStep(dx < 0 ? 1 : -1);
    else if (dy > 90 && dy > Math.abs(dx) * 1.5) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center justify-between px-3 sm:px-5 h-14"
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
        <div className="flex items-center gap-1">
          {canFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
              className={`h-10 w-10 inline-flex items-center justify-center hover:text-ink-strong ${isFavorite ? "text-heart" : "text-ink-muted"}`}
            >
              {isFavorite ? <Heart size={24} /> : <HeartOpen size={24} />}
            </button>
          )}
          <button
            type="button"
            onClick={onAddToList}
            aria-label="Add to list"
            className="h-10 w-10 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
          >
            <Bookmark size={24} />
          </button>
          {allowComments && (
            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              aria-label="Comments"
              className={`h-10 w-10 inline-flex items-center justify-center hover:text-ink-strong ${showComments ? "text-ink-strong" : "text-ink-muted"}`}
            >
              <Comment size={24} />
            </button>
          )}
          {canDownload &&
            coarse &&
            (file.type === "image" || file.type === "video") && (
              <button
                type="button"
                onClick={onShare}
                disabled={savingPhotos}
                aria-label="Save to Photos"
                className="h-10 w-10 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong disabled:opacity-60"
              >
                <ImageIcon size={24} />
              </button>
            )}
          {canDownload && (
            <a
              href={file.downloadUrl}
              aria-label="Download"
              className="h-10 w-10 inline-flex items-center justify-center text-ink-muted hover:text-ink-strong"
            >
              <Download size={24} />
            </a>
          )}
        </div>
      </div>

      {/* Media */}
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-4 sm:px-12 touch-pan-y"
        onClick={onClose}
        // Swipe is allowed unless the open media is actively playing (so a
        // playing video/audio keeps its own gestures); paused media swipes.
        onTouchStart={mediaPlaying ? undefined : onTouchStart}
        onTouchEnd={mediaPlaying ? undefined : onTouchEnd}
      >
        <div
          className="max-h-full max-w-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {file.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.previewUrl ?? ""}
              alt=""
              className="max-h-[78svh] max-w-full object-contain"
            />
          ) : file.type === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={file.streamUrl ?? ""}
              controls
              onPlay={() => setMediaPlaying(true)}
              onPause={() => setMediaPlaying(false)}
              onEnded={() => setMediaPlaying(false)}
              className="max-h-[78svh] max-w-full"
            />
          ) : file.type === "audio" ? (
            <AudioPlayer
              key={file.id}
              src={file.streamUrl ?? ""}
              title={file.filename}
              subtitle={formatBytes(file.fileSize)}
              cover={file.thumbUrl}
              onPlayingChange={setMediaPlaying}
            />
          ) : (
            <div className="w-[min(90vw,28rem)] rounded-lg border border-border bg-surface p-8 text-center">
              <FileDoc size={24} className="mx-auto text-ink-muted" />
              <p className="mt-3 text-sm font-semibold text-ink-strong truncate">
                {file.filename}
              </p>
              <p className="text-xs text-ink-subtle">
                {formatBytes(file.fileSize)}
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
              <ChevronLeft size={24} />
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
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {/* Filename + position */}
      <div
        className="shrink-0 text-center pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-ink-muted tabular-nums truncate px-6">
          {file.filename}
          {total > 1 ? `  ·  ${index + 1} / ${total}` : ""}
        </p>
      </div>

      {/* Comments drawer (toggled) */}
      {allowComments && showComments && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 max-h-[70svh] overflow-y-auto bg-surface border-t border-border rounded-t-xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:inset-x-auto sm:right-0 sm:top-14 sm:bottom-0 sm:w-96 sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l sm:shadow-none"
          onClick={(e) => e.stopPropagation()}
        >
          <ItemComments slug={slug} fileId={file.id} />
        </div>
      )}
    </div>
  );
}
