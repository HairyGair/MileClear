// Small helpers shared by BarChart and LineChart.

export interface ChartDatum {
  /** Axis label, e.g. "28 Sep". */
  label: string;
  value: number;
  /** Longer label for the tooltip, e.g. "Mon 28 Sep". Defaults to label. */
  fullLabel?: string;
}

/** Round step for an axis: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

/** Ticks from zero to at least `max`, about `count` of them. Whole numbers
 *  when the data is whole numbers. */
export function niceTicks(max: number, count = 4, integer = true): number[] {
  let step = niceStep((max || 1) / count);
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.max(step, Math.ceil((max || 1) / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** Show every nth x label so they never collide. */
export function labelEvery(count: number, width: number, minGap = 52): number {
  if (count <= 1) return 1;
  return Math.max(1, Math.ceil((count * minGap) / Math.max(width, 1)));
}

/** A bar with only its top corners rounded (the data end), anchored to the
 *  baseline. */
export function roundedTopBar(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  const b = y + h;
  return `M${x},${b} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${b} Z`;
}

/** Short axis numbers: 1,200 -> "1.2k". Tooltips show the full number. */
export function compactAxis(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(+n.toFixed(2));
}
