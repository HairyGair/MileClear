// What the Tax tab's "Quarterly updates" card says (SPEC 4.1).
// Pure (type-only imports) so quarterlyCard.test.ts runs without a built shared package.
//
// Who sees what, for drivers who send as self-employed (gig or both):
//   connected to HMRC             -> the card, always
//   not connected, scope "now"    -> the card ("Connect to HMRC")
//   not connected, scope "later"  -> the card ("Connect to HMRC")
//   not connected, "not_yet"      -> one short line, no card
//   anything we couldn't find out -> a neutral card that opens the screen

import type { MtdScopeAnswer } from "@mileclear/shared";

/** The quarterly updates screen. Hub, card and help all open this. */
export const MTD_HUB_ROUTE = "/tax-mtd";

export interface CardQuarter {
  start: string;
  end: string;
  due: string;
  status: "Open" | "Fulfilled";
}

/** The shape of GET /hmrc/summary's data. */
export interface QuarterlySummary {
  connected: boolean;
  /** National Insurance number and business both saved. */
  ready: boolean;
  taxYear: string | null;
  quarters: CardQuarter[];
  /** When HMRC's dates were last loaded (ISO). Older than 14 days is not trusted for "Late". */
  seenAt?: string | null;
}

/** HMRC's dates older than this are shown as "Last checked", never as due or late. */
export const STALE_AFTER_DAYS = 14;

/**
 * The scope answer the card can trust. "Not needed yet" rests on the income
 * MileClear holds; when a finished tax year has none (the driver joined later,
 * or earned elsewhere) it can't say that, so the card stays neutral.
 */
export function scopeForCard(r: {
  answer: MtdScopeAnswer;
  years: Array<{ taxYear: string; complete: boolean }>;
  missingTaxYears: string[];
}): MtdScopeAnswer | null {
  if (r.answer !== "not_yet") return r.answer;
  const finishedMissing = r.missingTaxYears.some((ty) => r.years.find((y) => y.taxYear === ty)?.complete);
  return finishedMissing ? null : r.answer;
}

export type SegmentState = "sent" | "due" | "later";
export type PillTone = "amber" | "red" | "green";

export type QuarterlyCardModel =
  | { kind: "hidden" }
  | { kind: "line"; text: string; link: string }
  | {
      kind: "card";
      title: string;
      sub: string;
      pill: { text: string; tone: PillTone } | null;
      segments: SegmentState[];
      /** "1 of 4 sent for 2026-27", only when quarters are known. */
      progress: string | null;
      link: string;
    };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_MS = 86_400_000;

function utc(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

/** "July to October" for a quarter 2026-07-06 to 2026-10-05. */
export function quarterLabel(q: Pick<CardQuarter, "start" | "end">): string {
  return `${MONTHS[+q.start.slice(5, 7) - 1]} to ${MONTHS[+q.end.slice(5, 7) - 1]}`;
}

/** "7 November" */
export function dueDay(iso: string): string {
  return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
}

/** Whole days from today to the due date; negative once it has passed. */
export function daysUntil(todayIso: string, dueIso: string): number {
  return Math.round((utc(dueIso.slice(0, 10)) - utc(todayIso)) / DAY_MS);
}

export function pillFor(days: number): { text: string; tone: PillTone } {
  if (days < 0) return { text: "Late", tone: "red" };
  if (days === 0) return { text: "Today", tone: "amber" };
  return { text: days === 1 ? "1 day" : `${days} days`, tone: "amber" };
}

function neutral(): QuarterlyCardModel {
  return {
    kind: "card",
    title: "Quarterly updates",
    sub: "Open to see what's due and what's been sent",
    pill: null,
    segments: [],
    progress: null,
    link: "Open",
  };
}

export function quarterlyCardModel(args: {
  /** null = not loaded or failed. */
  summary: QuarterlySummary | null;
  /** null = not worked out (yet, or it failed). */
  scope: MtdScopeAnswer | null;
  /** The phase's start month for a driver who comes in later, "April 2027". */
  scopeStartsLabel?: string | null;
  todayIso: string;
}): QuarterlyCardModel {
  const { summary, scope, todayIso } = args;
  if (!summary) return neutral();

  if (!summary.connected) {
    if (scope === "not_yet") {
      return {
        kind: "line",
        text: "Going by your MileClear earnings, quarterly updates to HMRC aren't needed for you yet.",
        link: "See why",
      };
    }
    if (scope == null) {
      return {
        kind: "card",
        title: "Quarterly updates",
        sub: "Find out if HMRC needs these from you",
        pill: null,
        segments: [],
        progress: null,
        link: "Check",
      };
    }
    return {
      kind: "card",
      title: "Quarterly updates",
      sub:
        scope === "now"
          ? "HMRC needs these from you now"
          : `HMRC needs these from you from 6 ${args.scopeStartsLabel ?? "April 2027"}`,
      pill: null,
      segments: [],
      progress: null,
      link: "Connect to HMRC",
    };
  }

  if (!summary.ready) {
    return {
      kind: "card",
      title: "Quarterly updates",
      sub: "Finish setting up to send your first update",
      pill: null,
      segments: [],
      progress: null,
      link: "Continue setup",
    };
  }

  const qs = summary.quarters;
  if (qs.length === 0) return neutral();

  const sent = qs.filter((q) => q.status === "Fulfilled").length;
  const progress = `${sent} of ${qs.length} sent for ${summary.taxYear}`;
  const firstOpen = qs.find((q) => q.status === "Open");

  if (!firstOpen) {
    return {
      kind: "card",
      title: "Quarterly updates",
      sub: `All ${qs.length} sent for ${summary.taxYear}`,
      pill: { text: "Up to date", tone: "green" },
      segments: qs.map(() => "sent" as const),
      progress: null,
      link: "See your updates",
    };
  }

  // HMRC's dates are only as fresh as the last time the quarterly updates screen
  // loaded them. Past two weeks we say when we last checked, rather than show
  // "Late" or "Up to date" on old information.
  const seenDay = summary.seenAt ? summary.seenAt.slice(0, 10) : null;
  if (!seenDay || daysUntil(seenDay, todayIso) > STALE_AFTER_DAYS) {
    return {
      kind: "card",
      title: "Quarterly updates",
      sub: seenDay ? `Last checked ${dueDay(seenDay)}. Open to see what's due` : "Open to see what's due",
      pill: null,
      segments: qs.map((q) => (q.status === "Fulfilled" ? ("sent" as const) : ("later" as const))),
      progress,
      link: "Open",
    };
  }

  // A quarter can be sent once it has ended. Before that, nothing is due.
  const ended = firstOpen.end.slice(0, 10) < todayIso;
  const segments = qs.map((q): SegmentState =>
    q.status === "Fulfilled" ? "sent" : q === firstOpen && ended ? "due" : "later",
  );

  if (!ended) {
    return {
      kind: "card",
      title: "Quarterly updates",
      sub: `Next: ${quarterLabel(firstOpen)}, by ${dueDay(firstOpen.due)}`,
      pill: { text: "Up to date", tone: "green" },
      segments,
      progress,
      link: "See your updates",
    };
  }

  return {
    kind: "card",
    title: "Quarterly update due",
    sub: `${quarterLabel(firstOpen)} · by ${dueDay(firstOpen.due)}`,
    pill: pillFor(daysUntil(todayIso, firstOpen.due)),
    segments,
    progress,
    link: "Review and send",
  };
}
