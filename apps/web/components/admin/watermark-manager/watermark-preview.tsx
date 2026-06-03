import type { WatermarkPosition } from "@/lib/api/watermarks";
import { ImageIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Draft } from "./draft";

// Approximate CSS rendering of a watermark over a sample backdrop. The real
// compositing happens server-side via Sharp; this is just a design aid.
export function WatermarkPreview({
  draft,
  compact,
}: {
  draft: Draft;
  compact?: boolean;
}) {
  const align: Record<WatermarkPosition, string> = {
    "top-left": "items-start justify-start",
    "top-center": "items-start justify-center",
    "top-right": "items-start justify-end",
    center: "items-center justify-center",
    "bottom-left": "items-end justify-start",
    "bottom-center": "items-end justify-center",
    "bottom-right": "items-end justify-end",
  };
  const textPx =
    draft.size === "small"
      ? compact
        ? 10
        : 16
      : draft.size === "large"
        ? compact
          ? 22
          : 40
        : compact
          ? 15
          : 26;
  const imgW =
    draft.size === "small" ? "22%" : draft.size === "large" ? "55%" : "38%";

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg bg-linear-to-br from-slate-500 via-slate-700 to-slate-900",
        compact ? "aspect-4/3" : "aspect-video",
      )}
    >
      <div className={cn("absolute inset-0 flex p-3", align[draft.position])}>
        {draft.type === "text" ? (
          <span
            style={{
              color: draft.color,
              opacity: draft.opacity,
              fontSize: textPx,
              lineHeight: 1.1,
            }}
            className="font-bold drop-shadow max-w-full truncate"
          >
            {draft.text || "Your watermark"}
          </span>
        ) : draft.logoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={draft.logoPreview}
            alt=""
            style={{ width: imgW, opacity: draft.opacity }}
            className="object-contain"
          />
        ) : (
          <span
            style={{ opacity: draft.opacity }}
            className="inline-flex items-center gap-1.5 rounded bg-white/85 px-2 py-1 text-[11px] font-bold tracking-wider text-slate-800"
          >
            <ImageIcon size={14} />
            Logo
          </span>
        )}
      </div>
    </div>
  );
}
