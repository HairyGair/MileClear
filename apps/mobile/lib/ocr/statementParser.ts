/**
 * "Snap your statement" parser.
 *
 * Takes the text lines OCR read off a screenshot of a platform's earnings
 * summary (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, Evri, DPD, Bolt...)
 * and returns what it could find: the platform, the period (a day or a date
 * range) and the total in pence.
 *
 * Pure: no React Native imports, so it runs under vitest. The OCR engine lives
 * in ./index.ts; this file only reads strings.
 *
 * Rule one: never invent a value. When the total is not clearly labelled, or
 * two labelled totals disagree, `amountPence` is null and `amountCandidates`
 * lists what the screen showed so the driver picks. Nothing here saves
 * anything; the screen saves only after the driver confirms.
 *
 * The fixtures in __tests__ are written by hand, not taken from real
 * screenshots. Tune these rules against real samples from drivers.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatementAmountCandidate {
  amountPence: number;
  /** The label the amount sat next to, e.g. "Total earnings", or "" when none. */
  label: string;
  /** Higher is more likely the total. 0-100. */
  score: number;
}

export type StatementPeriodKind = "day" | "range";

export interface StatementParseResult {
  /** A GIG_PLATFORMS value ("uber", "deliveroo"...), or null when not found. */
  platform: string | null;
  /** The name as the driver knows it ("Uber", "Bolt"); useful when platform is "other". */
  platformName: string | null;
  /** YYYY-MM-DD, or null. */
  periodStart: string | null;
  /** YYYY-MM-DD, or null. Equal to periodStart for a single day. */
  periodEnd: string | null;
  periodKind: StatementPeriodKind | null;
  /** The total in pence when one clear total was found, otherwise null. */
  amountPence: number | null;
  /** Every amount that could be the total, best first. Never empty when amounts exist. */
  amountCandidates: StatementAmountCandidate[];
  /** Tips line, when the statement shows one. Informational only. */
  tipsPence: number | null;
  /**
   * high:   platform, period and a clearly labelled total all found.
   * medium: a clear total, but the platform or period is missing.
   * low:    no clear total; the driver must pick or type it.
   */
  confidence: "high" | "medium" | "low";
  rawLines: string[];
}

export interface ParseStatementOptions {
  /** "Now", used to work out the year when the screenshot leaves it off. */
  today?: Date;
}

type LineInput = string | { text: string };

// ── Platforms ─────────────────────────────────────────────────────────────────

interface PlatformRule {
  value: string;
  name: string;
  pattern: RegExp;
}

// Order matters only for ties. "Stuart" is also a first name, so it needs a
// courier word or a line of its own ("Hi Stuart" must not count).
const PLATFORM_RULES: PlatformRule[] = [
  { value: "uber", name: "Uber", pattern: /\buber(\s*eats)?\b/ },
  { value: "deliveroo", name: "Deliveroo", pattern: /\bdeliveroo\b/ },
  { value: "just_eat", name: "Just Eat", pattern: /\bjust\s*eat\b|\bscoober\b/ },
  { value: "amazon_flex", name: "Amazon Flex", pattern: /\bamazon\s*flex\b/ },
  { value: "stuart", name: "Stuart", pattern: /^stuart$|\bstuart\s+(courier|delivery|deliveries|driver|app)\b|\bstuart\.com\b/ },
  { value: "gophr", name: "Gophr", pattern: /\bgophr\b/ },
  { value: "dpd", name: "DPD", pattern: /\bdpd\b/ },
  { value: "yodel", name: "Yodel", pattern: /\byodel\b/ },
  { value: "evri", name: "Evri", pattern: /\bevri\b|\bhermes\b/ },
  // Not in GIG_PLATFORMS: saved as "other" with the name in the notes.
  { value: "other", name: "Bolt", pattern: /\bbolt(\s*food)?\b/ },
];

function detectPlatform(lowerLines: string[]): { value: string; name: string } | null {
  let best: { rule: PlatformRule; count: number; first: number } | null = null;
  for (const rule of PLATFORM_RULES) {
    let count = 0;
    let first = -1;
    lowerLines.forEach((line, i) => {
      if (rule.pattern.test(line.trim())) {
        count++;
        if (first < 0) first = i;
      }
    });
    if (count === 0) continue;
    if (!best || count > best.count || (count === best.count && first < best.first)) {
      best = { rule, count, first };
    }
  }
  return best ? { value: best.rule.value, name: best.rule.name } : null;
}

