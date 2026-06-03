"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Multi-select with shift-click range support, shared by the admin media grid
 * and the client gallery.
 *
 * `toggle(id, shift)` toggles a single id, or — when `shift` is held and a prior
 * plain-click anchor exists — additively selects the contiguous range (in
 * display order) from the anchor to `id` without clearing the existing
 * selection. The anchor is kept across shift-clicks so the range re-bases from
 * the same start.
 *
 * `ordered` is the current display order (the array, or a getter for callers
 * whose order lives in a ref and mutates between renders, e.g. during a drag).
 * `anchorRef` is exposed so a drag-select gesture can set the anchor directly.
 */
export function useRangeSelect(ordered: string[] | (() => string[])) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);

  const toggle = useCallback(
    (id: string, shift: boolean) => {
      setSelected((prev) => {
        const order = typeof ordered === "function" ? ordered() : ordered;
        const next = new Set(prev);
        if (shift && anchorRef.current) {
          const a = order.indexOf(anchorRef.current);
          const b = order.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(order[i]!);
            return next; // keep anchor so further shift-clicks re-range from it
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        anchorRef.current = id;
        return next;
      });
    },
    [ordered],
  );

  const clear = useCallback(() => setSelected(new Set()), []);
  const selectAll = useCallback(() => {
    const order = typeof ordered === "function" ? ordered() : ordered;
    setSelected(new Set(order));
  }, [ordered]);

  return { selected, setSelected, toggle, clear, selectAll, anchorRef };
}
