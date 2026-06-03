'use client';

import { useEffect, useRef, useState } from 'react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

// Custom listbox dropdown (no native <select>). Matches the form input shell:
// 1px border, peach focus ring, squared corners, chevron.
export function Select<T extends string>({
  id, value, onChange, options, placeholder, className,
}: {
  id?: string;
  value: T;
  onChange: (next: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-left text-sm text-ink-strong hover:border-border-strong focus:border-accent transition-colors"
      >
        <span className={current ? '' : 'text-ink-subtle'}>{current?.label ?? placeholder ?? 'Select…'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-ink-subtle transition-transform ${open ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg p-1.5"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors ${
                    active ? 'bg-surface-2 text-ink-strong font-semibold' : 'text-ink-muted hover:bg-surface-2 hover:text-ink-strong'
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {active && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent-dark"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
