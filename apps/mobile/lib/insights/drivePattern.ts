// "When you drive": 7 days x 6 four-hour blocks from the heatmap cells, plus
// the one plain line under it. Pure. Deliberately has no "best paid hours":
// those are wrong for date-only earnings until the calc fix lands.

export interface PatternCell {
  /** 0 = Sunday, 6 = Saturday (Date.getDay). */
  dayOfWeek: number;
  /** 0 to 23. */
  hour: number;
  tripCount: number;
}

/** Rows run Monday to Sunday. */
export const ROW_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;
export const DAY_PLURAL = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const BLOCK_COUNT = 6;
/** Hidden below this many trips (SPEC-UX 3.5). */
export const MIN_TRIPS = 10;

export interface DrivePattern {
  /** counts[row][block], row 0 = Monday. */
  counts: number[][];
  /** 0 to 4 for each cell: none, up to 25%, 26-50%, 51-75%, 76-100% of the busiest cell. */
  levels: number[][];
  totalTrips: number;
  /** Row index of the busiest day, and the busiest block on that day. */
  busiestRow: number;
  busiestBlock: number;
  /** Row index of the quietest day, or null when it is a tie or the same as busiest. */
  quietestRow: number | null;
  line: string;
  a11yLabel: string;
}

function hourWord(h: number): string {
  const hh = h % 24;
  if (hh === 0) return "12am";
  if (hh < 12) return `${hh}am`;
  if (hh === 12) return "12pm";
  return `${hh - 12}pm`;
}

/** Block 4 -> "4pm to 8pm", block 5 -> "8pm to 12am". */
export function blockLabel(block: number): string {
  return `${hourWord(block * 4)} to ${hourWord(block * 4 + 4)}`;
}

export function levelFor(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const f = count / max;
  if (f <= 0.25) return 1;
  if (f <= 0.5) return 2;
  if (f <= 0.75) return 3;
  return 4;
}

export function buildDrivePattern(cells: PatternCell[]): DrivePattern | null {
  const counts = ROW_DAYS.map(() => new Array<number>(BLOCK_COUNT).fill(0));
  let total = 0;
  for (const c of cells) {
    const row = (ROW_DAYS as readonly number[]).indexOf(c.dayOfWeek);
    if (row < 0 || c.hour < 0 || c.hour > 23 || !(c.tripCount > 0)) continue;
    counts[row][Math.floor(c.hour / 4)] += c.tripCount;
    total += c.tripCount;
  }
  if (total < MIN_TRIPS) return null;

  const dayTotals = counts.map((r) => r.reduce((a, b) => a + b, 0));
  const maxDay = Math.max(...dayTotals);
  const busiestRow = dayTotals.indexOf(maxDay);
  const row = counts[busiestRow];
  const busiestBlock = row.indexOf(Math.max(...row));

  const minDay = Math.min(...dayTotals);
  const minRows = dayTotals.flatMap((t, i) => (t === minDay ? [i] : []));
  const quietestRow = minRows.length === 1 && minRows[0] !== busiestRow ? minRows[0] : null;

  const maxCell = Math.max(...counts.flat());
  const levels = counts.map((r) => r.map((c) => levelFor(c, maxCell)));

  let line = `You drive most on ${DAY_PLURAL[busiestRow]}, ${blockLabel(busiestBlock)}.`;
  if (quietestRow != null) line += ` Quietest: ${DAY_PLURAL[quietestRow]}.`;

  return {
    counts,
    levels,
    totalTrips: total,
    busiestRow,
    busiestBlock,
    quietestRow,
    line,
    a11yLabel: `When you drive. ${line}`,
  };
}
