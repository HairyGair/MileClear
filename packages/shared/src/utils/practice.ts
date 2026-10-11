// Practice accounts (Accountant mode phase 1, Oct 2026).
//
// Pure helpers both sides share: MTD quarter dates and the periods the
// client list can show, when a sharing link ends, the practice initials
// tile, request wording and the plain sentences the driver sees in
// "What they've looked at". Dates here are calendar dates ("2026-07-06"),
// never instants, so a quarter means the same thing on a phone in BST and
// a server in UTC.

export type PracticeRequestType =
  | "sort_trips"
  | "add_earnings"
  | "add_expenses"
  | "check_details"
  | "other";

export const PRACTICE_REQUEST_TYPES: PracticeRequestType[] = [
  "sort_trips",
  "add_earnings",
  "add_expenses",
  "check_details",
  "other",
];

export const PROFESSIONAL_BODIES = [
  { value: "ICAEW", label: "ICAEW" },
  { value: "ACCA", label: "ACCA" },
  { value: "AAT", label: "AAT" },
  { value: "ATT", label: "ATT" },
  { value: "CIOT", label: "CIOT" },
  { value: "ICB", label: "ICB" },
  { value: "IAB", label: "IAB" },
  { value: "other", label: "Other" },
  { value: "none", label: "None" },
] as const;

export type PracticeLinkStatus =
  | "invited"
  | "pending_practice"
  | "active"
  | "ended"
  | "declined"
  | "cancelled";

export type PracticeAccessAction =
  | "viewed_list"
  | "viewed_client"
  | "viewed_trips"
  | "viewed_earnings"
  | "viewed_expenses"
  | "viewed_details"
  | "exported_csv"
  | "exported_pdf"
  | "exported_summary"
  | "sent_request"
  | "started_sharing"
  | "kept_sharing"
  | "changed_sharing"
  | "stopped_sharing";

/** Practice staff cap in phase 1 (owner included). */
export const PRACTICE_STAFF_CAP = 6;
/** Most invites one paste can send. */
export const PRACTICE_BULK_INVITE_MAX = 200;
/** Requests a practice can send one client in 7 days. */
export const PRACTICE_REQUESTS_PER_WEEK = 3;
export const PRACTICE_NOTE_MAX = 300;
export const PRACTICE_REPLY_MAX = 200;
/** Invite links last this long. */
export const PRACTICE_INVITE_DAYS = 30;
/** Join codes: capitals and digits, no lookalikes. */
export const PRACTICE_JOIN_CODE_RE = /^[A-HJ-NP-Z2-9]{6,12}$/;

// ── Calendar dates ──────────────────────────────────────────────────────

/** "YYYY-MM-DD" of a Date in UK local time. */
export function ukDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "7 Nov" from "2026-11-07". With year: "7 Nov 2026". */
export function shortDate(dateKey: string, withYear = false): string {
  const [y, m, d] = dateKey.split("-").map((n) => parseInt(n, 10));
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** Whole days from `fromKey` to `toKey` (negative when before). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map((n) => parseInt(n, 10));
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000);
}

// ── MTD quarters ────────────────────────────────────────────────────────

export interface MtdQuarter {
  /** "2026-27" */
  taxYear: string;
  /** 1 to 4 */
  index: number;
  start: string;
  end: string;
  /** Quarterly update deadline. */
  due: string;
}

/** Start year of the tax year a calendar date falls in. */
export function taxYearStartYear(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map((n) => parseInt(n, 10));
  return m < 4 || (m === 4 && d < 6) ? y - 1 : y;
}

export function taxYearLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/** The four standard quarters of a tax year (6 Apr to 5 Jul and so on). */
export function mtdQuarters(startYear: number): MtdQuarter[] {
  const ty = taxYearLabel(startYear);
  const y = startYear;
  return [
    { taxYear: ty, index: 1, start: key(y, 4, 6), end: key(y, 7, 5), due: key(y, 8, 7) },
    { taxYear: ty, index: 2, start: key(y, 7, 6), end: key(y, 10, 5), due: key(y, 11, 7) },
    { taxYear: ty, index: 3, start: key(y, 10, 6), end: key(y + 1, 1, 5), due: key(y + 1, 2, 7) },
    { taxYear: ty, index: 4, start: key(y + 1, 1, 6), end: key(y + 1, 4, 5), due: key(y + 1, 5, 7) },
  ];
}

/** The quarter a calendar date falls in. */
export function quarterContaining(dateKey: string): MtdQuarter {
  const qs = mtdQuarters(taxYearStartYear(dateKey));
  return qs.find((q) => q.start <= dateKey && dateKey <= q.end) ?? qs[0];
}

/**
 * The quarter whose quarterly update is due next: the earliest quarter
 * whose deadline has not passed. On 11 Oct that is 6 Jul to 5 Oct (due
 * 7 Nov), not the quarter that started five days ago; it moves on the
 * day after each deadline.
 */
