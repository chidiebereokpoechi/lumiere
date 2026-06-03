"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "@/components/ui/icons";

// Native-free date picker. Value is a 'YYYY-MM-DD' string ('' = unset); onChange
// emits the same. Calendar popover with a chevron header, Monday-first weeks,
// and a clear action — styled to the system tokens.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parse(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return { y: +m[1]!, m: +m[2]! - 1, d: +m[3]! };
}
function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DateField({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const parsed = parse(value);

  // Month the calendar is showing (defaults to the value's month, else today).
  const [view, setView] = useState(() => {
    const base =
      parsed ??
      (() => {
        const t = new Date();
        return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
      })();
    return { y: base.y, m: base.m };
  });

  useEffect(() => {
    if (!open) return;
    if (parsed) setView({ y: parsed.y, m: parsed.m });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = parsed
    ? `${parsed.d} ${MONTHS[parsed.m]} ${parsed.y}`
    : placeholder;

  // Build the grid: leading blanks (Monday-first) + day cells.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay(); // 0=Sun
    const lead = (first + 6) % 7; // Monday-first offset
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const arr: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= days; d++) arr.push(d);
    return arr;
  }, [view]);

  const step = (delta: number) =>
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md bg-surface-2 border border-border px-3.5 py-2.5 text-left text-sm hover:border-border-strong focus:border-accent transition-colors"
      >
        <span className={parsed ? "text-ink-strong" : "text-ink-subtle"}>
          {label}
        </span>
        <Calendar className="shrink-0 text-ink-subtle" size={16} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-md border border-border bg-surface shadow-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink-strong"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-ink-strong">
              {MONTHS[view.m]} {view.y}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink-strong"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK.map((w) => (
              <span
                key={w}
                className="text-center text-[10px] font-bold tracking-wider text-ink-subtle py-1"
              >
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <span key={`b${i}`} />;
              const selected =
                parsed &&
                parsed.y === view.y &&
                parsed.m === view.m &&
                parsed.d === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    onChange(iso(view.y, view.m, d));
                    setOpen(false);
                  }}
                  className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-sm tabular-nums transition-colors ${
                    selected
                      ? "bg-surface-strong text-ink-inverse font-bold"
                      : "text-ink-strong hover:bg-surface-2"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          {parsed && (
            <div className="mt-2 pt-2 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs font-bold tracking-wider text-ink-muted hover:text-negative"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
