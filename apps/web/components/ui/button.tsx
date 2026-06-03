"use client";

import type React from "react";
import { cn } from "@/lib/cn";

// Spenny-language button. `variant` sets the palette; `className` is merged last
// (via cn → tailwind-merge) so callers can override width/spacing/tracking.
const VARIANTS = {
  primary:
    "bg-accent text-white border-accent hover:bg-accent-dark hover:border-accent-dark hover:text-white",
  secondary:
    "bg-surface text-ink-strong border-border hover:bg-surface-2 hover:border-border-strong",
  ghost:
    "bg-transparent text-ink-muted border-transparent hover:bg-surface-2 hover:text-ink-strong",
  danger: "bg-negative text-white border-negative hover:opacity-90",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "primary",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-bold transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
