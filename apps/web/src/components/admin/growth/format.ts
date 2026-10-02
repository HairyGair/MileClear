// Small formatters for the Growth pages.

/** "2 Oct, 14:05" */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 95 -> "1h 35m", 40 -> "40m" */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

/** One decimal place percentage: 12.345 -> "12.3%" */
export function pct1(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Vertical stack of panels inside a tab. */
export const STACK = { display: "flex", flexDirection: "column", gap: "var(--adm-s5)", minWidth: 0 } as const;
