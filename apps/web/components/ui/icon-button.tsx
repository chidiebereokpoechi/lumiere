"use client";

import type React from "react";
import { cn } from "@/lib/cn";

// Borderless icon-only button (lightbox/preview chrome). Centering + muted tint
// + disabled handling are baked in; pass size (h-10 w-10, etc.) and any color
// override via className — tailwind-merge lets a later text-* win.
export function IconButton({
  type = "button",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center text-ink-muted hover:text-ink-strong disabled:opacity-60 transition-colors",
        className,
      )}
      {...rest}
    />
  );
}
