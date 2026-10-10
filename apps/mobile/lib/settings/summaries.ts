// The one-line live sentences under each row on the Settings page. Pure and
// tested; the page only draws them. Plain words from the driver's side.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Nov", the same on every phone. */
export function shortDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// ── Your car ─────────────────────────────────────────────────────────

const FUEL_LABELS: Record<string, string> = { petrol: "Petrol", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid" };

export interface CarLike {
  make: string;
  model: string;
  fuelType: string;
  vehicleType: string;
  isPrimary?: boolean;
}

export interface Summary {
  text: string;
  /** "add" draws the line as an Add action; "plain" is ordinary hint text. */
  tone: "plain" | "add";
}

/** "Toyota Prius · Hybrid · car rate", or an Add prompt when there is no car. */
export function carSummary(cars: CarLike[] | null, args: { companyCar?: boolean } = {}): Summary {
  if (!cars) return { text: "Loading...", tone: "plain" };
  if (cars.length === 0) return { text: "Add your car", tone: "add" };
  const main = cars.find((c) => c.isPrimary) ?? cars[0];
  const rate = main.vehicleType === "motorbike" ? "motorbike rate" : "car rate";
  const name = `${main.make} ${main.model}`.trim();
  const fuel = FUEL_LABELS[main.fuelType] ?? main.fuelType;
  const parts = [args.companyCar ? `Company car: ${name}` : name, fuel];
  if (!args.companyCar) parts.push(rate);
  const more = cars.length - 1;
  return { text: parts.join(" · ") + (more > 0 ? ` · and ${more} more` : ""), tone: "plain" };
}

// ── Saved places ─────────────────────────────────────────────────────

export function placesSummary(names: string[] | null): string {
  if (!names) return "Name the places your trips start and end";
  if (names.length === 0) return "None yet. Name the places you go";
  const shown = names.slice(0, 3).join(", ");
  const rest = names.length - 3;
  return `${names.length} ${names.length === 1 ? "place" : "places"}: ${shown}${rest > 0 ? ` and ${rest} more` : ""}`;
}

// ── Work hours ───────────────────────────────────────────────────────

export interface SlotLike {
  dayOfWeek: number; // 0 = Sunday
  startTime: string;
  endTime: string;
  enabled: boolean;
}

const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Monday first, as a UK week reads.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function workHoursSummary(slots: SlotLike[] | null): string {
  if (!slots) return "Your working days and hours";
  const on = WEEK_ORDER.map((d) => slots.find((s) => s.dayOfWeek === d && s.enabled)).filter(
    (s): s is SlotLike => !!s
  );
  if (on.length === 0) return "Not set";
  const sameHours = on.every((s) => s.startTime === on[0].startTime && s.endTime === on[0].endTime);
  if (!sameHours) return `${on.length} ${on.length === 1 ? "day" : "days"} a week, hours vary`;
  const hours = `${on[0].startTime} to ${on[0].endTime}`;
  const idx = on.map((s) => WEEK_ORDER.indexOf(s.dayOfWeek));
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (on.length === 1) return `${DAY3[on[0].dayOfWeek]}, ${hours}`;
  if (consecutive) return `${DAY3[on[0].dayOfWeek]} to ${DAY3[on[on.length - 1].dayOfWeek]}, ${hours}`;
  return `${on.map((s) => DAY3[s.dayOfWeek]).join(", ")}, ${hours}`;
}

// ── Home screen ──────────────────────────────────────────────────────

export function homeScreenSummary(labels: { label: string; shown: boolean }[]): string {
  const showing = labels.filter((l) => l.shown).map((l) => l.label);
  if (labels.length === 0) return "Choose which shortcuts show on Home";
  if (showing.length === 0) return "No shortcuts showing";
  return `Showing ${showing.join(", ")}`;
}

// ── Your plan ────────────────────────────────────────────────────────

export interface PlanLike {
  isPremium: boolean;
  platform?: "apple" | "google" | "stripe" | "none";
  source?: "subscription" | "referral" | "team" | "none";
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  referralProUntil?: string | null;
}

const PLATFORM_LABEL: Record<string, string> = { apple: "App Store", google: "Google Play", stripe: "website" };

export function planSummary(p: PlanLike | null): string {
  if (!p) return "Loading...";
  if (!p.isPremium) return "Free plan · see what Pro adds";
  if (p.source === "team") return "Pro through your team";
  if (p.source === "referral") {
    return p.referralProUntil ? `Pro from referrals, until ${shortDate(p.referralProUntil)}` : "Pro from referrals";
  }
  const via = p.platform && PLATFORM_LABEL[p.platform] ? ` (${PLATFORM_LABEL[p.platform]})` : "";
  if (p.platform === "none" || !p.currentPeriodEnd) return "Pro is on for your account";
  const date = shortDate(p.currentPeriodEnd);
  return p.cancelAtPeriodEnd ? `Pro · ends ${date}${via}` : `Pro · renews ${date}${via}`;
}

// ── Records ──────────────────────────────────────────────────────────

export function downloadsSummary(taxYear: string, companyCar: boolean): string {
  return companyCar ? `Your mileage log for ${taxYear}` : `Spreadsheet and PDF for ${taxYear}`;
}

// ── Notifications row (the "change them" door) ───────────────────────

export function recordingOptionsSummary(journeyEndLabel: string | null): string {
  return journeyEndLabel ? `Ends a trip after ${journeyEndLabel} stopped` : "Automatic trips, pause, battery";
}
