"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import justifiedLayout from "justified-layout";
import type { ClientFile } from "@/lib/api/client-gallery";
import { formatBytes } from "@/lib/format";
import {
  Check,
  FileDoc,
  Heart,
  HeartOpen,
  Music,
  Play,
} from "@/components/ui/icons";

export interface GalleryGridHandlers {
  canDownload: boolean;
  canFavorite: boolean;
  desktop: boolean;
  actionVis: string;
  selectionMode: boolean;
  suppressClickRef: React.MutableRefObject<boolean>;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string, shift: boolean) => void;
  onBeginDragSelect: (id: string, e: React.PointerEvent) => void;
  onToggleFavorite: (id: string) => void;
  onBulkFavorite: () => void;
  onLongPress: (id: string) => void;
}

interface GridProps extends GalleryGridHandlers {
  files: ClientFile[];
  gridMode: boolean;
  selected: Set<string>;
  favorites: Set<string>;
  dragSelecting: boolean;
  emptyText: string;
}

export function GalleryGrid({
  files,
  gridMode,
  selected,
  favorites,
  dragSelecting,
  emptyText,
  ...handlers
}: GridProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    setGridW(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setGridW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Justified layout: image/video drive aspect; audio/file are square tiles.
  const justified = useMemo(() => {
    if (!gridMode || gridW <= 0) return null;
    const ratios = files.map((f) =>
      (f.type === "image" || f.type === "video") && f.width && f.height
        ? f.width / f.height
        : 1,
    );
    const target = gridW < 640 ? 220 : gridW < 1024 ? 300 : 360;
    return justifiedLayout(ratios, {
      containerWidth: gridW,
      targetRowHeight: target,
      boxSpacing: 8,
      containerPadding: 0,
    });
  }, [gridMode, gridW, files]);

  return (
    <div ref={measureRef} className="w-full">
      {files.length === 0 ? (
        <p className="text-center text-sm text-ink-muted py-24">{emptyText}</p>
      ) : gridMode && justified ? (
        // Justified rows — uniform row height, edges flush.
        <div
          className={`relative w-full ${dragSelecting ? "touch-none select-none" : ""}`}
          style={{ height: justified.containerHeight }}
        >
          {files.map((f, i) => {
            const box = justified.boxes[i];
            if (!box) return null;
            return (
              <div
                key={f.id}
                data-fid={f.id}
                className="group absolute overflow-hidden bg-surface-sunken"
                style={{
                  top: box.top,
                  left: box.left,
                  width: box.width,
                  height: box.height,
                }}
              >
                <GalleryTile
                  f={f}
                  isSelected={selected.has(f.id)}
                  isFavorite={favorites.has(f.id)}
                  fill
                  {...handlers}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={`columns-2 md:columns-3 xl:columns-4 gap-1 ${dragSelecting ? "touch-none select-none" : ""}`}
        >
          {files.map((f) => (
            <div
              key={f.id}
              data-fid={f.id}
              className="group relative mb-1 break-inside-avoid overflow-hidden bg-surface-sunken"
            >
              <GalleryTile
                f={f}
                isSelected={selected.has(f.id)}
                isFavorite={favorites.has(f.id)}
                fill={false}
                {...handlers}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A single grid tile: media (image / video / audio cover / file card) plus the
// select + favorite overlays. `fill` = the wrapper has a fixed box (justified
// grid) so media covers it; otherwise media keeps its natural ratio.
function GalleryTile({
  f,
  isSelected,
  isFavorite,
  fill,
  canDownload,
  canFavorite,
  desktop,
  actionVis,
  selectionMode,
  suppressClickRef,
  onOpen,
  onToggleSelect,
  onBeginDragSelect,
  onToggleFavorite,
  onBulkFavorite,
  onLongPress,
}: GalleryGridHandlers & {
  f: ClientFile;
  isSelected: boolean;
  isFavorite: boolean;
  fill: boolean;
}) {
  // Long-press (touch or mouse hold) opens the quick-action menu. A press that
  // fires the menu suppresses the subsequent click so it doesn't also open.
  const lpTimer = useRef<number | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const lpFired = useRef(false);
  const cancelLong = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };
  const onPressStart = (e: React.PointerEvent) => {
    lpFired.current = false;
    lpStart.current = { x: e.clientX, y: e.clientY };
    cancelLong();
    lpTimer.current = window.setTimeout(() => {
      lpFired.current = true;
      onLongPress(f.id);
    }, 450);
  };
  const onPressMove = (e: React.PointerEvent) => {
    const s = lpStart.current;
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancelLong();
  };

  return (
    <>
      <button
        type="button"
        onPointerDown={(e) => {
          // In selection mode, dragging anywhere on the tile range-selects;
          // otherwise a hold opens the quick-action menu.
          if (selectionMode) onBeginDragSelect(f.id, e);
          else onPressStart(e);
        }}
        onPointerMove={onPressMove}
        onPointerUp={cancelLong}
        onPointerCancel={cancelLong}
        onContextMenu={(e) => {
          e.preventDefault();
          onLongPress(f.id); // right-click opens the quick-action menu on desktop
        }}
        onClick={(e) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (lpFired.current) {
            lpFired.current = false;
            return;
          }
          if (selectionMode) onToggleSelect(f.id, e.shiftKey);
          else onOpen(f.id);
        }}
        className={`block w-full text-left focus-visible:outline-none select-none [-webkit-touch-callout:none] ${fill ? "h-full" : ""}`}
      >
        {f.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={f.thumbUrl ?? ""}
            alt=""
            loading="lazy"
            draggable={false}
            style={
              !fill && f.width && f.height
                ? { aspectRatio: `${f.width} / ${f.height}` }
                : undefined
            }
            className={`block w-full object-cover transition-[filter] duration-300 ${fill ? "h-full" : "h-auto"} ${isSelected ? "brightness-90" : ""}`}
          />
        ) : f.type === "video" ? (
          <span
            className={`relative block w-full bg-black ${fill ? "h-full" : ""}`}
          >
            {f.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.thumbUrl}
                alt=""
                loading="lazy"
                draggable={false}
                style={
                  !fill && f.width && f.height
                    ? { aspectRatio: `${f.width} / ${f.height}` }
                    : undefined
                }
                className={`block w-full object-cover ${fill ? "h-full" : "h-auto"} ${isSelected ? "brightness-90" : ""}`}
              />
            ) : (
              <video
                src={`${f.streamUrl ?? ""}#t=0.1`}
                preload="metadata"
                muted
                playsInline
                className={`block w-full ${fill ? "h-full object-cover" : "h-auto"}`}
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="h-12 w-12 inline-flex items-center justify-center rounded-full bg-black/55 text-white">
                <Play size={24} />
              </span>
            </span>
          </span>
        ) : f.type === "audio" && f.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={f.thumbUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className={`block w-full object-cover ${fill ? "h-full" : "aspect-square"} ${isSelected ? "brightness-90" : ""}`}
          />
        ) : (
          <span
            className={`flex w-full flex-col items-center justify-center gap-2 p-3 text-center ${fill ? "h-full" : "aspect-square"}`}
          >
            {f.type === "audio" ? (
              <Music size={24} className="text-ink-muted" />
            ) : (
              <FileDoc size={24} className="text-ink-muted" />
            )}
            <span className="text-xs font-semibold text-ink-strong truncate max-w-full">
              {f.filename}
            </span>
            <span className="text-[11px] text-ink-subtle">
              {formatBytes(f.fileSize)}
            </span>
          </span>
        )}
      </button>

      {/* Bottom gradient — backs the heart; shown whenever a heart shows
          (favorited always, or on hover where the heart is interactive). */}
      {(isFavorite || (desktop && canFavorite)) && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/35 to-transparent transition-opacity ${isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        />
      )}

      {selectionMode && (
        <button
          type="button"
          onPointerDown={(e) => onBeginDragSelect(f.id, e)}
          onClick={(e) => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            onToggleSelect(f.id, e.shiftKey);
          }}
          aria-pressed={isSelected}
          aria-label={isSelected ? "Deselect" : "Select"}
          style={{ touchAction: "none" }}
          className={`absolute top-2.5 left-2.5 h-7 w-7 inline-flex items-center justify-center rounded-full border-2 transition-all ${
            isSelected
              ? "bg-accent border-accent text-white"
              : "bg-black/30 border-white text-transparent"
          }`}
        >
          <Check size={20} />
        </button>
      )}
      {/* Desktop: interactive heart (hover to add; in selection mode it acts on
          the whole selection). Touch: read-only favorited badge only — favorite
          from the lightbox or long-press menu there. */}
      {desktop && canFavorite ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (selectionMode) onBulkFavorite();
            else onToggleFavorite(f.id);
          }}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
          className={`absolute bottom-2.5 right-2.5 inline-flex items-center justify-center transition-all drop-shadow ${
            isFavorite
              ? "text-heart opacity-100"
              : "text-white opacity-0 group-hover:opacity-100"
          }`}
        >
          {isFavorite ? <Heart size={24} /> : <HeartOpen size={24} />}
        </button>
      ) : (
        isFavorite && (
          <span
            aria-label="Favorited"
            className="pointer-events-none absolute bottom-2.5 right-2.5 text-heart drop-shadow"
          >
            <Heart size={24} />
          </span>
        )
      )}
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-accent" />
      )}
    </>
  );
}
