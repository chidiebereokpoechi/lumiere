"use client";

import { useMemo } from "react";
import type { MinimalGallery } from "@/lib/api/client-gallery";
import { formatDate } from "@/lib/format";
import { LogoLockup } from "@/components/ui/logo";

// Full-screen intro cover, rendered as a fixed overlay. Its vertical position
// tracks the gesture live via `progress` (0 = out of the way, 1 = full cover)
// and animates the final settle when the gesture ends (dragging=false). All
// gesture handling lives in useCoverGate; this is presentational.
export function GalleryCover({
  gallery,
  progress,
  dragging,
  onDismiss,
}: {
  gallery: MinimalGallery;
  progress: number;
  dragging: boolean;
  onDismiss: () => void;
}) {
  const ty = -(1 - progress) * 100; // 0% shown, -100% hidden
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
    <header
      aria-hidden={progress === 0}
      style={{
        transform: `translateY(${ty}%)`,
        transition: dragging
          ? "none"
          : "transform 850ms cubic-bezier(0.22,1,0.36,1)",
      }}
      className={`fixed inset-0 z-50 w-full overflow-hidden ${gallery.coverUrl ? "bg-black" : "bg-surface-sunken"} ${progress === 0 ? "pointer-events-none" : ""}`}
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
        className={`relative h-full flex flex-col items-center justify-center gap-8 text-center px-4 ${gallery.coverUrl ? "text-white" : "text-ink-strong"}`}
      >
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-5xl sm:text-6xl font-extrabold">
            {gallery.title}
          </h1>
          {gallery.subtitle && (
            <p className="max-w-xl text-sm sm:text-base opacity-90">
              {gallery.subtitle}
            </p>
          )}
          {eventLine && (
            <p className="text-xs font-bold tracking-wider opacity-90">
              {eventLine}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={`inline-flex items-center rounded-sm border px-10 py-3.5 font-bold tracking-wider transition-colors ${
            gallery.coverUrl
              ? "border-white text-white hover:bg-white hover:text-black"
              : "border-border text-ink-strong hover:bg-surface-strong hover:text-ink-inverse hover:border-surface-strong"
          }`}
        >
          View gallery
        </button>
        <div className="w-full absolute flex justify-center bottom-0 left-0 py-2 gradient-to-b from-white pointer-events-none">
          <LogoLockup className="mb-1 w-28 sm:w-30" />
        </div>
      </div>
    </header>
  );
}
