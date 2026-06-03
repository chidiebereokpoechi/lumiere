"use client";

import { useMemo } from "react";
import type { MinimalGallery } from "@/lib/api/client-gallery";
import { formatDate } from "@/lib/format";

// Full-screen intro cover with the event line, title, and a "View gallery" cue
// that scrolls down to the grid.
export function GalleryCover({
  gallery,
  onView,
}: {
  gallery: MinimalGallery;
  onView: () => void;
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

  return (
    <header className="relative h-svh min-h-136 w-full overflow-hidden">
      {gallery.coverFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/img/${gallery.id}/${gallery.coverFileId}/preview`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-surface-sunken" />
      )}
      {gallery.coverFileId && <div className="absolute inset-0 bg-black/35" />}
      <div
        className={`relative h-full flex flex-col items-center justify-center text-center px-6 ${gallery.coverFileId ? "text-white" : "text-ink-strong"}`}
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
          onClick={onView}
          className={`mt-10 inline-flex items-center rounded-sm border px-10 py-3.5 font-bold tracking-wider transition-colors ${
            gallery.coverFileId
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
