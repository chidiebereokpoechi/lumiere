"use client";

import type React from "react";

// Admin form layer. The shared input/button/select primitives now live in
// components/ui; re-exported here so existing `@/components/admin/form` imports
// keep working. Field / Toggle / FormError are admin-form-specific and stay.
export { Button } from "@/components/ui/button";
export { TextInput, Textarea } from "@/components/ui/text-input";
export { Select } from "@/components/ui/select";

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}
export function Field({ id, label, hint, required, children }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 text-xs font-bold text-ink-muted mb-2 tracking-wider"
      >
        <span>
          {label}
          {required && <span className="text-accent-dark ml-1">*</span>}
        </span>
        {hint && (
          <span className="text-xs text-ink-muted font-normal normal-case tracking-normal">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}
export function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
}: ToggleProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-start justify-between gap-4 py-2 cursor-pointer"
    >
      <div className="flex-1">
        <span className="block text-sm font-semibold text-ink-strong">
          {label}
        </span>
        {description && (
          <span className="block mt-1 text-xs text-ink-muted leading-relaxed">
            {description}
          </span>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-out ${
          checked ? "bg-accent" : "bg-surface-sunken"
        }`}
      >
        <span
          className={`block h-5 w-7 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25),0_1px_1px_rgba(0,0,0,0.1)] transition-transform duration-200 ease-out ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md bg-accent-soft border border-accent/40 px-4 py-2.5 text-sm font-semibold text-ink-strong"
    >
      {message}
    </div>
  );
}
