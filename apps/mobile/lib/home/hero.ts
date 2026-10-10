// The Home hero figure: the driver's own number (PROPOSALS 0.3).
//
// Same sources as the old Work hero (the tax-year stats, last year's Self
// Assessment figure early in the year), with these changes:
//  - one look for both modes, text1 not amber, no streak, no "upgrade" line;
//  - "this week" is the Monday to Sunday week the Insights screen uses (its
//    weekly recap), so the two screens cannot disagree;
//  - never a zero as the headline: a new driver gets no hero at all, and a
//    driver with trips but none marked Business gets their miles instead.
//
// Pure and unit-tested.

import { formatPence } from "@mileclear/shared";
import {
  chooseHeroFigure,
  formatWholeMiles,
  type HeroYearFigure,
} from "../heroFigure";
import type { HomePersona } from "./persona";

export type HeroTarget = "tax" | "insights_month" | "records";

export interface HeroStats {
  taxYear: string;
  deductionPence: number;
  businessMiles: number;
  totalMiles: number;
  totalTrips: number;
}

export interface HeroRecapTotals {
  totalMiles: number;
  businessMiles: number;
  totalTrips: number;
}

export interface HeroInputs {
  persona: HomePersona;
  now: Date;
  stats: HeroStats | null;
  previousYear: HeroYearFigure | null;
  /** This Monday-to-Sunday week, from the weekly recap. Null until loaded. */
  week: HeroRecapTotals | null;
  /** This calendar month and the one before, from the monthly recap. */
  month: (HeroRecapTotals & { previousMiles: number | null }) | null;
}

export type HeroModel =
  | { kind: "hidden" }
  | { kind: "loading" }
  | {
      kind: "figure";
      /** Sentence case, e.g. "Mileage claim · 2026-27". */
      label: string;
      /** The big text, e.g. "£139.33" or "205". */
      figure: string;
      /** Small text beside the figure, e.g. "miles". */
      unit: string | null;
      /** One supporting line under it. */
      line: string;
      target: HeroTarget;
      /** The claim in pence when the figure is a claim (for the after-a-trip note). */
      claimPence: number | null;
      a11yLabel: string;
    };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function milesWord(n: number): string {
  return round1(n) === 1 ? "mile" : "miles";
}

/** "182", "12.4", "1,204". */
export function milesFigure(miles: number): string {
  const m = Math.max(0, miles);
  if (m < 100) {
    const r = round1(m);
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  return formatWholeMiles(m);
}

function tripsWord(n: number): string {
  return n === 1 ? "trip" : "trips";
}

function figureModel(
  label: string,
  figure: string,
  unit: string | null,
  line: string,
  target: HeroTarget,
  claimPence: number | null
): HeroModel {
  return {
    kind: "figure",
    label,
    figure,
    unit,
    line,
    target,
    claimPence,
    a11yLabel: `${label}: ${figure}${unit ? ` ${unit}` : ""}. ${line}`,
  };
}

/** "182 business miles this week", or a plain line when there are none yet. */
function weekBusinessLine(week: HeroRecapTotals | null): string {
  if (!week) return "";
  const n = round1(week.businessMiles);
  if (n <= 0) return "No business miles yet this week";
  return `${milesFigure(n)} business ${milesWord(n)} this week`;
}

export function selectHero(i: HeroInputs): HeroModel {
  const { stats } = i;
  if (!stats) return { kind: "loading" };

  // A new driver has no number yet, and "0.00" is not an honest headline.
  if (stats.totalTrips === 0) return { kind: "hidden" };

  if (i.persona === "personal") {
    const m = i.month;
    if (!m) return { kind: "loading" };
    const monthName = MONTHS[i.now.getMonth()];
    const weekPart = i.week ? `${milesFigure(i.week.totalMiles)} this week` : null;
    if (m.totalMiles < 0.05) {
      const prevMonth = MONTHS[(i.now.getMonth() + 11) % 12];
      const line =
        m.previousMiles != null && m.previousMiles >= 0.5
          ? `${prevMonth}: ${formatWholeMiles(m.previousMiles)} ${milesWord(m.previousMiles)}`
          : `Every drive adds to ${monthName}`;
      return figureModel(monthName, "A quiet month so far", null, line, "insights_month", null);
    }
    const parts = [
      weekPart,
      `${m.totalTrips} ${tripsWord(m.totalTrips)} this month`,
    ].filter((p): p is string => !!p);
    return figureModel(
      monthName,
      milesFigure(m.totalMiles),
      milesWord(m.totalMiles),
      parts.join(" · "),
      "insights_month",
      null
    );
  }

  if (i.persona === "company") {
    const line = i.week ? `${milesFigure(i.week.businessMiles)} this week` : "";
    return figureModel(
      `Business miles · ${stats.taxYear}`,
      formatWholeMiles(stats.businessMiles),
      "mi",
      line,
      "records",
      null
    );
  }

  // Gig, Both and Employee: the mileage claim, with the same lead-figure rules
  // as before (lib/heroFigure).
  const choice = chooseHeroFigure({
    now: i.now,
    current: {
      taxYear: stats.taxYear,
      deductionPence: stats.deductionPence,
      businessMiles: stats.businessMiles,
    },
    totalMilesThisYear: stats.totalMiles,
    previous: i.previousYear,
  });

  if (choice.kind === "previous_year") {
    const prev = choice.previous;
    const soFar =
      stats.deductionPence > 0 ? formatPence(stats.deductionPence) : "no business miles yet";
    return figureModel(
      `Mileage claim · ${prev.taxYear}`,
      formatPence(prev.deductionPence),
      null,
      `${stats.taxYear} so far: ${soFar}`,
      "tax",
      prev.deductionPence
    );
  }

  if (choice.kind === "miles_tracked") {
    return figureModel(
      "Since 6 April",
      formatWholeMiles(choice.miles),
      "miles",
      `${formatPence(stats.deductionPence)} claim so far`,
      "tax",
      null
    );
  }

  if (stats.deductionPence <= 0) {
    // Trips exist but none count as Business yet: show the miles, not a zero.
    if (stats.totalMiles >= 0.5) {
      return figureModel(
        "Since 6 April",
        formatWholeMiles(stats.totalMiles),
        "miles",
        "None marked Business yet",
        "tax",
        null
      );
    }
    return { kind: "hidden" };
  }

  return figureModel(
    `Mileage claim · ${stats.taxYear}`,
    formatPence(stats.deductionPence),
    null,
    weekBusinessLine(i.week),
    "tax",
    stats.deductionPence
  );
}

/** "+£6.82 from your last trip" when the claim has gone up by at least £1. */
export function claimGainNote(beforePence: number | null, afterPence: number | null): string | null {
  if (beforePence == null || afterPence == null) return null;
  const gain = afterPence - beforePence;
  if (gain < 100) return null;
  return `+${formatPence(gain)} from your last trip`;
}
