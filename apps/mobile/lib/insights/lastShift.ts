// Words and figures for the Last shift card. Pure.

import type { ShiftScorecard } from "@mileclear/shared";
import { formatMilesShort, milesWord, tripsWord } from "./summary";

export function formatDuration(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface ShiftSummary {
  dateLabel: string;
  figures: (formatPence: (p: number) => string) => Array<{ value: string; label: string }>;
  spoken: (formatPence: (p: number) => string) => string;
  /** One quiet line when the shift set a personal best. */
  badge: string | null;
}

/** Null when the shift has no recorded driving to show. */
export function shiftSummary(s: ShiftScorecard): ShiftSummary | null {
  if (!s || (s.tripsCompleted <= 0 && s.totalMiles < 0.05)) return null;
  const when = new Date(s.endedAt ?? s.startedAt);
  const dateLabel = isNaN(when.getTime()) ? "" : `${when.getDate()} ${MONTHS[when.getMonth()]}`;
  const miles = `${formatMilesShort(s.totalMiles)} ${milesWord(s.totalMiles)}`;
  const trips = `${s.tripsCompleted} ${tripsWord(s.tripsCompleted)}`;
  const badge = s.isPersonalBestMiles
    ? "Your furthest shift yet."
    : s.isPersonalBestTrips
      ? "Your busiest shift yet."
      : null;
  return {
    dateLabel,
    badge,
    figures: (fp) => {
      const out = [
        { value: formatDuration(s.durationSeconds), label: "on shift" },
        { value: formatMilesShort(s.totalMiles), label: milesWord(s.totalMiles) },
        { value: String(s.tripsCompleted), label: tripsWord(s.tripsCompleted) },
      ];
      if (s.deductionPence > 0) out[2] = { value: fp(s.deductionPence), label: "claim built" };
      return out;
    },
    spoken: (fp) =>
      `Last shift${dateLabel ? `, ${dateLabel}` : ""}. ${formatDuration(s.durationSeconds)}, ${trips}, ${miles}` +
      (s.deductionPence > 0 ? `, ${fp(s.deductionPence)} mileage claim built` : "") +
      ".",
  };
}
