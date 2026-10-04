// Ticket defender (Pro, Oct 2026): pure logic.
//
// (A) A driver gets a penalty notice weeks after the fact (bus lane, parking,
// moving traffic, Clean Air Zone). They give the date and time on the notice,
// and optionally where. These helpers pick out what MileClear recorded around
// that moment: the breadcrumb nearest the time, the breadcrumb nearest the
// place, speeds, GPS accuracy and gaps in recording, and turn it into plain
// sentences. They never say the record proves anything: MileClear only knows
// where the PHONE was.
//
// (B) Clean Air Zone pay-by deadlines, per zone, from each zone's own rules
// (checked 4 Oct 2026, sources on each rule). A zone without a verified rule
// gets null, and the app says "check the zone's website".
//
// No I/O here; the API does the database and geocoding.

import { CLEAN_AIR_ZONES } from "./cleanAirZone.js";

// ── Types ────────────────────────────────────────────────────────────────

/** One recorded GPS breadcrumb. */
export interface TdPoint {
  tripId: string;
  lat: number;
  lng: number;
  /** Metres per second as the phone reported it, or null. */
  speed: number | null;
  /** Horizontal accuracy in metres as the phone reported it, or null. */
  accuracy: number | null;
  /** ISO instant. */
  recordedAt: string;
}

export type TicketNoticeType = "bus_lane" | "parking" | "moving_traffic" | "clean_air_zone" | "other";

export const TICKET_NOTICE_TYPES: { value: TicketNoticeType; label: string }[] = [
  { value: "bus_lane", label: "Bus lane" },
  { value: "parking", label: "Parking" },
  { value: "moving_traffic", label: "Moving traffic (box junction, banned turn)" },
  { value: "clean_air_zone", label: "Clean Air Zone or ULEZ" },
  { value: "other", label: "Something else" },
];

export interface TdPointView extends TdPoint {
  /** Best speed estimate in mph, or null. */
  speedMph: number | null;
  /** Metres from the notice location, when one was given. */
  distanceFromNoticeMetres: number | null;
}

export interface TdTripView {
  id: string;
  startedAt: string;
  endedAt: string | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  isManualEntry: boolean;
  /** Breadcrumbs inside the lookup window. */
  pointsInWindow: number;
  vehicleLabel: string | null;
}

export interface TdGap {
  tripId: string;
  from: string;
  to: string;
  minutes: number;
}

export interface TicketDefenderLookup {
  /** The time on the notice, ISO. */
  at: string;
  windowMinutes: number;
  status: "recorded" | "manual_only" | "nothing_recorded";
  location: { lat: number; lng: number; label: string | null; source: "map" | "postcode" } | null;
  vehicle: { id: string; label: string; registration: string | null } | null;
  trips: TdTripView[];
  nearestInTime: (TdPointView & { offsetSeconds: number; address: string | null }) | null;
  nearestToLocation: (TdPointView & { offsetSeconds: number; address: string | null }) | null;
  gaps: TdGap[];
  accuracy: { medianMetres: number | null; worstMetres: number | null };
  /** Up to ~30 rows around the time, for the table. */
  rows: TdPointView[];
  /** Last recording before the window and first after it, when the window is empty. */
  before: string | null;
  after: string | null;
  summary: string[];
  caveats: string[];
}

// ── Geometry ─────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;
const MPS_TO_MPH = 2.236936;

export function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ms = (iso: string) => new Date(iso).getTime();

/** Sort a copy by time. */
export function sortPoints<T extends TdPoint>(points: T[]): T[] {
  return [...points].sort((a, b) => ms(a.recordedAt) - ms(b.recordedAt));
}

/** Points within ±minutes of `atMs`. Input need not be sorted; output is. */
export function windowPoints<T extends TdPoint>(points: T[], atMs: number, minutes: number): T[] {
  const lo = atMs - minutes * 60_000;
  const hi = atMs + minutes * 60_000;
  return sortPoints(points.filter((p) => {
    const t = ms(p.recordedAt);
    return t >= lo && t <= hi;
  }));
}

/**
 * Speed at point i in mph. The phone's own reading when it gave one (it is
 * Doppler-based and better than anything derived); otherwise worked out from
 * the neighbouring points of the same trip, when they are close in time.
 */
