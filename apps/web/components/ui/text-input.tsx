"use client";

import type React from "react";
import { cn } from "@/lib/cn";

const FIELD_BASE =
  "w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-muted hover:border-border-strong focus:border-accent transition-colors";

// Controlled text input. `onChange` yields the next string (not the event).
// `className` merges last so callers can add margins/width tweaks.
type TextInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> & {
  value: string;
  onChange: (next: string) => void;
};

export function TextInput({ className, onChange, ...rest }: TextInputProps) {
  return (
    <input
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD_BASE, className)}
      {...rest}
    />
  );
}

type TextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange" | "value"
> & {
  value: string;
  onChange: (next: string) => void;
};

export function Textarea({
  className,
  onChange,
  rows = 3,
  ...rest
}: TextareaProps) {
  return (
    <textarea
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD_BASE, "resize-y", className)}
      {...rest}
    />
  );
}
