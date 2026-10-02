"use client";

import { useEffect, useRef, useState } from "react";

/** Width of an element, kept up to date with a ResizeObserver. Charts draw in
 *  real pixels from this so text and line widths never stretch. `fallback` is
 *  used for the first paint, before the element has been measured. */
export function useMeasuredWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}
