"use client";

import { useEffect, useState } from "react";
import { subscribe, dismiss, type Toast } from "@/lib/toast";

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribe(setToasts), []);
  return (
    <div
      aria-live="polite"
      className={[
        "pointer-events-none fixed z-[100] flex flex-col gap-2",
        // Bottom-center on mobile, bottom-right on desktop.
        "inset-x-0 bottom-4 items-center px-4",
        "sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end sm:px-0",
      ].join(" ")}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  return (
    <div
      role="status"
      onClick={() => dismiss(toast.id)}
      className={[
        "pointer-events-auto group relative w-full max-w-sm cursor-pointer",
        "overflow-hidden rounded-md border-2 border-border bg-surface",
        "pl-4 pr-4 py-3 text-sm leading-snug text-ink-strong",
        // Subtle entrance — fades + slides up slightly.
        "animate-[toast-in_180ms_ease-out]",
      ].join(" ")}
    >
      {/* Left accent strip: kind-coded, structural. */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${accent(toast.kind)}`} />
      <div className="flex items-center gap-3 pl-2">
        <Indicator kind={toast.kind} />
        <span className="flex-1">{toast.message}</span>
      </div>
    </div>
  );
}

function Indicator({ kind }: { kind: Toast["kind"] }) {
  if (kind === "loading") {
    return (
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ink-muted border-r-transparent"
      />
    );
  }
  return null;
}

function accent(kind: Toast["kind"]): string {
  switch (kind) {
    case "success":
      return "bg-positive";
    case "error":
      return "bg-negative";
    case "loading":
      return "bg-ink-muted";
    default:
      return "bg-accent";
  }
}
