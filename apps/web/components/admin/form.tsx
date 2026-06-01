'use client';

import type React from 'react';

// Shared form primitives. No borders; inputs sit on bg-surface-sunken so they
// read as recessed fields against the white card surface. Focus is the global
// peach outline from globals.css.

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
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-sm font-medium text-ink mb-2">
        <span>
          {label}
          {required && <span className="text-accent ml-1">*</span>}
        </span>
        {hint && <span className="text-xs text-ink-subtle font-normal">{hint}</span>}
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
export function TextInput({ id, name, type = 'text', required, placeholder, autoComplete, value, onChange }: TextInputProps) {
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
      className="w-full rounded-md bg-surface-sunken px-4 py-3 text-sm text-ink placeholder:text-ink-subtle focus:bg-surface-2 transition-colors"
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
export function Textarea({ id, name, rows = 3, placeholder, value, onChange }: TextareaProps) {
  return (
    <textarea
      id={id}
      name={name ?? id}
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md bg-surface-sunken px-4 py-3 text-sm text-ink placeholder:text-ink-subtle focus:bg-surface-2 transition-colors resize-y"
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
export function Button({ type = 'button', variant = 'primary', disabled, onClick, children }: ButtonProps) {
  const cls = {
    primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
    secondary: 'bg-surface-sunken text-ink hover:bg-surface-2',
    ghost: 'bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
    danger: 'bg-negative text-white hover:opacity-90',
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
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
      className="w-full rounded-md bg-surface-sunken px-4 py-3 text-sm text-ink focus:bg-surface-2 transition-colors appearance-none cursor-pointer"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%238e95a0' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '40px' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
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
    <label htmlFor={id} className="flex items-start justify-between gap-4 py-2 cursor-pointer">
      <div className="flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block mt-0.5 text-xs text-ink-muted">{description}</span>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-pill transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-sunken'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-pill bg-surface transition-transform ${
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
    <div role="alert" className="rounded-md bg-accent-soft px-4 py-3 text-sm text-ink">
      {message}
    </div>
  );
}
