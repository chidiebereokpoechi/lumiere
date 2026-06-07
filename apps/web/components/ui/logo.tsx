import { cn } from "@/lib/cn";

// Brand marks. The source art (resources/lumiere-icon.png) is a coral orb on a
// transparent background, so the mark drops straight onto any surface - no chip.

interface LogoMarkProps {
  /** Mark edge length in px. */
  size?: number;
  className?: string;
}

/** The orb logomark. */
export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local brand asset;
    // next/image uses a custom presign loader that would mangle /public.
    <img
      src="/brand/orb.png"
      alt=""
      width={size}
      height={size}
      className={cn("inline-block shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

interface LogoProps {
  /** Mark edge length in px. */
  size?: number;
  /** Show the "Lumière" wordmark beside the mark. */
  wordmark?: boolean;
  className?: string;
}

/** Logomark + optional "Lumière" wordmark, the standard in-product lockup. */
export function Logo({ size = 32, wordmark = true, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="font-bold tracking-wider text-ink-strong">
          Lumière
        </span>
      )}
    </span>
  );
}

/** The full "Lumière by chids." brand lockup (orb + wordmark + attribution). */
export function LogoLockup({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local brand asset;
    // next/image uses a custom presign loader that would mangle /public.
    <img
      src="/brand/lockup.png"
      alt="Lumière by chids."
      className={cn("block object-contain", className)}
    />
  );
}
