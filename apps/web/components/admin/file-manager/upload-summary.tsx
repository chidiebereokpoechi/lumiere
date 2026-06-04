import type { UploadTile } from "@/hooks/use-uploads";

// Aggregate progress banner shown above the grid while uploads are in flight.
export function UploadSummary({ tiles }: { tiles: UploadTile[] }) {
  const total = tiles.length;
  const done = tiles.filter(
    (t) => t.status === "ready" || t.status === "error",
  ).length;
  const failed = tiles.filter((t) => t.status === "error").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink-strong">
          Uploading {total} item{total !== 1 ? "s" : ""} - one at a time
        </span>
        <span className="tabular-nums text-ink-muted">
          {done}/{total}
          {failed ? ` · ${failed} failed` : ""}
        </span>
      </div>
      <div className="h-2 rounded-pill bg-surface-sunken overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
