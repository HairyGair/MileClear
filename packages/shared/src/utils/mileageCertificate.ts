/**
 * Mileage record certificate (Pro): a summary of the miles recorded in
 * MileClear for a period the driver chooses, for an insurer, an employer, a
 * buyer of their car or an accountant. Each one has an unguessable code and a
 * public page at mileclear.com/verify/<code> that shows the figures exactly as
 * they were when the certificate was made (a frozen snapshot), so editing
 * trips afterwards never changes an issued certificate.
 *
 * Privacy: no routes, no addresses, no coordinates. The public page masks the
 * registration plate.
 *
 * Wording rule: never say it is official, or approved by HMRC or the DVLA.
 * CERTIFICATE_STATEMENT is printed on the PDF and the public page.
 */

export const CERTIFICATE_STATEMENT =
  "Figures are the trips recorded in MileClear for this account. MileClear records where the phone was; it is not an official document.";

/** Free plans can preview; making one is Pro. */
export const CERTIFICATE_MONTHLY_LIMIT = 20;

/** Longest period one certificate can cover. */
export const CERTIFICATE_MAX_DAYS = 3 * 366;

export const CERTIFICATE_CODE_LENGTH = 20;
/** RFC 4648 base32. It has no 0, 1 or 8, so a typed 0, 1 or 8 is read as O, I or B. */
export const CERTIFICATE_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type CertificatePurpose = "insurer" | "employer" | "selling" | "accountant" | "other";

export const CERTIFICATE_PURPOSES: ReadonlyArray<{ value: CertificatePurpose; label: string; printed: string }> = [
  { value: "insurer", label: "Insurer", printed: "For an insurer (business use)" },
  { value: "employer", label: "Employer", printed: "For an employer" },
  { value: "selling", label: "Selling my car", printed: "For the sale of a vehicle" },
  { value: "accountant", label: "Accountant", printed: "For an accountant" },
  { value: "other", label: "Other", printed: "Mileage record" },
];

export function isCertificatePurpose(v: unknown): v is CertificatePurpose {
  return typeof v === "string" && CERTIFICATE_PURPOSES.some((p) => p.value === v);
}

export function certificatePurposeLine(p: CertificatePurpose | null | undefined): string | null {
  if (!p) return null;
  return CERTIFICATE_PURPOSES.find((x) => x.value === p)?.printed ?? null;
}

// ── Snapshot ──────────────────────────────────────────────────────────────

export interface CertificateVehicle {
  make: string;
  model: string;
  year: number | null;
  /** Full plate as entered (PDF only; the public view masks it). */
  registration: string | null;
}

export interface CertificateMonth {
  /** "2026-04" */
  month: string;
  miles: number;
  trips: number;
}

export interface CertificateFigures {
  totalMiles: number;
  businessMiles: number;
  personalMiles: number;
  unclassifiedMiles: number;
  trips: number;
  /** Recorded automatically by the phone's GPS. */
  gpsTrips: number;
  gpsMiles: number;
  /** Added by hand. */
  manualTrips: number;
  manualMiles: number;
  /** Share of the miles recorded by GPS, whole percent (0 when no miles). */
  gpsMilesPercent: number;
  /** ISO, or null when there are no trips. */
  firstTripAt: string | null;
  lastTripAt: string | null;
  months: CertificateMonth[];
}

export interface MileageCertificateSnapshot extends CertificateFigures {
  version: 1;
  code: string;
  /** ISO time the certificate was made. */
  issuedAt: string;
  driverName: string;
  purpose: CertificatePurpose | null;
  /** "YYYY-MM-DD", inclusive. */
  periodStart: string;
  periodEnd: string;
  /** Set when the period is a whole tax year, e.g. "2025-26". */
  taxYear: string | null;
  /** True when the certificate covers one chosen vehicle. */
  singleVehicle: boolean;
  vehicles: CertificateVehicle[];
  /** ISO time the MileClear account was made. */
  accountCreatedAt: string;
}

