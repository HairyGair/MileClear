// The one live fact under each row on the More tab (Oct 2026 More redesign,
// direction A "Jobs with live sentences"). Pure and tested; the screen only
// draws them. Every builder takes null for "not loaded yet" and then returns
// the row's plain description, so a row never shows a spinner, a blank or a 0.

import { formatPence } from "@mileclear/shared";
import { shortDate, placesSummary, workHoursSummary, type SlotLike } from "../settings/summaries";
import { durationText } from "../home/statusLine";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "41,831", the same on every phone. */
function thousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "October" for the month `now` falls in. */
export function monthName(now: Date): string {
  return MONTHS_LONG[now.getMonth()];
}

export interface Line {
  text: string;
  /** "add" draws the line in amber: the one thing to add on the page. */
  tone?: "add";
}

// ── Name card ───────────────────────────────────────────────────────

export interface PlanFacts {
  isPremium: boolean;
  source?: "subscription" | "referral" | "team" | "none";
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  referralProUntil?: string | null;
}

/**
 * The plan in words under the driver's name: "Pro · renews 3 Nov",
 * "Free plan · see what Pro adds", "Company car · Acme Ltd" (team).
 * Null while nothing is known, so the card shows only the name.
 */
export function planLine(p: PlanFacts | null, args: { teamName?: string | null } = {}): string | null {
  if (args.teamName) return `Company car · ${args.teamName}`;
  if (!p) return null;
  if (!p.isPremium) return "Free plan · see what Pro adds";
  if (p.source === "team") return "Pro through your team";
  if (p.source === "referral") {
    return p.referralProUntil ? `Pro from referrals, until ${shortDate(p.referralProUntil)}` : "Pro from referrals";
  }
  if (!p.currentPeriodEnd) return "Pro";
  const date = shortDate(p.currentPeriodEnd);
  if (!date) return "Pro";
  return p.cancelAtPeriodEnd ? `Pro · ends ${date}` : `Pro · renews ${date}`;
}

// ── Your car ────────────────────────────────────────────────────────

export interface CarFacts {
  make: string;
  model: string;
  isPrimary?: boolean;
  fuelType?: string;
  motExpiryDate?: string | null;
  odometer?: { miles: number; isEstimated: boolean } | null;
}

export function mainCar<T extends CarFacts>(cars: T[] | null): T | null {
  if (!cars || cars.length === 0) return null;
  return cars.find((c) => c.isPrimary) ?? cars[0];
}

/** "Toyota Prius · MOT due 14 Mar", or the amber "Add your car". */
export function carsLine(
  cars: CarFacts[] | null,
  now: Date,
  args: { companyCar?: boolean; /** MOT dates are UK only; missing is true. */ mot?: boolean } = {}
): Line {
  const showMot = args.mot !== false;
  if (!cars) return { text: showMot ? "Your cars, MOT and tax dates" : "Your cars" };
  if (cars.length === 0) return { text: "Add your car", tone: "add" };
  const car = mainCar(cars)!;
  const name = `${car.make} ${car.model}`.trim();
  const parts = [args.companyCar ? `Company car: ${name}` : name];
  const mot = showMot && car.motExpiryDate ? new Date(car.motExpiryDate) : null;
  if (mot && !Number.isNaN(mot.getTime())) {
    parts.push(mot.getTime() < now.getTime() ? `MOT ran out ${shortDate(mot)}` : `MOT due ${shortDate(mot)}`);
  } else if (cars.length > 1) {
    parts.push(`and ${cars.length - 1} more`);
  }
  return { text: parts.join(" · ") };
}

/** "Last fill-up 3 Oct · 136.9p near you". */
export function fuelLine(args: { lastFillUpAt: string | null | undefined; cheapestPence: number | null; electric: boolean }): string {
  const bits: string[] = [];
  if (args.lastFillUpAt) {
    const d = shortDate(args.lastFillUpAt);
    if (d) bits.push(`Last fill-up ${d}`);
  }
  if (!args.electric && typeof args.cheapestPence === "number" && args.cheapestPence > 0) {
    bits.push(`${Math.round(args.cheapestPence * 10) / 10}p near you`);
  }
  if (bits.length > 0) return bits.join(" · ");
  return args.electric ? "Charging costs and chargers near you" : "Fill-ups and prices near you";
}

/** "41,831 miles now", "About 41,831 miles now", or the amber add prompt. */
export function odometerLine(cars: CarFacts[] | null): Line {
  if (!cars) return { text: "Start and end readings for each day" };
  const car = mainCar(cars);
  if (!car) return { text: "Start and end readings for each day" };
  const odo = car.odometer;
  if (!odo || !Number.isFinite(odo.miles)) return { text: "Add today's reading" };
  const figure = `${thousands(odo.miles)} miles now`;
  return { text: odo.isEstimated ? `About ${figure}` : figure };
}

export function placesLine(names: string[] | null): string {
  return placesSummary(names);
}

export interface RoadFacts {
  enabled: boolean;
  available: boolean;
  hasUsualRoads: boolean;
  current: number;
  upcoming: number;
}

/** "2 on roads you use now", "1 planned in the next week", "Nothing on your usual roads". */
export function roadLine(r: RoadFacts | null): string {
  if (!r || !r.available) return "Roadworks and closures on roads you use";
  if (!r.enabled) return "Turn on alerts for roads you use";
  if (r.current > 0) return `${r.current} on roads you use now`;
  if (r.upcoming > 0) return `${r.upcoming} planned in the next week`;
  if (!r.hasUsualRoads) return "Learning the roads you use";
  return "Nothing on your usual roads";
}

