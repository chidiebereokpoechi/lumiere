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
  { revealFraction = 1.0, dismissFraction = 0.15, disabled = false } = {},
) {
  const [shown, setShown] = useState(initialShown);
  const [progress, setProgress] = useState(initialShown ? 1 : 0);
  const [dragging, setDragging] = useState(false);

  const shownRef = useRef(shown);
  shownRef.current = shown;
  // While disabled (e.g. selection mode), let gestures fall through to the page
  // so drag-to-select / scroll aren't hijacked by the cover reveal.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
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
    const startT = { v: 0 };
    // Reveal must be a slow deliberate pull, not a fling. A swipe that crosses
    // the threshold faster than this is treated as a scroll/overscroll and
    // ignored — the user has to dwell on the gesture for it to count.
    const REVEAL_MIN_MS = 500;
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
      if (disabledRef.current && !shownRef.current) {
        startY.v = null;
        return;
      }
      startY.v = shownRef.current || atTop() ? (e.touches[0]?.clientY ?? null) : null;
      startT.v = performance.now();
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
        // Reveal is threshold-only — no live preview, no tracking. The cover
        // snaps in once the gesture has clearly committed past `revealFraction`.
        if (!atTop()) {
          startY.v = null;
          return;
        }
        if (dy <= 0) return;
        // Distance + dwell-time gate: a fast fling that hits the distance
        // threshold in < REVEAL_MIN_MS is treated as a scroll, not a reveal.
        if (
          dy / vh() >= revealFraction &&
          performance.now() - startT.v >= REVEAL_MIN_MS
        ) {
          e.preventDefault();
          setShown(true);
          setProg(1);
          startY.v = null;
        }
      }
    };
    const onTouchEnd = () => {
      if (startY.v == null) return;
      startY.v = null;
      settle();
    };

    // Tracks how long the page has continuously been at scrollY=0. Reveal
    // wheel-deltas are ignored for a short grace window so that overshoot
    // momentum from a strong scroll-to-top doesn't bleed into the reveal.
    let atTopSince: number | null = null;
    const ATTOP_GRACE_MS = 250;

    const onWheel = (e: WheelEvent) => {
      if (disabledRef.current && !shownRef.current) return;
      if (shownRef.current) {
        if (e.deltaY <= 0) return; // scrolling up on the cover does nothing
        e.preventDefault();
        setDragging(true);
        wheelAccum.v += e.deltaY;
        setProg(clamp(1 - wheelAccum.v / vh()));
        scheduleSettle();
      } else {
        // Reveal is threshold-only — accumulate but don't show progress until
        // the user has clearly committed past `revealFraction` of the viewport.
        if (!atTop()) {
          atTopSince = null;
          if (e.deltaY > 0) wheelAccum.v = 0;
          return;
        }
        if (atTopSince === null) atTopSince = performance.now();
        if (e.deltaY >= 0) {
          // Downward wheel at the top is a no-op; reset the reveal accumulator
          // so a later upward gesture starts fresh.
          wheelAccum.v = 0;
          return;
        }
        // Filter momentum overshoot — ignore upward deltas until the page has
        // been at-top for a beat (i.e. the previous gesture has settled).
        if (performance.now() - atTopSince < ATTOP_GRACE_MS) return;
        e.preventDefault();
        wheelAccum.v += -e.deltaY;
        if (wheelAccum.v / vh() >= revealFraction) {
          wheelAccum.v = 0;
          setShown(true);
          setProg(1);
        } else {
          // Decay so a slow trickle of upward scroll doesn't eventually trigger.
          if (idle) window.clearTimeout(idle);
          idle = window.setTimeout(() => { wheelAccum.v = 0; }, 140);
        }
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
