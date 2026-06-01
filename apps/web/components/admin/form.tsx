'use client';

import type React from 'react';

// Spenny-language form primitives.
// - 2px borders are the primary separator.
// - text-xs by default (12px); labels are xs/slate-500.
// - Inputs sit on surface-2, get a peach border + ring on focus.
// - Buttons are compact: py-2 px-3, text-xs font-bold.

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
        className="flex items-baseline justify-between gap-3 text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider"
      >
        <span>
          {label}
          {required && <span className="text-accent-dark ml-1">*</span>}
        </span>
        {hint && (
          <span className="text-[0.65rem] text-ink-subtle font-normal normal-case tracking-normal">
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
}
export function TextInput({
  id, name, type = 'text', required, placeholder, autoComplete, value, onChange,
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
      className="w-full rounded-md bg-surface-2 border-2 border-border px-3 py-2 text-xs text-ink-strong placeholder:text-ink-subtle hover:border-border-strong focus:border-accent transition-colors"
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
}
export function Textarea({
  id, name, rows = 3, placeholder, value, onChange,
}: TextareaProps) {
  return (
    <textarea
      id={id}
      name={name ?? id}
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md bg-surface-2 border-2 border-border px-3 py-2 text-xs text-ink-strong placeholder:text-ink-subtle hover:border-border-strong focus:border-accent transition-colors resize-y"
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 text-xs font-bold transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

interface SelectProps<T extends string> {
  id: string;
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
}
export function Select<T extends string>({ id, value, onChange, options }: SelectProps<T>) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-md bg-surface-2 border-2 border-border px-3 py-2 text-xs text-ink-strong hover:border-border-strong focus:border-accent transition-colors appearance-none cursor-pointer"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: '32px',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

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
        <span className="block text-xs font-bold text-ink-strong">{label}</span>
        {description && (
          <span className="block mt-0.5 text-[0.65rem] text-ink-muted leading-relaxed">
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
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill border-2 transition-colors ${
          checked
            ? 'bg-accent border-accent'
            : 'bg-surface-sunken border-border'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-pill bg-surface transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
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
      className="rounded-md bg-accent-soft border-2 border-accent/40 px-3 py-2 text-xs font-bold text-ink-strong"
    >
      {message}
    </div>
  );
}
