"use client";

import { useEffect, useState } from "react";
import { subscribe, dismiss, type Toast } from "@/lib/toast";
import { SpinnerIcon } from "@/components/ui/icons";

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
        "pointer-events-auto group w-full max-w-sm cursor-pointer",
        // Flat dark panel — same surface used for active sidebar/tab pills.
        "bg-surface-strong text-ink-inverse",
        "px-4 py-3 text-sm leading-snug",
        "animate-[toast-in_180ms_ease-out]",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <Indicator kind={toast.kind} />
        <span className="flex-1">{toast.message}</span>
      </div>
    </div>
  );
}

function Indicator({ kind }: { kind: Toast["kind"] }) {
  if (kind === "loading") {
    return <SpinnerIcon size={16} className="shrink-0 animate-spin" />;
  }
  return (
    <span
      aria-hidden
      className={`shrink-0 inline-block h-2 w-2 ${dot(kind)}`}
    />
  );
}

function dot(kind: Toast["kind"]): string {
  switch (kind) {
    case "success":
      return "bg-positive";
    case "error":
      return "bg-negative";
    default:
      return "bg-accent";
  }
}
