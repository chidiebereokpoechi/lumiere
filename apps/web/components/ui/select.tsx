"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "@/components/ui/icons";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  // Optional group label — a heading is rendered before the first option of
  // each group (options must be ordered by group). Omit for ungrouped lists.
  group?: string;
}

// Custom listbox dropdown (no native <select>). Matches the form input shell:
// 1px border, peach focus ring, squared corners, chevron.
export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
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
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  // Bucket options into contiguous runs by `group` so each group renders as its
  // own block (heading + items), with spacing between groups.
  const groups: { group?: string; items: SelectOption<T>[] }[] = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last.group === o.group) last.items.push(o);
    else groups.push({ group: o.group, items: [o] });
  }

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-left text-sm text-ink-strong hover:border-border-strong focus:border-accent transition-colors"
      >
        <span
          className={`min-w-0 flex-1 truncate ${current ? "" : "text-ink-muted"}`}
        >
          {current?.label ?? placeholder ?? "Select…"}
        </span>
        <ChevronDown
          className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          size={16}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg p-1.5 flex flex-col gap-4"
        >
          {groups.map((g, gi) => (
            <div key={g.group ?? gi} className="flex flex-col">
              {g.group && (
                <p className="px-2.5 pb-1 text-xs font-bold tracking-wider text-ink-muted">
                  {g.group}
                </p>
              )}
              {g.items.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? "bg-surface-2 text-ink-strong font-semibold"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink-strong"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {active && (
                      <Check className="shrink-0 text-accent-dark" size={16} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
