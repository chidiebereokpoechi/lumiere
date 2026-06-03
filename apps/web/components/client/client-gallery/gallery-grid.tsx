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
  actionVis: string;
  selecting: boolean;
  suppressClickRef: React.MutableRefObject<boolean>;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string, shift: boolean) => void;
  onBeginDragSelect: (id: string, e: React.PointerEvent) => void;
  onToggleFavorite: (id: string) => void;
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
  actionVis,
  selecting,
  suppressClickRef,
  onOpen,
  onToggleSelect,
  onBeginDragSelect,
  onToggleFavorite,
}: GalleryGridHandlers & {
  f: ClientFile;
  isSelected: boolean;
  isFavorite: boolean;
  fill: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (selecting) onToggleSelect(f.id, false);
          else onOpen(f.id);
        }}
        className={`block w-full text-left focus-visible:outline-none ${fill ? "h-full" : ""}`}
      >
        {f.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={f.thumbUrl ?? ""}
            alt=""
            loading="lazy"
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

      {(canDownload || canFavorite) && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/35 to-transparent transition-opacity ${isSelected ? "opacity-100" : actionVis}`}
        />
      )}

      {canDownload && (
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
          className={`absolute top-2.5 left-2.5 h-6 w-6 inline-flex items-center justify-center rounded-full border-2 transition-all ${
            isSelected
              ? "bg-accent border-accent text-white opacity-100"
              : `border-white text-transparent ${actionVis}`
          }`}
        >
          <Check size={24} />
        </button>
      )}
      {canFavorite && !selecting && (
        <button
          type="button"
          onClick={() => onToggleFavorite(f.id)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
          className={`absolute top-2.5 right-2.5 h-6 w-6 inline-flex items-center justify-center transition-all drop-shadow ${
            isFavorite ? "text-heart opacity-100" : `text-white ${actionVis}`
          }`}
        >
          {isFavorite ? <Heart size={24} /> : <HeartOpen size={24} />}
        </button>
      )}
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-accent" />
      )}
    </>
  );
}