// ── Money ─────────────────────────────────────────────────────────────────────

interface MoneyHit {
  pence: number;
  negative: boolean;
}

// £1,234.56 / £12.50 / £12 / GBP 12.50 / 12.50. OCR often reads "£" as "E"
// or "f", so those count when directly followed by an amount with pence.
// No lookbehind: the leading (^|space|bracket) is matched instead, which is
// safe on every JS engine Hermes has shipped.
const MONEY_RE =
  /(-|\u2212)?(?:(?:£|gbp\s?)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{2}))?|(?:^|[\s(])[ef](\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})\b|(?:^|[\s(])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\b)/gi;

function findMoney(text: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const negative = !!m[1];
    const whole = m[2] ?? m[4] ?? m[6];
    const pence = m[3] ?? m[5] ?? m[7] ?? "00";
    if (!whole) continue;
    const pounds = parseInt(whole.replace(/,/g, ""), 10);
    if (!Number.isFinite(pounds)) continue;
    const total = pounds * 100 + parseInt(pence, 10);
    // A week of driving is never £100k; anything that big is a misread.
    if (total <= 0 || total > 10_000_000) continue;
    hits.push({ pence: total, negative });
  }
  return hits;
}

/** True when the line is (almost) nothing but an amount. */
function isAmountOnly(text: string): boolean {
  const stripped = text.replace(MONEY_RE, "").replace(/[\s:*•·+]/g, "");
  return stripped.length <= 1 && findMoney(text).length > 0;
}

// ── Labels ────────────────────────────────────────────────────────────────────

/**
 * Words that mark a part of the total, not the total. A line with one of these
 * never becomes the total, even if it also says "total" ("Total tips").
 */
const COMPONENT_RE =
  /\btips?\b|\bgratuit|\bservice fee|\bbooking fee|\bplatform fee|\bcommission\b|\bdeduction|\badjustment|\bpromotion|\bboost|\bquest\b|\bincentive|\bbonus|\bsurge\b|\bper hour\b|\/\s?h(ou)?r\b|\bper (order|delivery|drop|trip|job)\b|\bavg\b|\baverage\b|\bcash (collected|received)\b|\bfuel\b|\bvat\b|\btolls?\b|\bwait(ing)? time\b|\bdistance\b|\bper mile\b|\/\s?mi(le)?\b|\bhourly\b|\brating\b|\bacceptance\b|%/;

const TIPS_RE = /\btips?\b|\bgratuit/;

/** "Total incl. tips", "earnings including tips": still the total. */
const INCLUDES_TIPS_RE = /\b(incl\.?|includ(es|ing)|plus|with)\s+tips?\b|\band\s+tips?\b|\+\s*tips?\b/;

interface LabelRule {
  re: RegExp;
  score: number;
}

const LABEL_RULES: LabelRule[] = [
  { re: /\byou earned\b|\byou made\b/, score: 100 },
  { re: /\bnet (earnings|pay|payout|income)\b/, score: 100 },
  { re: /\btotal\s+(earnings|earned|payout|pay|paid|payment|income|to you)\b/, score: 100 },
  { re: /\bearnings\s+(this|last)\s+(week|day)\b|\bweekly\s+(earnings|total|pay)\b/, score: 95 },
  { re: /\btake[\s-]?home\b|\bamount paid\b|\bpaid to you\b|\bpayout total\b/, score: 90 },
  // Before the plain "total"/"earnings" rules: "Gross earnings" is not net.
  { re: /\bgross\b|\btotal fares?\b/, score: 50 },
  { re: /\btotal fees\b/, score: 60 },
  { re: /\btotal\b/, score: 80 },
  { re: /\b(your )?earnings\b/, score: 80 },
  { re: /\bpayout\b|\bpayment\b|\btransfer(red)?\b/, score: 70 },
];

function labelScore(lower: string): number {
  if (COMPONENT_RE.test(lower)) return 0;
  for (const rule of LABEL_RULES) {
    if (rule.re.test(lower)) return rule.score;
  }
  return 0;
}

