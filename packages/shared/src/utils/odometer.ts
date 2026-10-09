/**
 * Running odometer (9 Oct 2026).
 *
 * A driver types the number on their dashboard once. From then on the car's
 * odometer is worked out as that reading plus the miles of every trip since,
 * and each day gets an opening and a closing figure for employer mileage
 * forms. Nothing is stored per day: the API loads a vehicle's trips and
 * readings and calls buildOdometerTimeline on every read, so editing or
 * deleting a trip updates every figure by itself.
 *
 * Real readings ("anchors") come from three places: readings the driver
 * typed, a trip's own odometerStart / odometerEnd, and fuel logs. Typed
 * readings are trusted (the API checks them on entry). Trip and fuel
 * readings pass a sanity check, because a typo there must not drag every
 * later figure with it.
 *
 * Pure: no database, no clock, no server time zone. Days are Europe/London
 * calendar days, worked out with Intl.
 */

export type OdometerAnchorSource = "user" | "trip" | "fuel";

export interface OdometerTripInput {
  id: string;
  startedAt: Date | string;
  distanceMiles: number;
  classification: string;
  odometerStart?: number | null;
  odometerEnd?: number | null;
}

/** A real reading that is not on a trip: typed in by the driver, or a fuel log. */
export interface OdometerAnchorInput {
  id: string;
  at: Date | string;
  readingMiles: number;
  source: "user" | "fuel";
  /** Breaks ties between readings at the same instant: the later one wins. */
  createdAt?: Date | string;
}

export interface BuildOdometerTimelineInput {
  /** Completed trips in this vehicle, in any order. */
  trips: OdometerTripInput[];
  /** Typed readings and fuel-log readings for this vehicle, in any order. */
  anchors: OdometerAnchorInput[];
  /** Defaults to Europe/London. */
  timeZone?: string;
}

export interface OdometerAnchorEvent {
  kind: "anchor";
  /** Unique within the timeline. */
  key: string;
  /** The typed reading's id, or "trip-<tripId>-start|end", or the fuel log id. */
  id: string;
  /** The row the reading came from: reading id, trip id or fuel log id. */
  sourceId: string;
  source: OdometerAnchorSource;
  /** Milliseconds since the epoch. */
  at: number;
  readingMiles: number;
  accepted: boolean;
  rejectReason: string | null;
  /** reading minus the running estimate just before it; 0 when rejected or first. */
  gap: number;
  estBefore: number | null;
  estAfter: number | null;
  recordedBefore: boolean;
  recordedAfter: boolean;
}

export interface OdometerTripEvent {
  kind: "trip";
  key: string;
  id: string;
  at: number;
  distanceMiles: number;
  classification: string;
  /** Running odometer at the start of the trip; null before the first reading. */
  odoStart: number | null;
  odoEnd: number | null;
  /** An accepted reading sits directly before the trip. */
  startRecorded: boolean;
  /** An accepted reading sits directly after the trip. */
  endRecorded: boolean;
  estBefore: number | null;
  estAfter: number | null;
  recordedBefore: boolean;
  recordedAfter: boolean;
}

export type OdometerEvent = OdometerAnchorEvent | OdometerTripEvent;

export interface OdometerReadingEntry {
  id: string;
  readingMiles: number;
  /** ISO 8601. */
  readAt: string;
  source: OdometerAnchorSource;
  sourceId: string;
  used: boolean;
  rejectReason: string | null;
}

export interface OdometerCurrent {
  miles: number;
  /** True when trips have been added since the last real reading. */
  isEstimated: boolean;
  basis: {
    readingMiles: number;
    /** ISO 8601. */
    readAt: string;
    source: OdometerAnchorSource;
    sourceId: string;
  };
  tripMilesSince: number;
}

export interface OdometerTimeline {
  timeZone: string;
  events: OdometerEvent[];
  /** Null until there is an accepted real reading. */
  current: OdometerCurrent | null;
  /** Every real reading, newest first, with whether it was used. */
  readings: OdometerReadingEntry[];
}

