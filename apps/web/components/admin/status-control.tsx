"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ApiError, mutateJson } from "@/lib/api-client";
import { alertDialog } from "@/components/ui/dialog";
import { ChevronDown } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button-variants";
import {
  broadcastGalleryStatus,
  onGalleryStatus,
  type GalleryStatus,
} from "@/lib/gallery-status";

type Status = GalleryStatus;

const LABELS: Record<Status, string> = {
  active: "Published",
  draft: "Draft",
  archived: "Archived",
};
const DOT: Record<Status, string> = {
  active: "bg-positive",
  draft: "bg-ink-subtle",
  archived: "bg-negative",
};

// Quick gallery status switch in the editor header (mirrors Settings → Status).
export function StatusControl({
  galleryId,
  status: initial,
}: {
  galleryId: string;
  status: Status;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Sync if the settings-form (or another instance) changes status.
  useEffect(
    () =>
      onGalleryStatus((gid, s) => {
        if (gid === galleryId) setStatus(s);
      }),
    [galleryId],
  );

  async function choose(next: Status) {
    setOpen(false);
    if (next === status) return;
    const prev = status;
    setStatus(next);
    broadcastGalleryStatus(galleryId, next);
    try {
      await mutateJson(`/api/galleries/${galleryId}`, { status: next }, "PATCH");
      startTransition(() => router.refresh());
    } catch (err) {
      setStatus(prev);
      broadcastGalleryStatus(galleryId, prev);
      void alertDialog({
        title: "Could not update status",
        message:
          err instanceof ApiError
            ? `Server returned ${err.status}.`
            : "Network error.",
      });
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClasses("secondary", "px-3.5 tracking-wider")}
      >
        <span className={`h-2 w-2 rounded-full ${DOT[status]}`} />
        {LABELS[status]}
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-44 rounded-md border border-border bg-surface shadow-lg p-1.5">
          {(["active", "draft", "archived"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => choose(s)}
              className={`flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-surface-2 ${s === status ? "text-ink-strong font-semibold" : "text-ink-muted"}`}
            >
              <span className={`h-2 w-2 rounded-full ${DOT[s]}`} />
              {LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
