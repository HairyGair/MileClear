// Personal streak: weeks in a row with at least one trip (Anthony's decision
// B, 9 Oct 2026). Worked out on the phone from trip dates, so it never
// depends on a server field that counts days.

import { startOfWeek } from "./period";

function weekKey(d: Date): number {
  // Whole weeks since an arbitrary Monday, immune to DST.
  const monday = startOfWeek(d);
  return Math.round(
    (Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.UTC(2020, 0, 6)) /
      (7 * 86_400_000)
  );
}

export interface WeekStreak {
  /** Consecutive weeks with a trip, counting back from now. */
  weeks: number;
  /** True when this week already has a trip. */
  doneThisWeek: boolean;
  /** Last N weeks, oldest first. */
  dots: Array<{ done: boolean; isCurrent: boolean }>;
  /** Longest run in the dates given. */
  best: number;
}

export function weekStreak(
  tripDates: Array<string | Date>,
  now: Date = new Date(),
  dotCount = 7
): WeekStreak {
  const weeks = new Set<number>();
  for (const d of tripDates) {
    const date = typeof d === "string" ? new Date(d) : d;
    if (!isNaN(date.getTime()) && date.getTime() <= now.getTime() + 86_400_000) {
      weeks.add(weekKey(date));
    }
  }
  const thisWeek = weekKey(now);
  const doneThisWeek = weeks.has(thisWeek);

  // A streak is still alive if last week had a trip and this week is young.
  let cursor = doneThisWeek ? thisWeek : thisWeek - 1;
  let count = 0;
  while (weeks.has(cursor)) {
    count++;
    cursor--;
  }

  const sorted = [...weeks].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of sorted) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }

  const dots = Array.from({ length: dotCount }, (_, i) => {
    const w = thisWeek - (dotCount - 1 - i);
    return { done: weeks.has(w), isCurrent: w === thisWeek };
  });

  return { weeks: count, doneThisWeek, dots, best };
}

/** "4 weeks in a row" with a gentle nudge. Never says anything is lost. */
export function weekStreakLine(s: WeekStreak): { title: string; nudge: string | null } {
  if (s.weeks === 0) return { title: "Start a run: drive this week", nudge: null };
  const word = s.weeks === 1 ? "week" : "weeks";
  return {
    title: `${s.weeks} ${word} in a row`,
    nudge: s.doneThisWeek ? null : `Drive this week to make it ${s.weeks + 1}.`,
  };
}
