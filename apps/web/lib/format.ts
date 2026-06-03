// Small presentation-layer formatters shared across client + admin UI.

// Human-readable byte size (B / KB / MB). Returns "" for null/0 so callers can
// drop it from a line without a conditional.
export function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// <input type="date"> value (YYYY-MM-DD) ↔ Unix epoch seconds. Empty ⇄ null.
export function dateInputToEpoch(v: string): number | null {
  if (!v) return null;
  const ts = new Date(v).getTime();
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

export function epochToDateInput(epoch: number | null): string {
  if (!epoch) return "";
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

// Format a Unix epoch (seconds) as a localized date. Defaults to the common
// "short month, day, year" shape used across the app; pass options to override.
export function formatDate(
  epochSeconds: number,
  opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
): string {
  return new Date(epochSeconds * 1000).toLocaleDateString("en", opts);
}

// URL-safe slug from a folder/list name (used for deep-linkable collections).
export function toSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}