export function speedMphAt(points: TdPoint[], i: number): number | null {
  const p = points[i];
  if (!p) return null;
  if (p.speed != null && Number.isFinite(p.speed) && p.speed >= 0) return p.speed * MPS_TO_MPH;
  const neighbour = (j: number) => {
    const q = points[j];
    if (!q || q.tripId !== p.tripId) return null;
    const dt = Math.abs(ms(q.recordedAt) - ms(p.recordedAt)) / 1000;
    if (dt <= 0 || dt > 90) return null;
    return (metresBetween(p.lat, p.lng, q.lat, q.lng) / dt) * MPS_TO_MPH;
  };
  const prev = neighbour(i - 1);
  const next = neighbour(i + 1);
  if (prev != null && next != null) return (prev + next) / 2;
  return prev ?? next;
}

/** The point closest in time to `atMs`. Points must be sorted. */
export function nearestInTime(points: TdPoint[], atMs: number): { index: number; offsetSeconds: number } | null {
  if (points.length === 0) return null;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < points.length; i++) {
    const diff = Math.abs(ms(points[i].recordedAt) - atMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return { index: best, offsetSeconds: Math.round((ms(points[best].recordedAt) - atMs) / 1000) };
}

/** The point closest to a location. */
export function nearestToLocation(points: TdPoint[], lat: number, lng: number): { index: number; distanceMetres: number } | null {
  if (points.length === 0) return null;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = metresBetween(points[i].lat, points[i].lng, lat, lng);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, distanceMetres: bestD };
}

/**
 * Gaps in recording DURING a trip: consecutive breadcrumbs of the same trip
 * more than `minGapSeconds` apart. Time between two trips is not a gap (the
 * car was most likely parked), so it is not reported here. Points sorted.
 */
export function findRecordingGaps(points: TdPoint[], minGapSeconds = 180): TdGap[] {
  const gaps: TdGap[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.tripId !== b.tripId) continue;
    const secs = (ms(b.recordedAt) - ms(a.recordedAt)) / 1000;
    if (secs > minGapSeconds) {
      gaps.push({ tripId: a.tripId, from: a.recordedAt, to: b.recordedAt, minutes: Math.round(secs / 60) });
    }
  }
  return gaps;
}

export function accuracyStats(points: TdPoint[]): { medianMetres: number | null; worstMetres: number | null } {
  const acc = points.map((p) => p.accuracy).filter((a): a is number => a != null && Number.isFinite(a) && a >= 0).sort((a, b) => a - b);
  if (acc.length === 0) return { medianMetres: null, worstMetres: null };
  const mid = Math.floor(acc.length / 2);
  const median = acc.length % 2 ? acc[mid] : (acc[mid - 1] + acc[mid]) / 2;
  return { medianMetres: Math.round(median), worstMetres: Math.round(acc[acc.length - 1]) };
}

/**
 * Up to `max` row indices for the table: evenly spread, always including the
 * `mustInclude` indices (the points nearest the time and the place). Sorted,
 * no duplicates.
 */
export function sampleIndices(length: number, max: number, mustInclude: number[] = []): number[] {
  const keep = new Set<number>(mustInclude.filter((i) => i >= 0 && i < length));
  if (length <= max) return Array.from({ length }, (_, i) => i);
  const slots = Math.max(max - keep.size, 2);
  for (let k = 0; k < slots; k++) keep.add(Math.round((k * (length - 1)) / (slots - 1)));
  return [...keep].sort((a, b) => a - b);
}

/** The table rows: points within ±rowMinutes of the time, sampled to `max`. */
export function tableRows(
  points: TdPoint[],
  atMs: number,
  opts: { rowMinutes?: number; max?: number; noticeLat?: number | null; noticeLng?: number | null; mustIncludeTimes?: string[] } = {}
): TdPointView[] {
  const rowMinutes = opts.rowMinutes ?? 15;
  const max = opts.max ?? 30;
  const near = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Math.abs(ms(p.recordedAt) - atMs) <= rowMinutes * 60_000);
  const must = (opts.mustIncludeTimes ?? [])
    .map((t) => near.findIndex(({ p }) => p.recordedAt === t))
    .filter((i) => i >= 0);
  return sampleIndices(near.length, max, must).map((k) => toView(points, near[k].i, opts.noticeLat, opts.noticeLng));
}

export function toView(points: TdPoint[], i: number, noticeLat?: number | null, noticeLng?: number | null): TdPointView {
  const p = points[i];
  return {
    ...p,
    speedMph: roundOrNull(speedMphAt(points, i)),
    distanceFromNoticeMetres:
      noticeLat != null && noticeLng != null ? Math.round(metresBetween(p.lat, p.lng, noticeLat, noticeLng)) : null,
  };
}

function roundOrNull(n: number | null): number | null {
  return n == null ? null : Math.round(n);
}

