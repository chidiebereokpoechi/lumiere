"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Drag-gate for the full-screen gallery cover. The cover tracks the gesture
 * live (`progress` 0 = gallery, 1 = cover) and cleanly settles to one end on
 * release — never resting halfway, never a decoupled "zip".
 *
 * Asymmetric commit: dismissing (cover → gallery) is easy — a small downward
 * gesture; revealing (gallery → cover) is hard — must drag past `revealFraction`
 * of the viewport, and only from the gallery top. Wheel deltas accumulate into
 * the same progress and settle after a short idle. Rubber-band / pull-to-refresh
 * is suppressed at the seam so the cover never peeks by accident.
 */
export function useCoverGate(
  initialShown: boolean,
  { revealFraction = 0.55, dismissFraction = 0.15 } = {},
) {
  const [shown, setShown] = useState(initialShown);
  const [progress, setProgress] = useState(initialShown ? 1 : 0);
  const [dragging, setDragging] = useState(false);

  const shownRef = useRef(shown);
  shownRef.current = shown;
  const progressRef = useRef(progress);
  const setProg = useCallback((p: number) => {
    progressRef.current = p;
    setProgress(p);
  }, []);

  // Imperative dismiss (the "View gallery" button) — clean animated settle.
  const dismiss = useCallback(() => {
    setDragging(false);
    setShown(false);
    setProg(0);
  }, [setProg]);

  useEffect(() => {
    const vh = () => window.innerHeight || 1;
    const atTop = () => window.scrollY <= 0;
    const startY = { v: null as number | null };
    const wheelAccum = { v: 0 };
    let idle: number | null = null;

    const settle = () => {
      wheelAccum.v = 0;
      if (idle) {
        window.clearTimeout(idle);
        idle = null;
      }
      setDragging(false);
      const p = progressRef.current;
      if (shownRef.current) {
        if (p < 1 - dismissFraction) {
          setShown(false);
          setProg(0);
        } else setProg(1);
      } else {
        if (p > revealFraction) {
          setShown(true);
          setProg(1);
        } else setProg(0);
      }
    };
    const scheduleSettle = () => {
      if (idle) window.clearTimeout(idle);
      idle = window.setTimeout(settle, 140);
    };

    const onTouchStart = (e: TouchEvent) => {
      startY.v = shownRef.current || atTop() ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const s = startY.v;
      if (s == null) return;
      const dy = (e.touches[0]?.clientY ?? s) - s; // down = positive
      if (shownRef.current) {
        if (dy >= 0) return; // can't pull the cover further down
        e.preventDefault();
        setDragging(true);
        setProg(clamp(1 + dy / vh()));
      } else {
        if (!atTop()) {
          startY.v = null;
          return;
        }
        if (dy <= 0) return; // only a downward pull reveals the cover above
        e.preventDefault();
        setDragging(true);
        setProg(clamp(dy / vh()));
      }
    };
    const onTouchEnd = () => {
      if (startY.v == null) return;
      startY.v = null;
      settle();
    };

    const onWheel = (e: WheelEvent) => {
      if (shownRef.current) {
        if (e.deltaY <= 0) return; // scrolling up on the cover does nothing
        e.preventDefault();
        setDragging(true);
        wheelAccum.v += e.deltaY;
        setProg(clamp(1 - wheelAccum.v / vh()));
        scheduleSettle();
      } else {
        if (!atTop() || e.deltaY >= 0) {
          if (e.deltaY > 0) wheelAccum.v = 0;
          return;
        }
        e.preventDefault();
        setDragging(true);
        wheelAccum.v += -e.deltaY;
        setProg(clamp(wheelAccum.v / vh()));
        scheduleSettle();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("wheel", onWheel);
      if (idle) window.clearTimeout(idle);
    };
  }, [revealFraction, dismissFraction, setProg]);

  return { shown, progress, dragging, dismiss };
}
