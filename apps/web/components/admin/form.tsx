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

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md bg-accent-soft px-4 py-3 text-sm text-ink">
      {message}
    </div>
  );
}