// ── Plain words ──────────────────────────────────────────────────────────

const UK_TZ = "Europe/London";

/** "14:32" UK time. */
export function ukTime(iso: string | Date, withSeconds = false): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
    timeZone: UK_TZ,
  }).format(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue 15 Sep 2026" UK date. Fixed names: ICU writes "Sept" for en-GB. */
export function ukDate(iso: string | Date, withYear = true): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = londonParts(d.getTime());
  const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  return `${weekday} ${p.day} ${MONTHS[p.month - 1]}${withYear ? ` ${p.year}` : ""}`;
}

/** "about 40 metres" under a tenth of a mile, otherwise "1.2 miles". */
export function describeDistance(metres: number): string {
  if (metres < 161) return `about ${Math.max(10, Math.round(metres / 10) * 10)} metres`;
  const miles = metres / 1609.344;
  return `${miles.toFixed(1)} miles`;
}

/** "at that time", "3 minutes before that", "1 hour 5 minutes after that". */
export function describeOffset(offsetSeconds: number): string {
  const abs = Math.abs(offsetSeconds);
  if (abs < 60) return "at that time";
  const mins = Math.round(abs / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return `${parts.join(" ")} ${offsetSeconds < 0 ? "before" : "after"} that`;
}

export interface SummaryInput {
  at: string;
  status: TicketDefenderLookup["status"];
  vehicleLabel: string | null;
  nearestInTime: TicketDefenderLookup["nearestInTime"];
  nearestToLocation: TicketDefenderLookup["nearestToLocation"];
  hasLocation: boolean;
  gaps: TdGap[];
  accuracy: TicketDefenderLookup["accuracy"];
  before: string | null;
  after: string | null;
  manualTrips: number;
}

/** The plain-word summary. Never claims anything is proved. */
export function buildLookupSummary(s: SummaryInput): string[] {
  const out: string[] = [];
  const atLabel = `${ukTime(s.at)} on ${ukDate(s.at, false)}`;
  const vehicle = s.vehicleLabel ? `your ${s.vehicleLabel}` : "your phone";

  if (s.status === "nothing_recorded") {
    out.push(`MileClear has no recorded journey within an hour either side of ${atLabel}.`);
    if (s.before) out.push(`The last recording before that ended at ${ukTime(s.before)} on ${ukDate(s.before, false)}.`);
    if (s.after) out.push(`The next recording started at ${ukTime(s.after)} on ${ukDate(s.after, false)}.`);
    out.push("No recording does not show where the vehicle was. Tracking can be off, paused or stopped by the phone.");
    return out;
  }

  if (s.status === "manual_only") {
    out.push(
      `The only journey MileClear has around ${atLabel} was entered by hand, so there are no GPS points for that time.`
    );
    return out;
  }

  const n = s.nearestInTime;
  if (n) {
    const when = Math.abs(n.offsetSeconds) < 60 ? atLabel : `${ukTime(n.recordedAt)} on ${ukDate(n.recordedAt, false)}`;
    const where = n.address ? ` near ${n.address}` : "";
    const fromNotice =
      s.hasLocation && n.distanceFromNoticeMetres != null
        ? `, ${describeDistance(n.distanceFromNoticeMetres)} from the location on the notice`
        : "";
    const speed =
      n.speedMph == null ? "" : n.speedMph < 3 ? ", stationary or barely moving" : `, moving at about ${n.speedMph} mph`;
    if (Math.abs(n.offsetSeconds) >= 60) {
      out.push(`The closest recorded moment to ${atLabel} was ${describeOffset(n.offsetSeconds).replace(" that", "")}.`);
    }
    out.push(`At ${when} MileClear recorded ${vehicle}${where}${fromNotice}${speed}.`);
  }

  const l = s.nearestToLocation;
  if (s.hasLocation && l && (!n || l.recordedAt !== n.recordedAt)) {
    out.push(
      `The closest MileClear came to the location on the notice was ${describeDistance(l.distanceFromNoticeMetres ?? 0)}, at ${ukTime(l.recordedAt)} (${describeOffset(l.offsetSeconds).replace("that", "the time on the notice")}).`
    );
  }

  if (s.accuracy.medianMetres != null) {
    out.push(
      `GPS accuracy around that time was about ${s.accuracy.medianMetres} metres` +
        (s.accuracy.worstMetres != null && s.accuracy.worstMetres > s.accuracy.medianMetres * 2
          ? `, and as poor as ${s.accuracy.worstMetres} metres at times.`
          : ".")
    );
  }

  for (const g of s.gaps.slice(0, 3)) {
    out.push(`There was a ${g.minutes}-minute gap in recording between ${ukTime(g.from)} and ${ukTime(g.to)}.`);
  }
  if (s.gaps.length > 3) out.push(`There were ${s.gaps.length - 3} more gaps in recording in that window.`);
  return out;
}

export const TICKET_DEFENDER_CAVEATS: readonly string[] = [
  "MileClear only knows where your phone was. If the phone was in another vehicle, or someone else was driving, this record will not show that.",
  "Phone GPS can be out by tens of metres, more in town centres and under bridges.",
  "This is a record of what MileClear recorded. It is not legal advice and does not decide whether a penalty is valid.",
];

// ── Track drawing (for the PDF) ──────────────────────────────────────────

/** Nice scale-bar lengths in metres. */
const SCALE_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

/** The longest nice length that fits in `maxMetres`, with its label. */
export function chooseScaleBar(maxMetres: number): { metres: number; label: string } {
  let pick = SCALE_STEPS[0];
  for (const s of SCALE_STEPS) if (s <= maxMetres) pick = s;
  return { metres: pick, label: pick >= 1000 ? `${pick / 1000} km` : `${pick} m` };
}

export interface TrackProjection {
  /** Metres per drawing unit. */
  metresPerUnit: number;
  toXY: (lat: number, lng: number) => { x: number; y: number };
}

/**
 * Fit points into a width x height box (y down, north up) with an
 * equirectangular projection about their centre: plenty for a few miles.
 */
export function projectTrack(
  pts: { lat: number; lng: number }[],
  width: number,
  height: number,
  padding = 16
): TrackProjection | null {
  if (pts.length === 0) return null;
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * mPerDegLng);
  const ys = pts.map((p) => p.lat * mPerDegLat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  // At least 200 m across, so a parked car still draws at a sensible scale.
  const spanX = Math.max(maxX - minX, 200);
  const spanY = Math.max(maxY - minY, 200);
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const metresPerUnit = Math.max(spanX / usableW, spanY / usableH);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    metresPerUnit,
    toXY: (lat, lng) => ({
      x: width / 2 + (lng * mPerDegLng - cx) / metresPerUnit,
      y: height / 2 - (lat * mPerDegLat - cy) / metresPerUnit,
    }),
  };
}

