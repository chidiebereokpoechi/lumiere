// Small presentation-layer formatters shared across client + admin UI.

// Human-readable byte size (B / KB / MB). Returns "" for null/0 so callers can
// drop it from a line without a conditional.
export function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