/** One calendar day of one vehicle. Figures keep full precision. */
export interface OdometerDay {
  /** YYYY-MM-DD, Europe/London. */
  date: string;
  /** Null = "No reading yet". */
  opening: number | null;
  openingRecorded: boolean;
  closing: number | null;
  closingRecorded: boolean;
  businessMiles: number;
  personalMiles: number;
  /** Unclassified (and anything else that is not business or personal). */
  notSortedMiles: number;
  tripCount: number;
  /** Sum of the gaps of accepted readings on this day: reading minus what the trips said. */
  difference: number;
  /**
   * The part of `difference` that moved the opening figure itself: set when
   * the day's first event is a reading. closing - opening =
   * business + personal + notSorted + difference - openingDifference.
   */
  openingDifference: number;
}

/** `odometerDays` output as the API returns it, with the vehicle added. */
export interface OdometerDayWithVehicle extends OdometerDay {
  vehicleId: string;
}

// -- API response shapes (GET /vehicles/:id/odometer etc.) --------------

export interface VehicleOdometerResponse {
  current: OdometerCurrent | null;
  readings: OdometerReadingEntry[];
}

export interface OdometerReadingCreated {
  reading: {
    id: string;
    vehicleId: string;
    readingMiles: number;
    readAt: string;
    source: string;
  };
  /** The running figure at the moment of the reading, before it was saved; null when none. */
  estimatedMiles: number | null;
  current: OdometerCurrent | null;
}

export interface OdometerLowerThanEarlier {
  code: "LOWER_THAN_EARLIER";
  error: string;
  earlier: OdometerReadingEntry;
}

export interface OdometerListSummary {
  miles: number;
  isEstimated: boolean;
}

export const ODOMETER_MAX_MILES = 999999;
/** A trip or fuel reading further than this from the running figure is not used. */
export const ODOMETER_MAX_JUMP_MILES = 5000;
export const ODOMETER_TIME_ZONE = "Europe/London";

// -- helpers --------------------------------------------------------------

function toMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date (YYYY-MM-DD) of an instant in the given time zone. */
export function odometerDateKey(ms: number, timeZone: string = ODOMETER_TIME_ZONE): string {
  let fmt = dayFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, fmt);
  }
  let y = "";
  let m = "";
  let d = "";
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type === "year") y = part.value;
    else if (part.type === "month") m = part.value;
    else if (part.type === "day") d = part.value;
  }
  return `${y}-${m}-${d}`;
}

const reasonDateFormatters = new Map<string, Intl.DateTimeFormat>();

function reasonDate(ms: number, timeZone: string): string {
  let fmt = reasonDateFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    reasonDateFormatters.set(timeZone, fmt);
  }
  // Some ICU versions say "Sept"; the app says "Sep" everywhere.
  return fmt.format(new Date(ms)).replace("Sept", "Sep");
}