// ── Your work ───────────────────────────────────────────────────────

/** "Last shift Mon 5 Oct · 5 h 10 min". */
export function shiftsLine(last: { startedAt: string; endedAt: string | null } | null | undefined): string {
  if (last === undefined) return "Your work sessions";
  if (last === null) return "None yet. Start one from Home";
  const start = new Date(last.startedAt);
  if (Number.isNaN(start.getTime())) return "Your work sessions";
  const day = `${DAY3[start.getDay()]} ${shortDate(start)}`;
  const end = last.endedAt ? new Date(last.endedAt) : null;
  if (!end || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) return `Last shift ${day}`;
  return `Last shift ${day} · ${durationText(end.getTime() - start.getTime())}`;
}

export function workHoursLine(slots: SlotLike[] | null): string {
  return workHoursSummary(slots);
}

// ── Your money ──────────────────────────────────────────────────────

/** "£412.60 in October · 2 apps". */
export function earningsLine(m: { pence: number; platforms: number } | null, now: Date): string {
  if (!m || m.pence <= 0) return "Add what you were paid";
  const apps = m.platforms > 0 ? ` · ${plural(m.platforms, "app", "apps")}` : "";
  return `${formatPence(m.pence)} in ${monthName(now)}${apps}`;
}

/** "£36.50 in October", or the row's description. */
export function expensesLine(m: { pence: number } | null, now: Date): string {
  if (!m || m.pence <= 0) return "Parking, tolls and other costs";
  return `${formatPence(m.pence)} in ${monthName(now)}`;
}

export interface InvoiceFacts {
  total: number;
  waitingCount: number;
  waitingPence: number;
  overdueCount: number;
  overduePence: number;
}

/** "1 waiting to be paid · £120.00", "1 overdue · £80.00", "Nothing waiting to be paid". */
export function invoicesLine(f: InvoiceFacts | null): string {
  if (!f || f.total === 0) return "Bill your clients";
  if (f.overdueCount > 0) return `${f.overdueCount} overdue · ${formatPence(f.overduePence)}`;
  if (f.waitingCount > 0) return `${f.waitingCount} waiting to be paid · ${formatPence(f.waitingPence)}`;
  return "Nothing waiting to be paid";
}

export interface BankFacts {
  /** Names of linked banks (empty when none is linked). */
  banks: string[];
  /** Payments waiting in Bank payments, or null when not known. */
  toSort: number | null;
}

/** "Monzo linked · 4 payments to sort", or "Bring in your earnings automatically". */
export function bankLine(f: BankFacts | null, isPro: boolean): string {
  if (!isPro || !f || f.banks.length === 0) return "Bring in your earnings automatically";
  const name = f.banks.length === 1 ? `${f.banks[0]} linked` : `${f.banks.length} banks linked`;
  if (f.toSort == null) return name;
  if (f.toSort === 0) return `${name} · nothing to sort`;
  return `${name} · ${plural(f.toSort, "payment", "payments")} to sort`;
}

/** Where the Bank row goes: the payments once a bank is linked, else the link screen. */
export function bankRoute(f: BankFacts | null, isPro: boolean): "/inbox" | "/open-banking" {
  return isPro && f && f.banks.length > 0 ? "/inbox" : "/open-banking";
}

// ── Your progress ───────────────────────────────────────────────────

function milesFigure(miles: number): string {
  const m = Math.max(0, miles);
  return m < 100 ? String(Math.round(m * 10) / 10) : thousands(m);
}

/** "This week: 36 miles, 5 trips" (Insights' own week figures). */
export function insightsLine(week: { totalMiles: number; totalTrips: number } | null): string {
  if (!week) return "Your week, month and tax year";
  if (week.totalTrips === 0) return "Nothing this week yet";
  const miles = milesFigure(week.totalMiles);
  return `This week: ${miles} ${miles === "1" ? "mile" : "miles"}, ${plural(week.totalTrips, "trip", "trips")}`;
}

/** "12 of 37 · next: Explorer, 22 mi to go". */
export function badgesLine(
  b: { earned: number; total: number; next: { label: string; progressText: string } | null } | null
): string {
  if (!b) return "Your badges";
  const count = `${b.earned} of ${b.total}`;
  if (!b.next) return b.earned >= b.total ? `All ${b.total} earned` : count;
  if (b.earned === 0) {
    return /^Record/.test(b.next.progressText)
      ? "Record a trip for your first badge"
      : `Your first badge: ${b.next.label}, ${b.next.progressText}`;
  }
  return `${count} · next: ${b.next.label}, ${b.next.progressText}`;
}

// ── Help and settings ───────────────────────────────────────────────

/**
 * The Settings row, always calm and grey: a problem shows in the red strip
 * under the name card instead, so this row never repeats it in red.
 */
export function settingsLine(args: {
  /** The check-up has a red line (the strip is showing it). */
  problem: boolean;
  /** The recording check's own words when it is not "on" (paused, off, Low Power). */
  recordingNote: string | null;
  checking: boolean;
  pendingUploads: number;
}): string {
  if (args.problem) return "Your check-up, recording and notifications";
  if (args.checking) return "Recording, notifications and your plan";
  if (args.recordingNote) return args.recordingNote;
  if (args.pendingUploads > 0) return `Recording automatically · ${args.pendingUploads} waiting to upload`;
  return "Recording automatically · all saved";
}
