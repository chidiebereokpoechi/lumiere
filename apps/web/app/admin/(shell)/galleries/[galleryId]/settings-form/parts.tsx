import { cn } from "@/lib/cn";
import { Check } from "@/components/ui/icons";
import type { SaveState } from "@/hooks/use-gallery-settings";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface border border-border p-4 space-y-4">
      <h2 className="text-xs font-extrabold tracking-wider text-ink-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Inline auto-save indicator — replaces a Save button. Changes persist
// automatically as fields change.
export function SaveStatus({ state }: { state: SaveState }) {
  const base = "inline-flex items-center gap-2 text-xs font-semibold tracking-wider";
  if (state === "saving") {
    return (
      <span className={cn(base, "text-ink-muted")}>
        <span className="h-3 w-3 rounded-full border-2 border-ink-subtle border-t-transparent animate-spin" />
        Saving…
      </span>
    );
  }
  if (state === "error") {
    return <span className={cn(base, "text-negative")}>Not saved</span>;
  }
  if (state === "saved") {
    return (
      <span className={cn(base, "text-ink-muted")}>
        <Check size={16} />
        All changes saved
      </span>
    );
  }
  return (
    <span className={cn(base, "text-ink-subtle")}>
      Changes save automatically
    </span>
  );
}