function wholeMiles(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

function validReading(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

// Sort ranks at the same instant: a reading before the trip it precedes, a
// trip, then that trip's own odometerEnd.
const RANK_ANCHOR = 0;
const RANK_TRIP = 1;
const RANK_TRIP_END = 2;

interface RawEvent {
  at: number;
  rank: number;
  createdAt: number;
  id: string;
  trip?: OdometerTripInput;
  anchor?: {
    key: string;
    id: string;
    sourceId: string;
    source: OdometerAnchorSource;
    readingMiles: number;
  };
}

/**
 * Walk a vehicle's trips and real readings in time order and work out the
 * running odometer at every point.
 */
export function buildOdometerTimeline(input: BuildOdometerTimelineInput): OdometerTimeline {
  const timeZone = input.timeZone ?? ODOMETER_TIME_ZONE;
  const raw: RawEvent[] = [];

  for (const t of input.trips) {
    const at = toMs(t.startedAt);
    if (!Number.isFinite(at)) continue;
    const distance = Number.isFinite(t.distanceMiles) ? t.distanceMiles : 0;
    raw.push({ at, rank: RANK_TRIP, createdAt: 0, id: t.id, trip: { ...t, distanceMiles: distance } });
    if (validReading(t.odometerStart)) {
      raw.push({
        at,
        rank: RANK_ANCHOR,
        createdAt: 0,
        id: t.id,
        anchor: {
          key: `trip-${t.id}-start`,
          id: `trip-${t.id}-start`,
          sourceId: t.id,
          source: "trip",
          readingMiles: t.odometerStart,
        },
      });
    }
    if (validReading(t.odometerEnd)) {
      raw.push({
        at,
        rank: RANK_TRIP_END,
        createdAt: 0,
        id: t.id,
        anchor: {
          key: `trip-${t.id}-end`,
          id: `trip-${t.id}-end`,
          sourceId: t.id,
          source: "trip",
          readingMiles: t.odometerEnd,
        },
      });
    }
  }

  for (const a of input.anchors) {
    const at = toMs(a.at);
    if (!Number.isFinite(at) || !validReading(a.readingMiles)) continue;
    raw.push({
      at,
      rank: RANK_ANCHOR,
      createdAt: a.createdAt ? toMs(a.createdAt) || 0 : 0,
      id: a.id,
      anchor: {
        key: `${a.source}-${a.id}`,
        id: a.id,
        sourceId: a.id,
        source: a.source,
        readingMiles: a.readingMiles,
      },
    });
  }

  raw.sort((x, y) => {
    if (x.at !== y.at) return x.at - y.at;
    if (x.rank !== y.rank) return x.rank - y.rank;
    if (x.createdAt !== y.createdAt) return x.createdAt - y.createdAt;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });

  const events: OdometerEvent[] = [];
  let est: number | null = null;
  let last: { reading: number; at: number; source: OdometerAnchorSource; sourceId: string } | null = null;
  let tripsSince = 0;
  let tripMilesSince = 0;

  for (const r of raw) {
    const estBefore = est;
    const recordedBefore = est !== null && tripsSince === 0;

    if (r.anchor) {
      const a = r.anchor;
      let accepted = true;
      let rejectReason: string | null = null;
      let gap = 0;

      if (est === null) {
        accepted = true;
      } else if (a.source === "user") {
        gap = a.readingMiles - est;
      } else if (last && a.readingMiles < last.reading) {
        accepted = false;
        rejectReason = `Lower than your reading of ${wholeMiles(last.reading)} on ${reasonDate(last.at, timeZone)}`;
      } else if (Math.abs(a.readingMiles - est) > ODOMETER_MAX_JUMP_MILES) {
        accepted = false;
        rejectReason = "Too far from your other readings";
      } else {
        gap = a.readingMiles - est;
      }

      if (accepted) {
        est = a.readingMiles;
        last = { reading: a.readingMiles, at: r.at, source: a.source, sourceId: a.sourceId };
        tripsSince = 0;
        tripMilesSince = 0;
      }

      events.push({
        kind: "anchor",
        key: a.key,
        id: a.id,
        sourceId: a.sourceId,
        source: a.source,
        at: r.at,
        readingMiles: a.readingMiles,
        accepted,
        rejectReason,
        gap,
        estBefore,
        estAfter: est,
        recordedBefore,
        recordedAfter: est !== null && tripsSince === 0,
      });
    } else if (r.trip) {
      const t = r.trip;
      const odoStart = est;
      if (est !== null) est = est + t.distanceMiles;
      tripsSince += 1;
      tripMilesSince += t.distanceMiles;
      events.push({
        kind: "trip",
        key: `trip-${t.id}`,
        id: t.id,
        at: r.at,
        distanceMiles: t.distanceMiles,
        classification: t.classification,
        odoStart,
        odoEnd: est,
        startRecorded: recordedBefore,
        endRecorded: false,
        estBefore,
        estAfter: est,
        recordedBefore,
        recordedAfter: false,
      });
    }
  }

  // A trip's end is recorded when the next event that counts is an accepted
  // reading. Rejected readings are ignored: they changed nothing.
  let nextCounted: OdometerEvent | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.kind === "anchor" && !ev.accepted) continue;
    if (ev.kind === "trip") {
      ev.endRecorded = nextCounted !== null && nextCounted.kind === "anchor";
    }
    nextCounted = ev;
  }

  const readings: OdometerReadingEntry[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.kind !== "anchor") continue;
    readings.push({
      id: ev.id,
      readingMiles: ev.readingMiles,
      readAt: new Date(ev.at).toISOString(),
      source: ev.source,
      sourceId: ev.sourceId,
      used: ev.accepted,
      rejectReason: ev.rejectReason,
    });
  }

  const current: OdometerCurrent | null =
    last && est !== null
      ? {
          miles: est,
          isEstimated: tripsSince > 0,
          basis: {
            readingMiles: last.reading,
            readAt: new Date(last.at).toISOString(),
            source: last.source,
            sourceId: last.sourceId,
          },
          tripMilesSince,
        }
      : null;

  return { timeZone, events, current, readings };
}