// ── Clean Air Zone pay-by deadlines ──────────────────────────────────────

export interface CazPayRule {
  /** Pay by the end of this many days after the day of travel. */
  daysAfter: number;
  /** Plain wording of the rule. */
  ruleText: string;
  /** Official payment page. */
  payUrl: string;
  /** Where the rule was checked. */
  sourceUrl: string;
}

const GOV_CAZ_PAY = "https://www.gov.uk/clean-air-zones";
const GOV_CAZ_RULE = "https://www.gov.uk/guidance/driving-in-a-clean-air-zone";
const SIX_DAYS = "Pay by 11:59pm on the sixth day after you drove in the zone.";

/**
 * Verified 4 Oct 2026. London: TfL "You can pay by midnight on the third day
 * following the journey" (tfl.gov.uk/modes/driving/ultra-low-emission-zone/ulez-payments).
 * The English CAZs: GOV.UK "You must pay the charge by 11:59pm on the sixth
 * day after driving into the zone" for all seven, confirmed on Bristol, Bath,
 * Bradford, Sheffield and Newcastle/Gateshead's own pages (Birmingham's site
 * blocks automated reads; its published wording matches). Payment goes
 * through GOV.UK for every English CAZ.
 */
export const CAZ_PAY_RULES: Record<string, CazPayRule> = {
  "london-ulez": {
    daysAfter: 3,
    ruleText: "Pay by midnight on the third day after you drove in the zone.",
    payUrl: "https://tfl.gov.uk/modes/driving/pay-to-drive-in-london",
    sourceUrl: "https://tfl.gov.uk/modes/driving/ultra-low-emission-zone/ulez-payments",
  },
  birmingham: { daysAfter: 6, ruleText: SIX_DAYS, payUrl: GOV_CAZ_PAY, sourceUrl: GOV_CAZ_RULE },
  bristol: {
    daysAfter: 6,
    ruleText: SIX_DAYS,
    payUrl: GOV_CAZ_PAY,
    sourceUrl: "https://www.bristol.gov.uk/residents/streets-travel/bristols-caz/pay-the-bristol-clean-air-zone-daily-charge",
  },
  bath: { daysAfter: 6, ruleText: SIX_DAYS, payUrl: GOV_CAZ_PAY, sourceUrl: "https://www.bathnes.gov.uk/check-your-vehicle-and-pay-charge" },
  bradford: {
    daysAfter: 6,
    ruleText: SIX_DAYS,
    payUrl: GOV_CAZ_PAY,
    sourceUrl: "https://www.bradford.gov.uk/clean-air-zone/payments-and-charges/how-to-pay-the-daily-caz-charge/",
  },
  sheffield: {
    daysAfter: 6,
    ruleText: SIX_DAYS,
    payUrl: GOV_CAZ_PAY,
    sourceUrl: "https://www.sheffield.gov.uk/clean-air-zone-sheffield/clean-air-zone-charges-and-how-pay",
  },
  tyneside: { daysAfter: 6, ruleText: SIX_DAYS, payUrl: GOV_CAZ_PAY, sourceUrl: "https://www.breathe-cleanair.com/how-to-pay-a-caz-charge" },
  portsmouth: { daysAfter: 6, ruleText: SIX_DAYS, payUrl: GOV_CAZ_PAY, sourceUrl: GOV_CAZ_RULE },
};

