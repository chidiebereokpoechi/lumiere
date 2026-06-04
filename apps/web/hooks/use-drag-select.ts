"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Drag-to-select for the client gallery grid: press a tile's checkbox and drag
 * to select the contiguous range (in display order) from the start tile to the
 * tile under the pointer, added on top of the existing selection. Moving back
 * shrinks the range. A plain tap (no movement) falls through to the click
 * handler — `suppressClickRef` lets that handler ignore the click that ends a
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
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        anchor,
        baseline: new Set(selected),
      };
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        if (!d.moved) {
          // Higher threshold so finger jitter on a tap isn't read as a drag.
          if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 12) return;
          d.moved = true;
          setDragSelecting(true);
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