export function quarterDueNext(todayKey: string): MtdQuarter {
  const y = taxYearStartYear(todayKey);
  const all = [...mtdQuarters(y - 1), ...mtdQuarters(y), ...mtdQuarters(y + 1)];
  return all.find((q) => q.due >= todayKey)!;
}

export type PracticePeriodKey = "due" | "current" | "tax_year" | "last_tax_year";

export interface PracticePeriod {
  key: PracticePeriodKey;
  /** "Quarter due 7 Nov" */
  label: string;
  /** "6 Jul to 5 Oct" */
  range: string;
  start: string;
  end: string;
  /** The tax year the period belongs to. */
  taxYear: string;
  /** Set for the quarter options. */
  quarter?: MtdQuarter;
}

export function periodRange(start: string, end: string): string {
  return `${shortDate(start)} to ${shortDate(end)}`;
}

/** The period options for the client list, in menu order. */
export function practicePeriods(todayKey: string): PracticePeriod[] {
  const due = quarterDueNext(todayKey);
  const current = quarterContaining(todayKey);
  const tyStart = taxYearStartYear(todayKey);
  const ty = mtdQuarters(tyStart);
  const last = mtdQuarters(tyStart - 1);
  const out: PracticePeriod[] = [
    {
      key: "due",
      label: `Quarter due ${shortDate(due.due)}`,
      range: periodRange(due.start, due.end),
      start: due.start,
      end: due.end,
      taxYear: due.taxYear,
      quarter: due,
    },
  ];
  if (current.start !== due.start) {
    out.push({
      key: "current",
      label: "Current quarter",
      range: periodRange(current.start, current.end),
      start: current.start,
      end: current.end,
      taxYear: current.taxYear,
      quarter: current,
    });
  }
  out.push(
    {
      key: "tax_year",
      label: `Tax year so far (${taxYearLabel(tyStart)})`,
      range: periodRange(ty[0].start, todayKey),
      start: ty[0].start,
      end: todayKey,
      taxYear: taxYearLabel(tyStart),
    },
    {
      key: "last_tax_year",
      label: `Last tax year (${taxYearLabel(tyStart - 1)})`,
      range: periodRange(last[0].start, last[3].end),
      start: last[0].start,
      end: last[3].end,
      taxYear: taxYearLabel(tyStart - 1),
    }
  );
  return out;
}

/** One period by key, falling back to the default (due quarter). */
export function practicePeriod(todayKey: string, k: string | undefined | null): PracticePeriod {
  const all = practicePeriods(todayKey);
  return all.find((p) => p.key === k) ?? all[0];
}

// ── Link dates ──────────────────────────────────────────────────────────

/**
 * When sharing ends: the 31 January filing deadline for the tax year the
 * link starts in. Started 3 Oct 2026 (tax year 2026-27) it runs to the end
 * of 31 Jan 2028, so every client of a practice ends on the same day
 * instead of 50 different ones.
 */
export function linkEndsAt(startedAt: Date): Date {
  const startYear = taxYearStartYear(ukDateKey(startedAt));
  // 31 January is GMT, so UTC end of day is UK end of day.
  return new Date(Date.UTC(startYear + 2, 0, 31, 23, 59, 59, 999));
}

/** One more year after "Keep sharing": the next 31 January deadline. */
export function renewedEndsAt(endsAt: Date, now: Date = new Date()): Date {
  const base = endsAt.getTime() > now.getTime() ? endsAt : linkEndsAt(now);
  const y = base.getUTCFullYear();
  return new Date(Date.UTC(y + 1, 0, 31, 23, 59, 59, 999));
}

/** Days before the end when the driver is first asked to keep sharing. */
export const RENEWAL_ASK_DAYS = 30;
/** Second (last) reminder. */
export const RENEWAL_REMIND_DAYS = 7;

// ── Identity ────────────────────────────────────────────────────────────

const SKIP_WORDS = new Set(["ltd", "limited", "llp", "plc", "the", "of", "and"]);

/**
 * Initials for the practice tile: "Smith & Co" -> "S&C", "Taylor Price
 * Associates" -> "TPA", "Jones Accountancy Ltd" -> "JA". Two or three
 * characters, never empty.
 */
export function practiceInitials(name: string): string {
  const words = name
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !SKIP_WORDS.has(w.toLowerCase()));
  const chars: string[] = [];
  for (const w of words) {
    if (w === "&" || w === "+") {
      chars.push("&");
      continue;
    }
    const c = w.match(/[A-Za-z0-9]/)?.[0];
    if (c) chars.push(c.toUpperCase());
    if (chars.length >= 3) break;
  }
  // "&" only makes sense between two letters.
  while (chars[chars.length - 1] === "&") chars.pop();
  while (chars[0] === "&") chars.shift();
  if (chars.length === 0) return "?";
  if (chars.length === 1) {
    const extra = words[0]?.replace(/[^A-Za-z0-9]/g, "").slice(1, 2).toUpperCase();
    return chars[0] + (extra ?? "");
  }
  return chars.slice(0, 3).join("");
}

