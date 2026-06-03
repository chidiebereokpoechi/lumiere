'use client';

import type React from 'react';

// Spenny-language form primitives — slate surfaces, 2px borders, focus ring.
// Typography is regular-sized (text-sm body, text-xs eyebrow labels),
// not Spenny's ultra-dense default.

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
        className="flex items-baseline justify-between gap-3 text-xs font-bold text-ink-muted mb-2 uppercase tracking-wider"
      >
        <span>
          {label}
          {required && <span className="text-accent-dark ml-1">*</span>}
        </span>
        {hint && (
          <span className="text-xs text-ink-subtle font-normal normal-case tracking-normal">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

interface TextInputProps {
  id: string;
  name?: string;
  type?: 'text' | 'email' | 'password' | 'url' | 'date';
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onBlur?: () => void;
}
export function TextInput({
  id, name, type = 'text', required, placeholder, autoComplete, value, onChange, onKeyDown, onBlur,
}: TextInputProps) {
  return (
    <input
      id={id}
      name={name ?? id}
      type={type}
      required={required}
      placeholder={placeholder}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className="w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle hover:border-border-strong focus:border-accent transition-colors"
    />
  );
}

interface TextareaProps {
  id: string;
  name?: string;
  rows?: number;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
}
export function Textarea({
  id, name, rows = 3, placeholder, value, onChange, onBlur,
}: TextareaProps) {
  return (
    <textarea
      id={id}
      name={name ?? id}
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="w-full rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-subtle hover:border-border-strong focus:border-accent transition-colors resize-y"
    />
  );
}

interface ButtonProps {
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}
export function Button({
  type = 'button', variant = 'primary', disabled, onClick, children,
}: ButtonProps) {
  const cls = {
    primary:
      'bg-accent text-accent-ink border-accent hover:bg-accent-dark hover:border-accent-dark hover:text-white',
    secondary:
      'bg-surface text-ink-strong border-border hover:bg-surface-2 hover:border-border-strong',
    ghost:
      'bg-transparent text-ink-muted border-transparent hover:bg-surface-2 hover:text-ink-strong',
    danger:
      'bg-negative text-white border-negative hover:opacity-90',
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-bold transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

// Re-export the custom listbox (no native <select>) under the form API.
export { Select } from '@/components/ui/select';

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}
export function Toggle({ id, checked, onChange, label, description }: ToggleProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-start justify-between gap-4 py-2 cursor-pointer"
    >
      <div className="flex-1">
        <span className="block text-sm font-semibold text-ink-strong">{label}</span>
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
          checked ? 'bg-accent' : 'bg-surface-sunken'
        }`}
      >
        <span
          className={`block h-5 w-7 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25),0_1px_1px_rgba(0,0,0,0.1)] transition-transform duration-200 ease-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
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
      className="rounded-md bg-accent-soft border border-accent/40 px-4 py-3 text-sm font-semibold text-ink-strong"
    >
      {message}
    </div>
  );
}
