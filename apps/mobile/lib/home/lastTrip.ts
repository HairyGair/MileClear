// The Last trip card on Home (PROPOSALS 0.4): what it shows, which look it
// takes, and the words on it. Pure and unit-tested; the screen only draws it.
//
// Looks:
//  - "first": a new driver, no trips yet ("Your first trip");
//  - "full": the trip with its Business / Personal choice (just finished, or
//    older but still unsorted);
//  - "compact": one line for an older sorted trip, or a recent one where the
//    choice is not offered (Personal mode, or a driver who has never had a
//    Business trip).
// The footer is separate: unsorted count first, else a possible missed drive.

export type SyncChip = "synced" | "saving" | "waiting" | "failed";

export type TripChoice = "business" | "personal" | "unclassified";

/** How long a saved trip counts as "just finished". */
export const RECENT_TRIP_MS = 12 * 60 * 60 * 1000;

export interface LastTripData {
  id: string;
  /** ISO, as stored. */
  startedAt: string;
  endedAt: string | null;
  distanceMiles: number;
  /** Already shortened place names, either may be empty. */
  startLabel: string;
  endLabel: string;
  classification: TripChoice;
  /** A rule or a learned route set the classification, not the driver. */
  autoSorted: boolean;
  isShiftTrip: boolean;
  /** Added by hand: the mini map joins start and end with a dashed line. */
  isManual: boolean;
  sync: SyncChip;
  /** Simplified route points for the mini map; empty for manual trips. */
  route: { lat: number; lng: number }[];
  startPoint: { lat: number; lng: number } | null;
  endPoint: { lat: number; lng: number } | null;
}

export interface LastTripInputs {
  mode: "work" | "personal";
  /** The driver has never had a Business trip (Personal-only driver). */
  personalOnlyDriver: boolean;
  trip: LastTripData | null;
  /** Trips ever recorded, from the stats (a new driver has none). */
  totalTrips: number;
  unsortedCount: number | null;
  missedCount: number | null;
  now: number;
}

export type LastTripFooter =
  | { kind: "unsorted"; text: string }
  | { kind: "missed"; text: string }
  | null;

export type LastTripView =
  | { look: "none" }
  | { look: "first" }
  | {
      look: "full" | "compact";
      /** "Just now · 12.4 mi" */
      eyebrow: string;
      /** "Home to Sunderland Depot" */
      route: string;
      choice: TripChoice;
      showChoice: boolean;
      showAutoTag: boolean;
      chip: SyncChip;
      chipText: string;
      shiftChip: boolean;
      trip: LastTripData;
      footer: LastTripFooter;
      a11yLabel: string;
    };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Just now", "12 min ago", "2 h ago", "Today 17:40", "Yesterday 17:40", "Mon 5 Oct 17:40". */
export function whenLabel(startedAtIso: string, endedAtIso: string | null, now: number): string {
  const when = new Date(endedAtIso ?? startedAtIso);
  if (Number.isNaN(when.getTime())) return "Recently";
  const nowD = new Date(now);
  const age = now - when.getTime();
  if (age < 2 * 60 * 1000) return "Just now";
  if (age < 60 * 60 * 1000) return `${Math.floor(age / 60000)} min ago`;
  if (age < RECENT_TRIP_MS && sameDay(when, nowD)) return `${Math.floor(age / 3600000)} h ago`;
  const start = new Date(startedAtIso);
  const shown = Number.isNaN(start.getTime()) ? when : start;
  if (sameDay(shown, nowD)) return `Today ${clock(shown)}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(shown, yesterday)) return `Yesterday ${clock(shown)}`;
  return `${DAYS[shown.getDay()]} ${shown.getDate()} ${MONTHS[shown.getMonth()]} ${clock(shown)}`;
}

export function milesText(miles: number): string {
  const m = Math.round(Math.max(0, miles) * 10) / 10;
  // No-break spaces keep "12.8 mi" (and the dot before it) from wrapping apart.
  return `${m.toFixed(1)}\u00a0mi`;
}

/** "Home to Sunderland Depot", "To Sunderland Depot", "From Home", or "Route not recorded". */
export function routeText(startLabel: string, endLabel: string): string {
  if (startLabel && endLabel) return `${startLabel} to ${endLabel}`;
  if (endLabel) return `To ${endLabel}`;
  if (startLabel) return `From ${startLabel}`;
  return "Route not recorded";
}

export function chipLabel(chip: SyncChip): string {
  switch (chip) {
    case "synced":
      return "Synced";
    case "saving":
      return "Saving";
    case "waiting":
      return "Waiting for signal";
    case "failed":
      return "Needs attention";
  }
}

/** The footer under the card. Unsorted first; else a possible missed drive. */
export function lastTripFooter(args: {
  unsortedCount: number | null;
  missedCount: number | null;
  /** The card above is itself unsorted, so it is not one of the "more". */
  shownTripUnsorted: boolean;
}): LastTripFooter {
  const unsorted = args.unsortedCount ?? 0;
  const more = args.shownTripUnsorted ? unsorted - 1 : unsorted;
  if (more >= 1) {
    const word = more === 1 ? "trip" : "trips";
    return {
      kind: "unsorted",
      text: args.shownTripUnsorted ? `${more} more ${word} to sort` : `${more} ${word} to sort`,
    };
  }
  const missed = args.missedCount ?? 0;
  if (missed >= 1) {
    return {
      kind: "missed",
      text: missed === 1 ? "We may have missed a drive" : `We may have missed ${missed} drives`,
    };
  }
  return null;
}

export function selectLastTrip(i: LastTripInputs): LastTripView {
  if (!i.trip) {
    return i.totalTrips === 0 ? { look: "first" } : { look: "none" };
  }
  const t = i.trip;
  const unsorted = t.classification === "unclassified";
  const recent = i.now - new Date(t.endedAt ?? t.startedAt).getTime() < RECENT_TRIP_MS;
  const workChoice = i.mode === "work" && !i.personalOnlyDriver;
  // Offered when it is unsorted, or for a just-finished trip a Work driver may
  // want to change. Personal mode and Personal-only drivers only when unsorted.
  const showChoice = unsorted || (recent && workChoice);
  const look: "full" | "compact" = showChoice ? "full" : "compact";

  const when = whenLabel(t.startedAt, t.endedAt, i.now);
  const miles = milesText(t.distanceMiles);
  const route = routeText(t.startLabel, t.endLabel);
  const footer = lastTripFooter({
    unsortedCount: i.unsortedCount,
    missedCount: i.missedCount,
    shownTripUnsorted: unsorted,
  });
  const choiceText = unsorted ? "not sorted yet" : t.classification;

  return {
    look,
    eyebrow: `${when}\u00a0· ${miles}`,
    route,
    choice: t.classification,
    showChoice,
    showAutoTag: !unsorted && t.autoSorted,
    chip: t.sync,
    chipText: chipLabel(t.sync),
    shiftChip: t.isShiftTrip,
    trip: t,
    footer,
    a11yLabel: `Last trip. ${when}, ${miles}. ${route}. ${choiceText}. ${chipLabel(t.sync)}.`,
  };
}
