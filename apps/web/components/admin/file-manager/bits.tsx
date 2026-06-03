import type { GalleryFile } from "@/lib/api/files";
import { Music, FileDoc, SpinnerIcon } from "@/components/ui/icons";

// Small shared visual atoms for the media manager (tiles, preview, placeholders).

export function Spinner() {
  return <SpinnerIcon size={20} className="animate-spin text-ink-muted" />;
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-surface-strong text-ink-inverse px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider">
      {children}
    </span>
  );
}

// Fallback glyph for non-visual file types (audio without cover art, documents).
export function TypeIcon({ type }: { type: GalleryFile["type"] }) {
  const Icon = type === "audio" ? Music : FileDoc;
  return <Icon size={24} className="text-ink-muted" />;
}
