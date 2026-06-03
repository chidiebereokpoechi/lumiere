"use client";

import { useMemo, useRef } from "react";
import type { MinimalGallery } from "@/lib/api/client-gallery";
import { formatDate } from "@/lib/format";

// Full-screen intro cover. Rendered as a fixed overlay that slides up out of the
// way when dismissed (going into the gallery is easy — the button or any
// downward gesture). Coming back is gated by useCoverReveal in the parent.
export function GalleryCover({
  gallery,
  shown,
  onDismiss,
}: {
  gallery: MinimalGallery;
  shown: boolean;
  onDismiss: () => void;
}) {
  const eventLine = useMemo(
    () =>
      [
        gallery.eventType,
        gallery.eventDate
          ? formatDate(gallery.eventDate, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [gallery.eventType, gallery.eventDate],
  );

  // Any downward intent (wheel down, or a small upward swipe) enters the gallery.
  const touchStartY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStartY.current;
    touchStartY.current = null;
    const y = e.changedTouches[0]?.clientY;
    if (s != null && y != null && s - y > 40) onDismiss();
  };

  return (
    <header
      aria-hidden={!shown}
      onWheel={(e) => {
        if (e.deltaY > 0) onDismiss();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={`fixed inset-0 z-50 w-full overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${shown ? "translate-y-0" : "-translate-y-full pointer-events-none"}`}
    >
      {gallery.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={gallery.coverUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            objectPosition: `${gallery.coverFocalX ?? 50}% ${gallery.coverFocalY ?? 50}%`,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-surface-sunken" />
      )}
      {gallery.coverUrl && <div className="absolute inset-0 bg-black/35" />}
      <div
        className={`relative h-full flex flex-col items-center justify-center text-center px-4 ${gallery.coverUrl ? "text-white" : "text-ink-strong"}`}
      >
        {eventLine && (
          <p className="text-xs font-bold tracking-wider opacity-90">
            {eventLine}
          </p>
        )}
        <h1 className="mt-4 text-5xl sm:text-6xl font-extrabold tracking-tight">
          {gallery.title}
        </h1>
        {gallery.subtitle && (
          <p className="mt-4 max-w-xl text-sm sm:text-base opacity-90">
            {gallery.subtitle}
          </p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className={`mt-10 inline-flex items-center rounded-sm border px-10 py-3.5 font-bold tracking-wider transition-colors ${
            gallery.coverUrl
              ? "border-white text-white hover:bg-white hover:text-black"
              : "border-border text-ink-strong hover:bg-surface-strong hover:text-ink-inverse hover:border-surface-strong"
          }`}
        >
          View gallery
        </button>
      </div>
    </header>
  );
}