/**
 * What the timeline says at an instant: the running figure after every event
 * at or before it, and the latest accepted reading at or before it. Used to
 * check a new typed reading ("lower than an earlier reading") and to tell the
 * driver how far it is from their trips.
 */
export function odometerStateAt(
  timeline: OdometerTimeline,
  at: Date | string
): { estimate: number | null; latestReading: OdometerReadingEntry | null } {
  const ms = toMs(at);
  let estimate: number | null = null;
  let latest: OdometerAnchorEvent | null = null;
  for (const ev of timeline.events) {
    if (ev.at > ms) break;
    if (ev.kind === "anchor") {
      if (!ev.accepted) continue;
      latest = ev;
    }
    estimate = ev.estAfter;
  }
  return {
    estimate,
    latestReading: latest
      ? {
          id: latest.id,
          readingMiles: latest.readingMiles,
          readAt: new Date(latest.at).toISOString(),
          source: latest.source,
          sourceId: latest.sourceId,
          used: true,
          rejectReason: null,
        }
      : null,
  };
}

function tidy(n: number): number {
  // Strip floating-point dust (a +8 difference must not read -0.0000001).
  const r = Math.round(n * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

/**
 * One OdometerDay per London calendar date on which the vehicle had a trip
 * or an accepted real reading, oldest first, limited to [from, to] (YYYY-MM-DD,
 * inclusive). The figures do not depend on the range asked for.
 */
export function odometerDays(timeline: OdometerTimeline, from: string, to: string): OdometerDay[] {
  const byDate = new Map<string, OdometerEvent[]>();
  for (const ev of timeline.events) {
    if (ev.kind === "anchor" && !ev.accepted) continue;
    const key = odometerDateKey(ev.at, timeline.timeZone);
    const list = byDate.get(key);
    if (list) list.push(ev);
    else byDate.set(key, [ev]);
  }

  // Days are listed only when the vehicle drove. Readings on a day without
  // a trip are not a card of their own: their gaps carry into the next
  // listed day, and into its openingDifference when they moved its opening.
  const days: OdometerDay[] = [];
  let pendingGap = 0;
  const dates = [...byDate.keys()].sort();
  for (const date of dates) {
    const evs = byDate.get(date)!;
    if (!evs.some((e) => e.kind === "trip")) {
      for (const ev of evs) if (ev.kind === "anchor") pendingGap += ev.gap;
      continue;
    }
    const carried = pendingGap;
    pendingGap = 0;
    const first = evs[0];
    const lastEv = evs[evs.length - 1];

    let opening: number | null;
    let openingRecorded: boolean;
    let openingDifference = carried;
    if (first.kind === "anchor") {
      opening = first.readingMiles;
      openingRecorded = true;
      openingDifference += first.gap;
    } else {
      opening = first.estBefore;
      openingRecorded = opening !== null && first.recordedBefore;
    }

    const closing = lastEv.estAfter;
    const closingRecorded = closing !== null && lastEv.kind === "anchor";

    let business = 0;
    let personal = 0;
    let notSorted = 0;
    let tripCount = 0;
    let difference = carried;
    for (const ev of evs) {
      if (ev.kind === "trip") {
        tripCount += 1;
        if (ev.classification === "business") business += ev.distanceMiles;
        else if (ev.classification === "personal") personal += ev.distanceMiles;
        else notSorted += ev.distanceMiles;
      } else {
        difference += ev.gap;
      }
    }

    if (date >= from && date <= to) {
      days.push({
        date,
        opening,
        openingRecorded,
        closing,
        closingRecorded,
        businessMiles: business,
        personalMiles: personal,
        notSortedMiles: notSorted,
        tripCount,
        difference: tidy(difference),
        openingDifference: tidy(openingDifference),
      });
    }
  }

  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}
