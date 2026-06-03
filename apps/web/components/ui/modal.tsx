"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

// Centered modal scaffold: dimmed backdrop, click-outside + Escape to close, and
// a panel that stops propagation. `className` overrides the panel (width, etc.).
export function Modal({
  onClose,
  className,
  labelledBy,
  children,
}: {
  onClose: () => void;
  className?: string;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-4",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