/** What GET /certificates/verify/:code returns. Revoked shows no figures. */
export type PublicCertificate =
  | {
      status: "valid";
      code: string;
      issuedAt: string;
      driverName: string;
      purpose: CertificatePurpose | null;
      periodStart: string;
      periodEnd: string;
      taxYear: string | null;
      singleVehicle: boolean;
      vehicles: Array<{ make: string; model: string; year: number | null; registration: string | null }>;
      accountCreatedAt: string;
      figures: CertificateFigures;
    }
  | { status: "revoked"; code: string; issuedAt: string; revokedAt: string };

/** One row of GET /certificates. */
export interface MileageCertificateSummary {
  id: string;
  code: string;
  verifyUrl: string;
  createdAt: string;
  revokedAt: string | null;
  periodStart: string;
  periodEnd: string;
  taxYear: string | null;
  purpose: CertificatePurpose | null;
  vehicleLabel: string;
  totalMiles: number;
  trips: number;
}

/** POST /certificates/preview: the figures a certificate would carry now. */
export interface MileageCertificatePreview extends CertificateFigures {
  periodStart: string;
  periodEnd: string;
  taxYear: string | null;
  driverName: string;
  vehicles: CertificateVehicle[];
  singleVehicle: boolean;
  accountCreatedAt: string;
}

// ── Figures ───────────────────────────────────────────────────────────────

export interface CertificateTripRow {
  startedAt: Date;
  distanceMiles: number;
  classification: string;
  isManualEntry: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Every "YYYY-MM" from the start date's month to the end date's month. */
export function monthsBetween(periodStart: string, periodEnd: string): string[] {
  const [sy, sm] = periodStart.split("-").map(Number);
  const [ey, em] = periodEnd.split("-").map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 60) break;
  }
  return out;
}

/**
 * Totals for the certificate. The caller has already left out phantom trips
 * and the newer copy of a possible double-count. Months with no trips are
 * kept (as zero) so a gap shows as a gap.
 */
export function computeCertificateFigures(
  trips: CertificateTripRow[],
  periodStart: string,
  periodEnd: string
): CertificateFigures {
  let business = 0;
  let personal = 0;
  let unclassified = 0;
  let gpsMiles = 0;
  let manualMiles = 0;
  let gpsTrips = 0;
  let manualTrips = 0;
  let first: Date | null = null;
  let last: Date | null = null;
  const byMonth = new Map<string, { miles: number; trips: number }>();
  for (const k of monthsBetween(periodStart, periodEnd)) byMonth.set(k, { miles: 0, trips: 0 });

  for (const t of trips) {
    const miles = Number.isFinite(t.distanceMiles) && t.distanceMiles > 0 ? t.distanceMiles : 0;
    if (t.classification === "business") business += miles;
    else if (t.classification === "personal") personal += miles;
    else unclassified += miles;
    if (t.isManualEntry) {
      manualMiles += miles;
      manualTrips += 1;
    } else {
      gpsMiles += miles;
      gpsTrips += 1;
    }
    if (!first || t.startedAt < first) first = t.startedAt;
    if (!last || t.startedAt > last) last = t.startedAt;
    const key = monthKey(t.startedAt);
    const bucket = byMonth.get(key) ?? { miles: 0, trips: 0 };
    bucket.miles += miles;
    bucket.trips += 1;
    byMonth.set(key, bucket);
  }

  const total = business + personal + unclassified;
  return {
    totalMiles: round1(total),
    businessMiles: round1(business),
    personalMiles: round1(personal),
    unclassifiedMiles: round1(unclassified),
    trips: trips.length,
    gpsTrips,
    gpsMiles: round1(gpsMiles),
    manualTrips,
    manualMiles: round1(manualMiles),
    gpsMilesPercent: total > 0 ? Math.round((gpsMiles / total) * 100) : 0,
    firstTripAt: first ? first.toISOString() : null,
    lastTripAt: last ? last.toISOString() : null,
    months: [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([month, v]) => ({ month, miles: round1(v.miles), trips: v.trips })),
  };
}

// ── Codes, plates, dates ─────────────────────────────────────────────────

