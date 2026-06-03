"use client";

import { useRef, useState } from "react";
import type { GalleryFile } from "@/lib/api/files";
import { apiClientMutation, apiErrorMessage, mutateJson } from "@/lib/api-client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ImageIcon } from "@/components/ui/icons";

export interface CoverState {
  fileId: string | null;
  imageKey: string | null;
  focalX: number | null;
  focalY: number | null;
}

// Thumbnail URL for a cover state. `?k=` busts the browser cache when a new
// standalone cover is uploaded (the /cover path is stable but its bytes change).
function coverThumb(galleryId: string, c: CoverState): string | null {
  if (c.imageKey) return `/img/${galleryId}/cover?k=${encodeURIComponent(c.imageKey)}`;
  if (c.fileId) return `/img/${galleryId}/${c.fileId}/thumb`;
  return null;
}
const objectPos = (c: CoverState) => `${c.focalX ?? 50}% ${c.focalY ?? 50}%`;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

// Cover control above the sets sidebar: shows the current cover (cropped to its
// focal point) and opens a modal to choose a gallery image, upload a standalone
// cover, or set the focal point.
export function CoverControl({
  galleryId,
  images,
  cover,
  onChange,
}: {
  galleryId: string;
  images: GalleryFile[];
  cover: CoverState;
  onChange: (c: CoverState) => void;
}) {
  const [open, setOpen] = useState(false);
  const thumb = coverThumb(galleryId, cover);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold tracking-wider text-ink-subtle">
          Cover
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-bold tracking-wider text-accent-dark hover:underline"
        >
          {thumb ? "Edit" : "Set"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full aspect-16/10 overflow-hidden rounded-md border border-border bg-surface-sunken hover:border-border-strong transition-colors"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: objectPos(cover) }}
          />
        ) : (
          <span className="h-full w-full flex flex-col items-center justify-center gap-1 text-ink-subtle">
            <ImageIcon size={24} />
            <span className="text-xs font-semibold">No cover</span>
          </span>
        )}
      </button>
      {open && (
        <CoverModal
          galleryId={galleryId}
          images={images}
          cover={cover}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function CoverModal({
  galleryId,
  images,
  cover,
  onChange,
  onClose,
}: {
  galleryId: string;
  images: GalleryFile[];
  cover: CoverState;
  onChange: (c: CoverState) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const thumb = coverThumb(galleryId, cover);

  async function pick(fileId: string) {
    setError(null);
    onChange({ ...cover, fileId, imageKey: null });
    try {
      await mutateJson(
        `/api/galleries/${galleryId}`,
        { coverFileId: fileId, coverImageKey: null },
        "PATCH",
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Could not set cover"));
    }
  }

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const g = await apiClientMutation<{ coverImageKey: string | null }>(
        `/api/galleries/${galleryId}/cover`,
        { method: "POST", body: form },
      );
      onChange({ ...cover, imageKey: g.coverImageKey });
    } catch (err) {
      setError(apiErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  async function commitFocal(x: number, y: number) {
    const focalX = Math.round(x);
    const focalY = Math.round(y);
    onChange({ ...cover, focalX, focalY });
    try {
      await mutateJson(
        `/api/galleries/${galleryId}`,
        { coverFocalX: focalX, coverFocalY: focalY },
        "PATCH",
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save focal point"));
    }
  }

  return (
    <Modal onClose={onClose} className="w-[min(95vw,40rem)]" labelledBy="cover-title">
      <h2
        id="cover-title"
        className="text-lg font-extrabold tracking-tight text-ink-strong"
      >
        Gallery cover
      </h2>

      {thumb ? (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            Drag the dot to set the focal point — it controls how the cover is
            cropped on the gallery.
          </p>
          <FocalPicker
            key={thumb}
            url={thumb}
            focalX={cover.focalX ?? 50}
            focalY={cover.focalY ?? 50}
            onCommit={commitFocal}
          />
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">
          Choose an image from the gallery or upload a standalone cover.
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm font-semibold text-negative">{error}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs font-bold tracking-wider text-ink-subtle">
          From gallery
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="tracking-wider"
        >
          {uploading ? "Uploading…" : "Upload cover"}
        </Button>
      </div>

      {images.length === 0 ? (
        <p className="mt-3 text-sm text-ink-subtle">No images in this gallery yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
          {images.map((f) => {
            const isCover = !cover.imageKey && cover.fileId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => pick(f.id)}
                aria-pressed={isCover}
                className={`relative aspect-square overflow-hidden rounded-md border-2 transition-colors ${isCover ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-border-strong"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/img/${galleryId}/${f.id}/thumb`}
                  alt={f.displayName ?? f.filenameOriginal}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose} className="tracking-wider">
          Done
        </Button>
      </div>
    </Modal>
  );
}

// Draggable focal-point picker over the cover preview. Commits on release.
function FocalPicker({
  url,
  focalX,
  focalY,
  onCommit,
}: {
  url: string;
  focalX: number;
  focalY: number;
  onCommit: (x: number, y: number) => void;
}) {
  const [pt, setPt] = useState({ x: focalX, y: focalY });
  const boxRef = useRef<HTMLDivElement>(null);

  const moveTo = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return { x: pt.x, y: pt.y };
    const x = clamp(((clientX - r.left) / r.width) * 100);
    const y = clamp(((clientY - r.top) / r.height) * 100);
    setPt({ x, y });
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    moveTo(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => moveTo(ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const final = moveTo(ev.clientX, ev.clientY);
      onCommit(final.x, final.y);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      style={{ touchAction: "none" }}
      className="mt-3 relative aspect-16/9 w-full overflow-hidden rounded-md border border-border bg-surface-sunken cursor-crosshair select-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
        style={{ objectPosition: `${pt.x}% ${pt.y}%` }}
      />
      <span
        className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent/70 ring-2 ring-black/30"
        style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
      />
    </div>
  );
}