/** The words of a line with the amounts taken out, tidied for display. */
function labelText(text: string): string {
  return text
    .replace(MONEY_RE, "")
    .replace(/[:*•·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const YEAR = "(\\d{4})";

function monthNum(word: string): number {
  return MONTHS[word.toLowerCase().slice(0, 3)] ?? MONTHS[word.toLowerCase().slice(0, 4)] ?? 0;
}

interface PartialDate {
  d: number;
  m: number;
  y: number | null;
}

interface DateHit {
  start: PartialDate;
  end: PartialDate | null;
  /** "Week of 28 Sep" / "w/c 28/09/2026": a seven-day week starting here. */
  weekOf: boolean;
}

function fullYear(y: string | undefined): number | null {
  if (!y) return null;
  const n = parseInt(y, 10);
  if (!Number.isFinite(n)) return null;
  return n < 100 ? 2000 + n : n;
}

/** Lowercase, drop day names, and turn every dash or "to" between dates into " - ". */
function normaliseForDates(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(mon|tues?|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?\b\.?,?/g, " ")
    .replace(/\s*[–—−-]\s*/g, " - ")
    .replace(/\s+to\s+/g, " - ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findDates(raw: string): DateHit[] {
  const text = normaliseForDates(raw);
  const hits: DateHit[] = [];
  const weekOf = /\b(week of|week commencing|w\/c|wc|week starting)\b/.test(text);

  const num = "(\\d{1,2})/(\\d{1,2})/(\\d{2,4})";
  let m: RegExpMatchArray | null;

  // 28/09/2026 - 04/10/2026
  m = text.match(new RegExp(`${num}\\s*-\\s*${num}`));
  if (m) {
    hits.push({
      start: { d: +m[1], m: +m[2], y: fullYear(m[3]) },
      end: { d: +m[4], m: +m[5], y: fullYear(m[6]) },
      weekOf: false,
    });
    return hits;
  }

  // 28 Sep (2026) - 4 Oct (2026)
  m = text.match(new RegExp(`\\b${DAY}\\s+${MONTH}(?:\\s+${YEAR})?\\s*-\\s*${DAY}\\s+${MONTH}(?:\\s+${YEAR})?`));
  if (m) {
    hits.push({
      start: { d: +m[1], m: monthNum(m[2]), y: fullYear(m[3]) },
      end: { d: +m[4], m: monthNum(m[5]), y: fullYear(m[6]) },
      weekOf: false,
    });
    return hits;
  }

  // Sep 28 (2026) - Oct 4 (2026), or Sep 28 - 4
  m = text.match(new RegExp(`\\b${MONTH}\\s+${DAY}(?:\\s+${YEAR})?\\s*-\\s*(?:${MONTH}\\s+)?${DAY}(?:\\s+${YEAR})?\\b`));
  if (m) {
    const startMonth = monthNum(m[1]);
    hits.push({
      start: { d: +m[2], m: startMonth, y: fullYear(m[3]) },
      end: { d: +m[5], m: m[4] ? monthNum(m[4]) : startMonth, y: fullYear(m[6]) },
      weekOf: false,
    });
    return hits;
  }

  // 1 - 7 Sep (2026)
  m = text.match(new RegExp(`\\b${DAY}\\s*-\\s*${DAY}\\s+${MONTH}(?:\\s+${YEAR})?`));
  if (m) {
    const month = monthNum(m[3]);
    const y = fullYear(m[4]);
    hits.push({
      start: { d: +m[1], m: month, y },
      end: { d: +m[2], m: month, y },
      weekOf: false,
    });
    return hits;
  }

  // Single dates. All of them on the line, in order.
  const singles: Array<{ index: number; date: PartialDate }> = [];
  for (const s of text.matchAll(new RegExp(num, "g"))) {
    singles.push({ index: s.index ?? 0, date: { d: +s[1], m: +s[2], y: fullYear(s[3]) } });
  }
  for (const s of text.matchAll(new RegExp(`\\b${DAY}\\s+${MONTH}(?:\\s+${YEAR})?`, "g"))) {
    singles.push({ index: s.index ?? 0, date: { d: +s[1], m: monthNum(s[2]), y: fullYear(s[3]) } });
  }
  for (const s of text.matchAll(new RegExp(`\\b${MONTH}\\s+${DAY}(?:\\s+${YEAR})?\\b`, "g"))) {
    singles.push({ index: s.index ?? 0, date: { d: +s[2], m: monthNum(s[1]), y: fullYear(s[3]) } });
  }
  singles.sort((a, b) => a.index - b.index);
  for (const s of singles) hits.push({ start: s.date, end: null, weekOf });
  return hits;
}

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function todayIso(today: Date): string {
  // A UK driver's "today" in local time, not UTC.
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

/**
 * Give a yearless date the most recent year that is not in the future.
 * A statement is always about the past, so "28 Dec" read on 3 Jan is last year.
 */
function resolveYear(p: PartialDate, todayStr: string): string | null {
  if (p.y !== null) return iso(p.y, p.m, p.d);
  const thisYear = parseInt(todayStr.slice(0, 4), 10);
  const guess = iso(thisYear, p.m, p.d);
  if (!guess) return iso(thisYear - 1, p.m, p.d);
  // One day of leeway for time zones and late-night screenshots.
  return guess > addDays(todayStr, 1) ? iso(thisYear - 1, p.m, p.d) : guess;
}

interface ResolvedPeriod {
  start: string;
  end: string;
  kind: StatementPeriodKind;
}

function resolveHit(hit: DateHit, todayStr: string): ResolvedPeriod | null {
  if (!hit.start.m || (hit.end && !hit.end.m)) return null;
  if (hit.end) {
    const end = resolveYear(hit.end, todayStr);
    if (!end) return null;
    let startYear = hit.start.y;
    if (startYear === null) {
      const endYear = parseInt(end.slice(0, 4), 10);
      // "28 Dec - 3 Jan": the start is in the year before the end.
      startYear = hit.start.m > parseInt(end.slice(5, 7), 10) ? endYear - 1 : endYear;
    }
    const start = iso(startYear, hit.start.m, hit.start.d);
    if (!start || start > end) return null;
    // A statement covers a day, a week, or at most a month.
    if (addDays(start, 31) < end) return null;
    return { start, end, kind: start === end ? "day" : "range" };
  }
  const day = resolveYear(hit.start, todayStr);
  if (!day) return null;
  if (hit.weekOf) return { start: day, end: addDays(day, 6), kind: "range" };
  return { start: day, end: day, kind: "day" };
}

/** Lines whose date is when money moves, not the period it was earned in. */
const PAYOUT_DATE_RE = /\bpaid on\b|\bpayment date\b|\bpay date\b|\bpaid\b.*\bon\b|\btransferred\b|\bdeposit|\barrives?\b|\bexpected\b|\bprocessed\b|\bissued\b|\binvoice date\b/;

function detectPeriod(lines: string[], todayStr: string): ResolvedPeriod | null {
  const ranges: ResolvedPeriod[] = [];
  const days: ResolvedPeriod[] = [];
  const payoutDays: ResolvedPeriod[] = [];

  for (const line of lines) {
    const payout = PAYOUT_DATE_RE.test(line.toLowerCase());
    for (const hit of findDates(line)) {
      const p = resolveHit(hit, todayStr);
      if (!p) continue;
      if (p.kind === "range") {
        if (!payout) ranges.push(p);
      } else if (payout) {
        payoutDays.push(p);
      } else {
        days.push(p);
      }
    }
  }

  if (ranges.length > 0) return ranges[0];

  const distinct = Array.from(new Set(days.map((d) => d.start))).sort();
  if (distinct.length === 1) return { start: distinct[0], end: distinct[0], kind: "day" };
  if (distinct.length > 1) {
    // A list of days with no heading (a week's breakdown): span them, but only
    // when they sit inside one week, otherwise we would be guessing.
    const first = distinct[0];
    const last = distinct[distinct.length - 1];
    if (addDays(first, 6) >= last) return { start: first, end: last, kind: "range" };
    return null;
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function parseStatementText(
  input: LineInput[],
  options: ParseStatementOptions = {},
): StatementParseResult {
  const rawLines = input
    .map((l) => (typeof l === "string" ? l : l.text))
    .map((t) => (t ?? "").trim())
    .filter((t) => t.length > 0);
  const lower = rawLines.map((l) => l.toLowerCase());
  const todayStr = todayIso(options.today ?? new Date());

  // Platform
  const platform = detectPlatform(lower);

  // Period
  const period = detectPeriod(rawLines, todayStr);

  // Amounts. A label can sit on the same line ("Total £412.50"), or, as
  // screenshots often split them, on the line above or below the figure.
  const scored = new Map<number, StatementAmountCandidate>();
  let tipsPence: number | null = null;

  const consider = (pence: number, label: string, score: number) => {
    const existing = scored.get(pence);
    if (!existing || score > existing.score) {
      scored.set(pence, { amountPence: pence, label, score });
    }
  };

  /** True when a line carries words worth reading as a label. */
  const isLabel = (j: number) =>
    labelScore(lower[j]) > 0 || TIPS_RE.test(lower[j]) || COMPONENT_RE.test(lower[j]);
  /** A line with a date and nothing else, which can sit between a label and its figure. */
  const isDateOnly = (j: number) =>
    findDates(rawLines[j]).length > 0 && labelScore(lower[j]) === 0 && !TIPS_RE.test(lower[j]);

  /**
   * For a line that is only a figure, the label is usually the line above,
   * sometimes two above with a date line between ("Earnings" / "28 Sep - 4 Oct"
   * / "£412.50"), and sometimes the line below. Stops at any line with money.
   */
  const findLabelNear = (i: number): number => {
    for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
      if (findMoney(rawLines[j]).length > 0) break;
      if (isLabel(j)) return j;
      if (!isDateOnly(j)) break;
    }
    const next = i + 1;
    if (next < rawLines.length && findMoney(rawLines[next]).length === 0 && isLabel(next)) {
      return next;
    }
    return -1;
  };

  rawLines.forEach((line, i) => {
    const money = findMoney(line).filter((h) => !h.negative);
    if (money.length === 0) return;

    let labelLine = line;
    let labelLower = lower[i];
    if (isAmountOnly(line)) {
      const found = findLabelNear(i);
      labelLine = found >= 0 ? rawLines[found] : "";
      labelLower = found >= 0 ? lower[found] : "";
    }

    const includesTips = INCLUDES_TIPS_RE.test(labelLower);
    if (TIPS_RE.test(labelLower) && !includesTips) {
      if (tipsPence === null) tipsPence = money[0].pence;
      return;
    }

    // "Total incl. tips" is still the total.
    const scoreLower = labelLower.replace(new RegExp(INCLUDES_TIPS_RE.source, "g"), " ");
    const score = labelScore(scoreLower);
    const label = labelText(labelLine);

    if (score > 0) {
      // With several amounts on one labelled line, the label belongs to the first.
      consider(money[0].pence, label, score);
      money.slice(1).forEach((h) => consider(h.pence, "", 5));
    } else if (!COMPONENT_RE.test(labelLower)) {
      money.forEach((h) => consider(h.pence, label, 5));
    }
  });

  const candidates = Array.from(scored.values()).sort(
    (a, b) => b.score - a.score || b.amountPence - a.amountPence,
  );

  // A clear total: one amount on its own at the top score, and that score
  // means a real total label (not "gross", not a bare unlabelled figure).
  let amountPence: number | null = null;
  const top = candidates[0];
  if (top && top.score >= 70) {
    const tied = candidates.filter((c) => c.score === top.score);
    if (tied.length === 1) amountPence = top.amountPence;
  }

  let confidence: StatementParseResult["confidence"] = "low";
  if (amountPence !== null) {
    confidence = platform && period ? "high" : "medium";
  }

  return {
    platform: platform?.value ?? null,
    platformName: platform?.name ?? null,
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
    periodKind: period?.kind ?? null,
    amountPence,
    amountCandidates: candidates.slice(0, 6),
    tipsPence,
    confidence,
    rawLines,
  };
}

/**
 * The de-duplication key for a snapped statement. Same platform, same period,
 * same amount = the same statement snapped twice. The server keeps
 * (userId, externalId) unique, so a second save is refused.
 */
export function statementExternalId(
  platform: string,
  periodStart: string,
  periodEnd: string,
  amountPence: number,
  platformName?: string | null,
): string {
  const who = platform === "other" && platformName ? `other-${platformName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : platform;
  return `ocr:${who}:${periodStart}:${periodEnd}:${amountPence}`;
}