/** Upper-case, without spaces or hyphens; null when it cannot be a code. */
export function normaliseCertificateCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/8/g, "B");
  if (code.length !== CERTIFICATE_CODE_LENGTH) return null;
  for (const ch of code) if (!CERTIFICATE_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** "ABCD-EFGH-IJKL-MNOP-QRST", easier to read out or type. */
export function formatCertificateCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** "AB12 CDE" -> "AB12 ***": keeps the first part only. */
export function maskRegistration(reg: string | null | undefined): string | null {
  if (!reg) return null;
  const clean = reg.toUpperCase().replace(/\s+/g, "");
  if (!clean) return null;
  const keep = clean.length > 4 ? 4 : Math.max(1, clean.length - 2);
  return `${clean.slice(0, keep)} ***`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "YYYY-MM-DD" as a real calendar date (local time), or null. */
export function parseCertificateDate(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = s.match(DATE_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function toCertificateDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "6 April 2025" */
export function formatCertificateDate(s: string): string {
  const d = parseCertificateDate(s);
  if (!d) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "April 2026" from "2026-04". */
export function formatCertificateMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export type CertificatePeriodCheck =
  | { ok: true; start: Date; end: Date; periodStart: string; periodEnd: string; clamped: boolean }
  | { ok: false; error: string };

/**
 * Checks a requested period. The end is brought back to today when it runs
 * into the future, so a certificate for the current tax year says "to 4
 * October 2026", not a date nobody has driven to yet.
 */
export function checkCertificatePeriod(
  rawStart: unknown,
  rawEnd: unknown,
  now: Date = new Date()
): CertificatePeriodCheck {
  const start = parseCertificateDate(rawStart);
  const endDay = parseCertificateDate(rawEnd);
  if (!start || !endDay) return { ok: false, error: "Choose a start and end date." };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (start > today) return { ok: false, error: "The start date is in the future." };
  let clamped = false;
  let end = endDay;
  if (end > today) {
    end = today;
    clamped = true;
  }
  if (end < start) return { ok: false, error: "The end date is before the start date." };
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > CERTIFICATE_MAX_DAYS) return { ok: false, error: "A certificate can cover up to 3 years." };
  return {
    ok: true,
    start,
    end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999),
    periodStart: toCertificateDate(start),
    periodEnd: toCertificateDate(end),
    clamped,
  };
}

/** Builds the public answer from a stored snapshot. Plates are masked. */
export function toPublicCertificate(
  snapshot: MileageCertificateSnapshot,
  revokedAt: Date | string | null
): PublicCertificate {
  if (revokedAt) {
    return {
      status: "revoked",
      code: snapshot.code,
      issuedAt: snapshot.issuedAt,
      revokedAt: typeof revokedAt === "string" ? revokedAt : revokedAt.toISOString(),
    };
  }
  return {
    status: "valid",
    code: snapshot.code,
    issuedAt: snapshot.issuedAt,
    driverName: snapshot.driverName,
    purpose: snapshot.purpose,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    taxYear: snapshot.taxYear,
    singleVehicle: snapshot.singleVehicle,
    vehicles: snapshot.vehicles.map((v) => ({
      make: v.make,
      model: v.model,
      year: v.year,
      registration: maskRegistration(v.registration),
    })),
    accountCreatedAt: snapshot.accountCreatedAt,
    figures: {
      totalMiles: snapshot.totalMiles,
      businessMiles: snapshot.businessMiles,
      personalMiles: snapshot.personalMiles,
      unclassifiedMiles: snapshot.unclassifiedMiles,
      trips: snapshot.trips,
      gpsTrips: snapshot.gpsTrips,
      gpsMiles: snapshot.gpsMiles,
      manualTrips: snapshot.manualTrips,
      manualMiles: snapshot.manualMiles,
      gpsMilesPercent: snapshot.gpsMilesPercent,
      firstTripAt: snapshot.firstTripAt,
      lastTripAt: snapshot.lastTripAt,
      months: snapshot.months,
    },
  };
}

export function certificateVehicleLabel(vehicles: CertificateVehicle[], singleVehicle: boolean): string {
  if (vehicles.length === 0) return "No vehicle set on these trips";
  if (vehicles.length === 1) {
    const v = vehicles[0];
    return `${v.make} ${v.model}${v.registration ? ` (${v.registration.toUpperCase()})` : ""}`;
  }
  return singleVehicle ? `${vehicles[0].make} ${vehicles[0].model}` : `${vehicles.length} vehicles`;
}
