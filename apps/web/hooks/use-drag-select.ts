"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * Drag-to-select for the client gallery grid: press a tile's checkbox and drag
 * to select the contiguous range (in display order) from the start tile to the
 * tile under the pointer, added on top of the existing selection. Moving back
 * shrinks the range. A plain tap (no movement) falls through to the click
 * handler - `suppressClickRef` lets that handler ignore the click that ends a
 * real drag. Tiles are hit-tested via their `data-fid` attribute.
 */
export function useDragSelect({
  items,
  selected,
  setSelected,
  anchorRef,
}: {
  items: readonly { id: string }[];
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  anchorRef: React.MutableRefObject<string | null>;
}) {
  const dragRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    anchor: number;
    baseline: Set<string>;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragSelecting, setDragSelecting] = useState(false);

  const beginDragSelect = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (e.shiftKey) return; // let the click handler do range-select
      const anchor = items.findIndex((f) => f.id === id);
      if (anchor === -1) return;
      // Clear any stale suppression: a touch drag often emits no trailing click
      // to reset it, which would otherwise eat this tap's click.
      suppressClickRef.current = false;
      const isTouch = e.pointerType === "touch";
      // Mouse/trackpad: small jitter threshold, immediate drag once exceeded.
      // Touch: hold-to-drag (iOS Photos pattern). A swipe in any direction
      // scrolls; only a deliberate hold-still engages drag-select, after which
      // moving in any direction (including vertically) selects.
      const mouseThreshold = 12;
      const touchHoldMs = 280;
      const touchHoldSlop = 10; // px the finger may drift during the hold
      let aborted = false;
      let holdTimer: ReturnType<typeof setTimeout> | null = null;
      // Once committed, an active touchmove listener blocks page scroll for
      // this gesture only - the browser would otherwise hijack the drag.
      const blockScroll = (ev: TouchEvent) => ev.preventDefault();
      let scrollBlocked = false;
      const commit = () => {
        const d = dragRef.current;
        if (!d) return;
        d.moved = true;
        setDragSelecting(true);
        if (isTouch && !scrollBlocked) {
          document.addEventListener("touchmove", blockScroll, {
            passive: false,
          });
          scrollBlocked = true;
        }
      };
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        anchor,
        baseline: new Set(selected),
      };
      if (isTouch) {
        holdTimer = setTimeout(() => {
          holdTimer = null;
          // Only commit if the finger is still down and roughly in place.
          if (!aborted && dragRef.current && !dragRef.current.moved) commit();
        }, touchHoldMs);
      }
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d || aborted) return;
        const dx = ev.clientX - d.x;
        const dy = ev.clientY - d.y;
        if (!d.moved) {
          if (isTouch) {
            // Pre-commit: any meaningful movement before the hold timer is
            // a scroll - bail out for this whole gesture.
            if (Math.hypot(dx, dy) > touchHoldSlop) {
              if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
              }
              aborted = true;
            }
            return;
          }
          // Mouse/trackpad: simple distance threshold.
          if (Math.hypot(dx, dy) < mouseThreshold) return;
          commit();
        }
        const el = document.elementFromPoint(
          ev.clientX,
          ev.clientY,
        ) as HTMLElement | null;
        const fid = el?.closest<HTMLElement>("[data-fid]")?.dataset.fid;
        const cur = fid ? items.findIndex((f) => f.id === fid) : d.anchor;
        const end = cur === -1 ? d.anchor : cur;
        const [lo, hi] = d.anchor < end ? [d.anchor, end] : [end, d.anchor];
        const next = new Set(d.baseline);
        for (let i = lo; i <= hi; i++) next.add(items[i]!.id);
        setSelected(next);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (scrollBlocked) {
          document.removeEventListener("touchmove", blockScroll);
          scrollBlocked = false;
        }
        if (dragRef.current?.moved) {
          suppressClickRef.current = true;
          anchorRef.current = id;
        }
        dragRef.current = null;
        setDragSelecting(false);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [items, selected, setSelected, anchorRef],
  );

  return { beginDragSelect, dragSelecting, suppressClickRef };
}