export function firstName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n ? n : null;
}

// ── Requests ────────────────────────────────────────────────────────────

export function requestTitle(r: {
  type: PracticeRequestType | string;
  countAtSend?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): string {
  const period =
    r.periodStart && r.periodEnd ? ` for ${periodRange(r.periodStart, r.periodEnd)}` : "";
  switch (r.type) {
    case "sort_trips":
      return r.countAtSend ? `Please sort your trips (${r.countAtSend})` : "Please sort your trips";
    case "add_earnings":
      return `Please add your earnings${period}`;
    case "add_expenses":
      return `Please add your expenses${period}`;
    case "check_details":
      return "Please check your details";
    default:
      return "Something else";
  }
}

/** The one button on the driver's request card. */
export function requestActionLabel(type: PracticeRequestType | string): string {
  switch (type) {
    case "sort_trips":
      return "Sort trips";
    case "add_earnings":
      return "Add earnings";
    case "add_expenses":
      return "Add expenses";
    case "check_details":
      return "Check details";
    default:
      return "Open";
  }
}

/** Requests that close themselves when the driver has done the thing. */
export function requestClosesItself(type: PracticeRequestType | string): boolean {
  return type === "sort_trips" || type === "add_earnings";
}

// ── Access log sentences (driver side) ──────────────────────────────────

export interface AccessLogRowLike {
  action: PracticeAccessAction | string;
  practiceName: string;
  actorName?: string | null;
  detail?: Record<string, unknown> | null;
}

/** "Jane at Smith & Co looked at your trips". Plain, one sentence. */
export function accessLogSentence(row: AccessLogRowLike): string {
  const firm = row.practiceName;
  const actor = firstName(row.actorName);
  const who = actor ? `${actor} at ${firm}` : firm;
  const taxYear = typeof row.detail?.taxYear === "string" ? `${row.detail.taxYear} ` : "";
  switch (row.action) {
    case "viewed_list":
      return `${who} saw your totals in their client list`;
    case "viewed_client":
      return `${who} looked at your summary`;
    case "viewed_trips":
      return `${who} looked at your trips`;
    case "viewed_earnings":
      return `${who} looked at your earnings`;
    case "viewed_expenses":
      return `${who} looked at your expenses`;
    case "viewed_details":
      return `${who} looked at your vehicles and details`;
    case "exported_csv":
      return `${who} downloaded your ${taxYear}trips (CSV)`;
    case "exported_pdf":
      return `${who} downloaded your ${taxYear}trips (PDF)`;
    case "exported_summary":
      return `${who} downloaded your ${taxYear}tax year summary (PDF)`;
    case "sent_request": {
      const t = typeof row.detail?.type === "string" ? row.detail.type : "other";
      const what: Record<string, string> = {
        sort_trips: "sort your trips",
        add_earnings: "add your earnings",
        add_expenses: "add your expenses",
        check_details: "check your details",
      };
      return `${who} asked you to ${what[t] ?? "do something"}`;
    }
    case "started_sharing":
      return `You started sharing with ${firm}`;
    case "kept_sharing":
      return `You kept sharing with ${firm}`;
    case "changed_sharing":
      return `You changed what ${firm} can see`;
    case "stopped_sharing":
      return `You stopped sharing with ${firm}`;
    default:
      return `${who} used your records`;
  }
}

// ── Pasted invite lists ─────────────────────────────────────────────────

export interface PastedInvite {
  line: number;
  raw: string;
  email: string;
  name: string | null;
  valid: boolean;
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function isLikelyEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

/**
 * Parse a pasted list: one entry per line, or comma separated. A name can
 * follow the email after a comma on the same line ("dave@x.com, Dave").
 * Blank lines are skipped.
 */
export function parsePastedInvites(text: string): PastedInvite[] {
  const out: PastedInvite[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    const parts = line
      .split(/[,;\t]/)
      .map((p) => p.trim())
      .filter(Boolean);
    // "a@x.com, b@y.com" on one line: every part an email.
    if (parts.length > 1 && parts.every(isLikelyEmail)) {
      for (const p of parts) {
        out.push({ line: i + 1, raw: p, email: p.toLowerCase(), name: null, valid: true });
      }
      return;
    }
    const [first, ...rest] = parts;
    const email = (first ?? "").replace(/^<|>$/g, "");
    const name = rest.join(" ").trim() || null;
    out.push({
      line: i + 1,
      raw: line,
      email: email.toLowerCase(),
      name: name ? name.slice(0, 120) : null,
      valid: isLikelyEmail(email),
    });
  });
  return out;
}