interface LondonParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function londonParts(instantMs: number): LondonParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: UK_TZ,
  }).formatToParts(new Date(instantMs));
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** UK calendar day "YYYY-MM-DD" of an instant. */
export function ukDayOf(instant: Date | string): string {
  const p = londonParts(new Date(instant).getTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The instant of a UK wall-clock time. */
export function ukWallClockToDate(day: string, hour: number, minute: number, second = 0): Date {
  const [y, m, d] = day.split("-").map((n) => parseInt(n, 10));
  const wanted = Date.UTC(y, m - 1, d, hour, minute, second);
  let guess = wanted;
  for (let k = 0; k < 2; k++) {
    const p = londonParts(guess);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess = wanted - (seen - guess);
  }
  return new Date(guess);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map((x) => parseInt(x, 10));
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** False on days a zone does not charge (London ULEZ: Christmas Day). */
export function cazChargesOnDay(zoneId: string, day: string): boolean {
  if (zoneId === "london-ulez" && day.slice(5) === "12-25") return false;
  return true;
}

export interface CazDeadline {
  /** UK day the payment window closes, "YYYY-MM-DD". */
  deadlineDay: string;
  /** The last moment to pay, ISO (23:59:59 UK that day). */
  deadlineAt: string;
  ruleText: string;
  payUrl: string;
  sourceUrl: string;
}

/** The pay-by deadline for a day of travel, or null when no rule is verified. */
export function cazPayDeadline(zoneId: string, travelDay: string): CazDeadline | null {
  const rule = CAZ_PAY_RULES[zoneId];
  if (!rule) return null;
  const deadlineDay = addDays(travelDay, rule.daysAfter);
  return {
    deadlineDay,
    deadlineAt: ukWallClockToDate(deadlineDay, 23, 59, 59).toISOString(),
    ruleText: rule.ruleText,
    payUrl: rule.payUrl,
    sourceUrl: rule.sourceUrl,
  };
}

/** The zone's own info page, for "check the zone's website". */
export function cazZoneInfoUrl(zoneId: string): string | null {
  return CLEAN_AIR_ZONES.find((z) => z.id === zoneId)?.url ?? null;
}

export type CazChargeStatus = "paid" | "due" | "overdue" | "unknown_deadline";

export interface CazChargeItem {
  /** zoneId + ":" + travel day. One charge per zone per day. */
  key: string;
  zoneId: string;
  zoneName: string;
  travelDay: string;
  chargePence: number;
  tripIds: string[];
  /** Null when the zone has no verified rule: "check the zone's website". */
  deadline: CazDeadline | null;
  infoUrl: string | null;
  status: CazChargeStatus;
  paidAt: string | null;
  confidence: "confirmed" | "estimated" | "unknown";
}

export function cazChargeKey(zoneId: string, travelDay: string): string {
  return `${zoneId}:${travelDay}`;
}

export function cazChargeStatus(deadline: CazDeadline | null, paid: boolean, now: Date): CazChargeStatus {
  if (paid) return "paid";
  if (!deadline) return "unknown_deadline";
  return now.getTime() > new Date(deadline.deadlineAt).getTime() ? "overdue" : "due";
}

/** True when the deadline falls on the UK day after `now`: the evening-before reminder. */
export function cazDeadlineIsTomorrow(deadline: CazDeadline | null, now: Date): boolean {
  if (!deadline) return false;
  return deadline.deadlineDay === addDays(ukDayOf(now), 1);
}
