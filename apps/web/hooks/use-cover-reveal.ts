"use client";

import { useEffect, useRef } from "react";

/**
 * Resistance gate for pulling the gallery cover back into view. Only active when
 * the cover is hidden (`enabled`) and the page is at the gallery top (scrollY
 * <= 0). A deliberate upward gesture past a high threshold — accumulated wheel
 * delta on desktop, a long downward swipe on touch — fires `onReveal`. Normal
 * scrolling stays pinned at the top (the cover never peeks halfway).
 *
 * Wheel/touchmove are captured non-passively at the top so the browser's
 * rubber-band / pull-to-refresh doesn't reveal the cover by accident.
 */
export function useCoverReveal({
  enabled,
  onReveal,
  wheelThreshold = 1200,
  swipeFraction = 0.55,
}: {
  enabled: boolean;
  onReveal: () => void;
  wheelThreshold?: number;
  swipeFraction?: number;
}) {
  const accum = useRef(0);
  const idle = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!enabled) {
      accum.current = 0;
      return;
    }
    const atTop = () => window.scrollY <= 0;

    const onWheel = (e: WheelEvent) => {
      if (!atTop()) return;
      if (e.deltaY >= 0) {
        accum.current = 0;
        return;
      }
      // Pulling up while already at the top — accumulate, block the bounce.
      e.preventDefault();
      accum.current += -e.deltaY;
      if (idle.current) window.clearTimeout(idle.current);
      idle.current = window.setTimeout(() => (accum.current = 0), 500);
      if (accum.current > wheelThreshold) {
        accum.current = 0;
        onReveal();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      fired.current = false;
      touchStartY.current = atTop() ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const s = touchStartY.current;
      if (s == null || fired.current) return;
      if (!atTop()) {
        touchStartY.current = null;
        return;
      }
      const dy = (e.touches[0]?.clientY ?? s) - s;
      if (dy <= 0) return; // only a downward pull reveals the cover above
      e.preventDefault();
      if (dy > window.innerHeight * swipeFraction) {
        fired.current = true;
        onReveal();
      }
    };
    const onTouchEnd = () => {
      touchStartY.current = null;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (idle.current) window.clearTimeout(idle.current);
    };
  }, [enabled, onReveal, wheelThreshold, swipeFraction]);
}
