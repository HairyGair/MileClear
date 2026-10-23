// Triggered lifecycle emails (30 Aug 2026). Each job self-gates to a UK
// local-time window and is called from the 30-minute windowed tick in
// notifications.ts. Every send is recorded as an app_event so it can be
// deduplicated and measured. All templates deliver with gated:true, which
// honours marketingEmailsEnabled and the List-Unsubscribe plumbing.
//
// Kill switch: TRIGGERED_EMAILS_ENABLED must be "1" for anything to send.
// previewTriggeredEmails() runs the same selection without sending, for the
// dry run that precedes enabling it (the fleet-rewrite lesson, Aug 2026).
//
// Retention pair (18 Oct 2026): a week-one email and a "gone quiet" email,
// behind their own switch, RETENTION_EMAILS_ENABLED=1. The five above all
// need a trip in the last 30 days, so none reached the drivers who leave:
// 60% of those who stop do so in week one, and by day 14 most no longer
// open the app (retention read, 18 Oct 2026).
//
// Wording (18 Oct 2026): "mileage claim", never "deduction" (Tax tab rule);
// employees never hear about Self Assessment; Personal-mode and company-car
// drivers get no money figures.
//
// Why these five and not a newsletter: the app's value is that it needs no
// attention, so the emails that earn their place are the ones about the
// user's own numbers - unclassified trips waiting, a deduction milestone,
// the year-end figure, the January deadline - and the weekly recap only for
// people who cannot get it as a push.
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "../services/appEvents.js";
import {
  sendUnclassifiedTripsNudgeEmail,
  sendWeeklyRecapEmail,
  sendTaxMilestoneEmail,
  sendTaxYearEndSummaryEmail,
  sendSelfAssessmentDeadlineEmail,
  sendWeekOneEmail,
  sendGoneQuietEmail,
  sendWinBackEmail,
  type TaxEmailAudience,
} from "../services/email.js";
import { getPeriodRecap } from "../services/gamification.js";
import { calculateMileageDeduction, resolveMileageRates, getTaxYear } from "@mileclear/shared";
import { claimableWhere } from "../lib/claimableTrips.js";
import { UK_ONLY_USER } from "../lib/ukOnly.js";

const ENABLED = () => process.env.TRIGGERED_EMAILS_ENABLED === "1";
const RETENTION_ENABLED = () => process.env.RETENTION_EMAILS_ENABLED === "1";
const WINBACK_ENABLED = () => process.env.WINBACK_EMAILS_ENABLED === "1";
const SEND_DELAY_MS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

const UNCLASSIFIED_MIN_COUNT = 3;
// Above this the "ten seconds to sort them" line is untrue and the user has
// shown they do not classify; a nudge is noise. Dry run 30 Aug: median
// backlog across active users was 24, max 262.
const UNCLASSIFIED_MAX_COUNT = 40;
const UNCLASSIFIED_RECENT_MS = 14 * DAY_MS; // still capturing, not a dead backlog
const UNCLASSIFIED_COOLDOWN_MS = 13 * DAY_MS; // at most every other Sunday
const ACTIVE_WINDOW_MS = 30 * DAY_MS; // must have driven recently to hear from us
const MILESTONES_PENCE = [10000, 25000, 50000, 100000, 250000, 500000];
const MILESTONE_COOLDOWN_MS = 14 * DAY_MS; // one milestone email a fortnight, tops
// Below £1 the "worth up to" line reads as a joke (dry run 18 Oct: some at £0).
const UNCLASSIFIED_MIN_PENCE = 100;
export const WEEK_ONE_MIN_AGE_MS = 5 * DAY_MS;
export const WEEK_ONE_MAX_AGE_MS = 8 * DAY_MS;
export const GONE_QUIET_MIN_SILENCE_MS = 10 * DAY_MS;
// Older silences are long gone; this email is for drivers still within reach.
export const GONE_QUIET_MAX_SILENCE_MS = 21 * DAY_MS;
export const GONE_QUIET_MIN_TRIPS = 3;
export const GONE_QUIET_COOLDOWN_MS = 90 * DAY_MS;
// capture_lapsed already told them the permission is off; don't stack a second message.
export const GONE_QUIET_LAPSED_GAP_MS = 14 * DAY_MS;

export const EVENT = {
  unclassified: "email.unclassified_nudge_sent",
  recap: "email.weekly_recap_sent",
  milestone: "email.tax_milestone_sent",
  yearEnd: "email.tax_year_end_sent",
  saDeadline: "email.sa_deadline_sent",
  weekOne: "email.week_one_sent",
  goneQuiet: "email.gone_quiet_sent",
  winBack: "email.win_back_sent",
} as const;

// ── Hold-back (18 Oct 2026) ──────────────────────────────────────────
// One driver in ten is held back from each retention email (week one, gone
// quiet, win-back): their event is logged with held: true, nothing is sent,
// and the once-ever / cooldown checks treat it as sent, so the two groups
// stay comparable. scripts/retention-email-effect.mjs compares how many in
// each group record a trip in the 14 days after. Without it there is no way
// to tell whether these emails bring anyone back.
export const HOLDOUT_SHARE = 0.1;

/** Pure and stable: the same driver is always in or out for a given email. */
export function isHeldBack(userId: string, emailEvent: string): boolean {
  const h = crypto.createHash("sha256").update(`${emailEvent}:${userId}`).digest();
  return h.readUInt32BE(0) / 0x1_0000_0000 < HOLDOUT_SHARE;
}

// ── Win-back (18 Oct 2026) ────────────────────────────────────────────
// What changed, in plain words, with the day it reached drivers. A driver
// only hears about changes made after their last drive (stopped) or after
// they joined (never recorded), best first, four at most. ADD A LINE HERE
// when something drivers would care about ships, so later leavers hear it.
export type WinBackGroup = "stopped" | "never";
export const WIN_BACK_CHANGES: Array<{ live: string; text: string; for: WinBackGroup[] }> = [
  { live: "2026-10-16", text: "Drives are no longer saved twice, so your miles don't double", for: ["stopped"] },
  { live: "2026-10-12", text: "A drive your phone can't save straight away now waits and uploads later, instead of being lost", for: ["stopped"] },
  { live: "2026-10-13", text: "Starting a trip or a shift no longer wipes an earlier drive that hadn't saved yet", for: ["stopped"] },
  { live: "2026-10-10", text: "Home now tells you straight away if something is stopping it recording, and what to change", for: ["never", "stopped"] },
  { live: "2026-10-11", text: "A short guide walks you through your first trip", for: ["never"] },
  { live: "2026-10-11", text: "Add a past trip in a few taps, with a warning before you save a duplicate", for: ["stopped"] },
  { live: "2026-10-14", text: "A stray GPS point no longer adds extra miles to a trip", for: ["stopped"] },
  { live: "2026-10-11", text: "Add a drive by hand in a few taps if you'd rather not have it record by itself", for: ["never"] },
  { live: "2026-10-09", text: "A \"Still on your trip?\" reminder if you forget to press Arrived", for: ["stopped"] },
  { live: "2026-10-17", text: "Add a whole past shift in one go, with its trips and earnings", for: ["stopped"] },
  { live: "2026-10-17", text: "Each trip lists any roadworks on its route", for: ["stopped"] },
];
export const WIN_BACK_MAX_CHANGES = 4;
export const WIN_BACK_DAILY_CAP = 150; // first runs clear a ~480 backlog over about three days
export const WIN_BACK_STOPPED_SILENCE_MS = 30 * DAY_MS;
// The app was deleted (push.device_unregistered, lib/push.ts): no need to wait a month.
export const WIN_BACK_DELETED_SILENCE_MS = 3 * DAY_MS;
export const APP_DELETED_EVENT = "push.device_unregistered";
export const WIN_BACK_APP_UNOPENED_MS = 14 * DAY_MS;
export const WIN_BACK_MIN_TRIPS = 3;
export const WIN_BACK_NEVER_MIN_AGE_MS = 14 * DAY_MS; // the day 1/3/7 setup nudges go first
export const WIN_BACK_MAX_AGE_MS = 183 * DAY_MS;

/** Pure: the changes worth telling this driver, best first. */
export function winBackChanges(group: WinBackGroup, since: Date): string[] {
  return WIN_BACK_CHANGES
    .filter((c) => c.for.includes(group) && new Date(`${c.live}T00:00:00Z`).getTime() > since.getTime())
    .slice(0, WIN_BACK_MAX_CHANGES)
    .map((c) => c.text);
}

export type WinBackFacts = {
  now: Date;
  createdAt: Date;
  lastTripAt: Date | null;
  totalTrips: number;
  lastHeartbeatAt: Date | null;
  alreadySent: boolean;
  lastGoneQuietAt: Date | null;
  lastCaptureLapsedAt: Date | null;
  /** Set when the push service said the app was removed and the phone hasn't checked in since. */
  appDeletedAt: Date | null;
};

/** Pure: which win-back email (if any) this driver qualifies for. */
export function winBackGroup(f: WinBackFacts): WinBackGroup | null {
  const now = f.now.getTime();
  if (f.alreadySent) return null;
  if (f.lastGoneQuietAt && now - f.lastGoneQuietAt.getTime() < GONE_QUIET_COOLDOWN_MS) return null;
  if (f.lastCaptureLapsedAt && now - f.lastCaptureLapsedAt.getTime() < GONE_QUIET_LAPSED_GAP_MS) return null;
  if (f.totalTrips === 0 && !f.lastTripAt) {
    const age = now - f.createdAt.getTime();
    return age >= WIN_BACK_NEVER_MIN_AGE_MS && age <= WIN_BACK_MAX_AGE_MS ? "never" : null;
  }
  if (!f.lastTripAt || f.totalTrips < WIN_BACK_MIN_TRIPS) return null;
  const silence = now - f.lastTripAt.getTime();
  if (silence > WIN_BACK_MAX_AGE_MS) return null;
  // Deleted the app: they've told us they've stopped, so a few days is enough.
  if (f.appDeletedAt) return silence >= WIN_BACK_DELETED_SILENCE_MS ? "stopped" : null;
  if (silence < WIN_BACK_STOPPED_SILENCE_MS) return null;
  // "Definitely stopped": the app hasn't been opened for a fortnight either.
  if (f.lastHeartbeatAt && now - f.lastHeartbeatAt.getTime() < WIN_BACK_APP_UNOPENED_MS) return null;
  return "stopped";
}

/** "6 October" / "August", London time. */
export function winBackSinceLabel(group: WinBackGroup, d: Date): string {
  return group === "stopped"
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })
    : d.toLocaleDateString("en-GB", { month: "long", timeZone: "Europe/London" });
}

/** Who gets money figures and which tax wording. Null = no tax emails:
 *  Personal mode (driving for themselves) and company-car drivers (no
 *  mileage to claim). */
export function taxAudience(u: { workType: string; dashboardMode: string }): TaxEmailAudience | null {
  if (u.dashboardMode === "personal" || u.workType === "company") return null;
  if (u.workType === "employee") return "employee";
  return u.workType === "both" ? "mixed" : "self_employed";
}

/** Android tips only when the account has only been seen on Android, or
 *  signed up there when it has been seen on both. */
export function isAndroidUser(u: { platformsSeen: string | null; signupPlatform: string | null }): boolean {
  const seen = (u.platformsSeen ?? "").split(",").filter(Boolean);
  if (seen.includes("android") && !seen.includes("ios")) return true;
  if (seen.includes("android") && seen.includes("ios")) return u.signupPlatform === "android";
  return seen.length === 0 && u.signupPlatform === "android";
}

/** The removal still stands only if the phone hasn't checked in since (a reinstall would have). */
export function appDeletedSince(deletedAt: Date | null, lastHeartbeatAt: Date | null): Date | null {
  if (!deletedAt) return null;
  return lastHeartbeatAt && lastHeartbeatAt > deletedAt ? null : deletedAt;
}

/** "Tuesday 6 October", London time. */
export function londonDayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
}

export type GoneQuietFacts = {
  now: Date;
  createdAt: Date;
  lastTripAt: Date | null;
  totalTrips: number;
  lastGoneQuietAt: Date | null;
  lastCaptureLapsedAt: Date | null;
  /** The app is alive with push but can't see location in the background:
   *  the capture_lapsed push (activation.ts) names that exact cause at 14
   *  days, so this email stands aside rather than stack a second message. */
  capturedLapsedWillCover: boolean;
  /** The app was removed: "open MileClear" makes no sense, so the win-back email takes them. */
  appDeleted: boolean;
};

/** Pure: should this driver get the gone-quiet email now? */
export function decideGoneQuiet(f: GoneQuietFacts): boolean {
  if (!f.lastTripAt) return false;
  const silence = f.now.getTime() - f.lastTripAt.getTime();
  if (silence < GONE_QUIET_MIN_SILENCE_MS || silence > GONE_QUIET_MAX_SILENCE_MS) return false;
  if (f.now.getTime() - f.createdAt.getTime() < 14 * DAY_MS) return false;
  if (f.totalTrips < GONE_QUIET_MIN_TRIPS) return false;
  if (f.lastGoneQuietAt && f.now.getTime() - f.lastGoneQuietAt.getTime() < GONE_QUIET_COOLDOWN_MS) return false;
  if (f.lastCaptureLapsedAt && f.now.getTime() - f.lastCaptureLapsedAt.getTime() < GONE_QUIET_LAPSED_GAP_MS) return false;
  if (f.capturedLapsedWillCover) return false;
  if (f.appDeleted) return false;
  return true;
}

function ukNow(): { hour: number; day: number; date: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
    hour12: false, timeZone: "Europe/London",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour: parseInt(get("hour"), 10) % 24,
    day: dayMap[get("weekday")] ?? -1,
    date: parseInt(get("day"), 10),
    month: parseInt(get("month"), 10),
    year: parseInt(get("year"), 10),
  };
}

async function sentWithin(userId: string, type: string, ms: number): Promise<boolean> {
  const hit = await prisma.appEvent.findFirst({
    where: { type, userId, createdAt: { gte: new Date(Date.now() - ms) } },
    select: { id: true },
  });
  return hit !== null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Candidate = {
  id: string; email: string; displayName: string | null; workType: string; dashboardMode: string;
  employerMileageRatePence: number | null; employerMileageRatePenceAfter10k: number | null;
};
const CANDIDATE_SELECT = {
  id: true, email: true, displayName: true, workType: true, dashboardMode: true,
  employerMileageRatePence: true, employerMileageRatePenceAfter10k: true,
} as const;

/** Verified, opted-in, drove in the last 30 days. Every one of these emails
 *  quotes HMRC rates or a claim in pounds, so UK drivers only (23 Oct 2026). */
async function activeCandidates(extra: Record<string, unknown> = {}): Promise<Candidate[]> {
  return prisma.user.findMany({
    where: {
      emailVerified: true,
      marketingEmailsEnabled: true,
      ...UK_ONLY_USER,
      lastTripAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
      ...extra,
    },
    select: CANDIDATE_SELECT,
  });
}

// ── 1. Sunday evening: trips waiting to be classified ────────────────
async function unclassifiedTargets(): Promise<Array<{ user: Candidate; count: number; pence: number }>> {
  const out: Array<{ user: Candidate; count: number; pence: number }> = [];
  const taxYear = getTaxYear(new Date());
  // Personal-mode users track for themselves; business classification is
  // not a thing they are neglecting. Drivers with a push token already get
  // the Sunday 19:00 classify push about the same trips (classifyNudge.ts),
  // so the email only goes where that push can't (18 Oct 2026: 216 of 288
  // would have had both on one evening).
  for (const user of await activeCandidates({
    pushToken: null,
    NOT: [{ dashboardMode: "personal" }, { workType: "company" }],
  })) {
    const agg = await prisma.trip.aggregate({
      where: { userId: user.id, classification: "unclassified", isPhantomTrip: false },
      _count: { _all: true },
      _sum: { distanceMiles: true },
    });
    const count = agg._count._all;
    if (count < UNCLASSIFIED_MIN_COUNT || count > UNCLASSIFIED_MAX_COUNT) continue;
    const recent = await prisma.trip.count({
      where: { userId: user.id, classification: "unclassified", isPhantomTrip: false,
        startedAt: { gte: new Date(Date.now() - UNCLASSIFIED_RECENT_MS) } },
    });
    if (recent === 0) continue;
    if (await sentWithin(user.id, EVENT.unclassified, UNCLASSIFIED_COOLDOWN_MS)) continue;
    // Value only the miles that could be claimed (not vehicles someone else pays for).
    const claimable = await prisma.trip.aggregate({
      where: claimableWhere({ userId: user.id, classification: "unclassified", isPhantomTrip: false }),
      _sum: { distanceMiles: true },
    });
    const pence = calculateMileageDeduction("car", claimable._sum.distanceMiles ?? 0, {
      ...resolveMileageRates(user), taxYear,
    }).deductionPence;
    if (pence < UNCLASSIFIED_MIN_PENCE) continue;
    out.push({ user, count, pence });
  }
  return out;
}

export async function runUnclassifiedNudgeEmailJob(): Promise<void> {
  const t = ukNow();
  if (t.day !== 0 || t.hour !== 18) return; // Sunday 18:00-18:59 UK
  if (!ENABLED()) return;
  let sent = 0;
  for (const { user, count, pence } of await unclassifiedTargets()) {
    try {
      await sendUnclassifiedTripsNudgeEmail(user.email, user.displayName, { count, potentialClaimPence: pence }, user.id);
      logEvent(EVENT.unclassified, user.id, { count, potentialClaimPence: pence });
      sent++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[triggeredEmails] unclassified nudge failed for ${user.id}:`, err);
    }
  }
  if (sent) console.log(`[triggeredEmails] unclassified nudge: sent ${sent}`);
}

// ── 2. Monday morning: the weekly recap, only where the push cannot reach ──
async function recapTargets(): Promise<Array<{ user: Candidate; recap: Awaited<ReturnType<typeof getPeriodRecap>> }>> {
  const out: Array<{ user: Candidate; recap: Awaited<ReturnType<typeof getPeriodRecap>> }> = [];
  const lastWeek = new Date(Date.now() - 3 * DAY_MS);
  for (const user of await activeCandidates({ pushToken: null })) {
    if (await sentWithin(user.id, EVENT.recap, 6 * DAY_MS)) continue;
    const recap = await getPeriodRecap(user.id, "weekly", lastWeek);
    if (recap.totalTrips === 0) continue;
    out.push({ user, recap });
  }
  return out;
}

export async function runWeeklyRecapEmailJob(): Promise<void> {
  const t = ukNow();
  if (t.day !== 1 || t.hour !== 8) return; // Monday 08:00-08:59 UK, same slot as the push
  if (!ENABLED()) return;
  let sent = 0;
  for (const { user, recap } of await recapTargets()) {
    try {
      await sendWeeklyRecapEmail(user.email, user.displayName, {
        weekLabel: recap.label, trips: recap.totalTrips, miles: recap.totalMiles,
        claimPence: taxAudience(user) ? recap.deductionPence : null,
      }, user.id);
      logEvent(EVENT.recap, user.id, { trips: recap.totalTrips, miles: recap.totalMiles });
      sent++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[triggeredEmails] weekly recap failed for ${user.id}:`, err);
    }
  }
  if (sent) console.log(`[triggeredEmails] weekly recap email: sent ${sent}`);
}

// ── 3. Daily: a deduction milestone crossed this tax year ────────────
async function milestoneTargets(seed = false): Promise<Array<{ user: Candidate; taxYear: string; milestone: number; deductionPence: number; businessMiles: number }>> {
  const out: Array<{ user: Candidate; taxYear: string; milestone: number; deductionPence: number; businessMiles: number }> = [];
  const taxYear = getTaxYear(new Date());
  const summaries = await prisma.mileageSummary.findMany({
    where: { taxYear, deductionPence: { gte: MILESTONES_PENCE[0] } },
    select: { userId: true, deductionPence: true, businessMiles: true },
  });
  if (summaries.length === 0) return out;
  const users = await activeCandidates({ id: { in: summaries.map((s) => s.userId) } });
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const s of summaries) {
    const user = byId.get(s.userId);
    if (!user || !taxAudience(user)) continue;
    const crossed = MILESTONES_PENCE.filter((m) => s.deductionPence >= m);
    const top = crossed[crossed.length - 1];
    const already = await prisma.appEvent.findMany({
      where: { type: EVENT.milestone, userId: user.id },
      select: { metadata: true },
    });
    const sentMilestones = new Set(
      already.map((e) => (e.metadata as { milestone?: number; taxYear?: string } | null))
        .filter((m) => m?.taxYear === taxYear).map((m) => m!.milestone)
    );
    if (sentMilestones.has(top)) continue;
    // First sight of this user this tax year: they crossed `top` at some
    // point before we started watching. Congratulating them now would be
    // stale (dry run 30 Aug: 174 users on day one). Record the baseline
    // silently; only crossings from here on get an email.
    if (sentMilestones.size === 0 && seed) {
      logEvent(EVENT.milestone, user.id, { milestone: top, taxYear, deductionPence: s.deductionPence, seeded: true });
      continue;
    }
    if (await sentWithin(user.id, EVENT.milestone, MILESTONE_COOLDOWN_MS)) continue;
    out.push({ user, taxYear, milestone: top, deductionPence: s.deductionPence, businessMiles: s.businessMiles });
  }
  return out;
}

export async function runTaxMilestoneEmailJob(): Promise<void> {
  const t = ukNow();
  if (t.hour !== 9) return; // 09:00-09:59 UK daily
  if (!ENABLED()) return;
  let sent = 0;
  for (const m of await milestoneTargets(true)) {
    try {
      await sendTaxMilestoneEmail(m.user.email, m.user.displayName, {
        taxYear: m.taxYear, milestonePence: m.milestone, claimPence: m.deductionPence, businessMiles: m.businessMiles,
        audience: taxAudience(m.user)!,
      }, m.user.id);
      logEvent(EVENT.milestone, m.user.id, { milestone: m.milestone, taxYear: m.taxYear, deductionPence: m.deductionPence });
      sent++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[triggeredEmails] tax milestone failed for ${m.user.id}:`, err);
    }
  }
  if (sent) console.log(`[triggeredEmails] tax milestone: sent ${sent}`);
}

// ── 4. 6-12 April: the year that just closed ─────────────────────────
async function yearEndTargets(): Promise<Array<{ user: Candidate; taxYear: string; businessMiles: number; trips: number; deductionPence: number }>> {
  const out: Array<{ user: Candidate; taxYear: string; businessMiles: number; trips: number; deductionPence: number }> = [];
  const closedYear = getTaxYear(new Date(Date.now() - 10 * DAY_MS)); // ten days ago was still last tax year
  const summaries = await prisma.mileageSummary.findMany({
    where: { taxYear: closedYear, deductionPence: { gt: 0 } },
    select: { userId: true, deductionPence: true, businessMiles: true },
  });
  if (summaries.length === 0) return out;
  const users = await prisma.user.findMany({
    where: { id: { in: summaries.map((s) => s.userId) }, emailVerified: true, marketingEmailsEnabled: true, ...UK_ONLY_USER },
    select: CANDIDATE_SELECT,
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const s of summaries) {
    const user = byId.get(s.userId);
    if (!user || !taxAudience(user)) continue;
    if (await sentWithin(user.id, EVENT.yearEnd, 300 * DAY_MS)) continue;
    const trips = await prisma.trip.count({
      where: { userId: user.id, classification: "business", isPhantomTrip: false,
        startedAt: { gte: new Date(`${closedYear.slice(0, 4)}-04-06T00:00:00Z`) } },
    });
    out.push({ user, taxYear: closedYear, businessMiles: s.businessMiles, trips, deductionPence: s.deductionPence });
  }
  return out;
}

export async function runTaxYearEndEmailJob(): Promise<void> {
  const t = ukNow();
  if (!(t.month === 4 && t.date >= 6 && t.date <= 12 && t.hour === 9)) return;
  if (!ENABLED()) return;
  let sent = 0;
  for (const y of await yearEndTargets()) {
    try {
      await sendTaxYearEndSummaryEmail(y.user.email, y.user.displayName, {
        taxYear: y.taxYear, businessMiles: y.businessMiles, trips: y.trips, claimPence: y.deductionPence,
        audience: taxAudience(y.user)!,
      }, y.user.id);
      logEvent(EVENT.yearEnd, y.user.id, { taxYear: y.taxYear, deductionPence: y.deductionPence });
      sent++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[triggeredEmails] year-end failed for ${y.user.id}:`, err);
    }
  }
  if (sent) console.log(`[triggeredEmails] tax year-end: sent ${sent}`);
}

// ── 5. 31 January: thirty days out, then seven ───────────────────────
function saDeadline(t: ReturnType<typeof ukNow>): { daysLeft: 30 | 7; dateLabel: string; returnYear: string } | null {
  // Deadline is 31 Jan of year Y for the tax year that ended 5 Apr of Y-1.
  const isThirty = t.month === 1 && t.date === 1;
  const isSeven = t.month === 1 && t.date === 24;
  if (!isThirty && !isSeven) return null;
  const y = t.year;
  const returnYear = `${y - 2}-${String(y - 1).slice(2)}`;
  return { daysLeft: isThirty ? 30 : 7, dateLabel: `31 January ${y}`, returnYear };
}

async function saDeadlineTargets(t: ReturnType<typeof ukNow>): Promise<Array<{ user: Candidate; daysLeft: 30 | 7; dateLabel: string; returnYear: string; deductionPence: number }>> {
  const out: Array<{ user: Candidate; daysLeft: 30 | 7; dateLabel: string; returnYear: string; deductionPence: number }> = [];
  const d = saDeadline(t);
  if (!d) return out;
  const summaries = await prisma.mileageSummary.findMany({
    where: { taxYear: d.returnYear, deductionPence: { gt: 0 } },
    select: { userId: true, deductionPence: true },
  });
  if (summaries.length === 0) return out;
  const users = await prisma.user.findMany({
    where: { id: { in: summaries.map((s) => s.userId) }, emailVerified: true, marketingEmailsEnabled: true, ...UK_ONLY_USER },
    select: CANDIDATE_SELECT,
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const s of summaries) {
    const user = byId.get(s.userId);
    const audience = user ? taxAudience(user) : null;
    if (!user || (audience !== "self_employed" && audience !== "mixed")) continue;
    if (await sentWithin(user.id, EVENT.saDeadline, (d.daysLeft === 30 ? 300 : 20) * DAY_MS)) continue;
    out.push({ user, ...d, deductionPence: s.deductionPence });
  }
  return out;
}

export async function runSaDeadlineEmailJob(): Promise<void> {
  const t = ukNow();
  if (t.hour !== 9) return;
  if (!saDeadline(t)) return;
  if (!ENABLED()) return;
  let sent = 0;
  for (const x of await saDeadlineTargets(t)) {
    try {
      await sendSelfAssessmentDeadlineEmail(x.user.email, x.user.displayName, {
        deadlineLabel: "The Self Assessment filing deadline",
        dateLabel: x.dateLabel,
        daysLeft: x.daysLeft,
        actionLine: `file your ${x.returnYear} return and pay any tax due`,
        returnYear: x.returnYear,
        claimPence: x.deductionPence,
        audience: taxAudience(x.user)!,
      }, x.user.id);
      logEvent(EVENT.saDeadline, x.user.id, { daysLeft: x.daysLeft, returnYear: x.returnYear });
      sent++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[triggeredEmails] SA deadline failed for ${x.user.id}:`, err);
    }
  }
  if (sent) console.log(`[triggeredEmails] SA deadline (${sent ? "sent" : ""} ${sent})`);
}

// ── 6. Week one: what the first days recorded (10:00 UK daily) ─────────
type WeekOneTarget = { user: Candidate; trips: number; miles: number; claimPence: number | null; toSort: number };

async function weekOneTargets(now = new Date()): Promise<WeekOneTarget[]> {
  const out: WeekOneTarget[] = [];
  const users = await prisma.user.findMany({
    where: {
      emailVerified: true,
      marketingEmailsEnabled: true,
      ...UK_ONLY_USER,
      createdAt: { gte: new Date(now.getTime() - WEEK_ONE_MAX_AGE_MS), lte: new Date(now.getTime() - WEEK_ONE_MIN_AGE_MS) },
      lastTripAt: { not: null },
    },
    select: { ...CANDIDATE_SELECT, createdAt: true },
  });
  if (users.length === 0) return out;
  const ids = users.map((u) => u.id);
  // Only trips driven since joining: a driver who back-filled months of
  // past trips by hand must not read "your first week: 180 trips".
  const earliestJoin = new Date(Math.min(...users.map((u) => u.createdAt.getTime())));
  const [sent, trips] = await Promise.all([
    prisma.appEvent.findMany({ where: { type: EVENT.weekOne, userId: { in: ids } }, select: { userId: true } }),
    prisma.trip.findMany({
      where: { userId: { in: ids }, isPhantomTrip: false, startedAt: { gte: earliestJoin } },
      select: { userId: true, startedAt: true, distanceMiles: true, classification: true },
    }),
  ]);
  const claimable = await prisma.trip.findMany({
    where: claimableWhere({ userId: { in: ids }, isPhantomTrip: false, classification: "business", startedAt: { gte: earliestJoin } }),
    select: { userId: true, startedAt: true, distanceMiles: true },
  });
  const done = new Set(sent.map((e) => e.userId));
  const taxYear = getTaxYear(now);
  for (const u of users) {
    if (done.has(u.id)) continue;
    const mine = trips.filter((t) => t.userId === u.id && t.startedAt >= u.createdAt);
    if (mine.length === 0) continue;
    const audience = taxAudience(u);
    const businessMiles = claimable
      .filter((t) => t.userId === u.id && t.startedAt >= u.createdAt)
      .reduce((sum, t) => sum + t.distanceMiles, 0);
    out.push({
      user: u,
      trips: mine.length,
      miles: mine.reduce((sum, t) => sum + t.distanceMiles, 0),
      claimPence: audience
        ? calculateMileageDeduction("car", businessMiles, { ...resolveMileageRates(u), taxYear }).deductionPence
        : null,
      // Personal-mode and company-car drivers have no mileage claim to sort towards.
      toSort: audience ? mine.filter((t) => t.classification === "unclassified").length : 0,
    });
  }
  return out;
}

export async function runWeekOneEmailJob(): Promise<void> {
  if (ukNow().hour !== 10) return; // 10:00-10:59 UK daily
  if (!RETENTION_ENABLED()) return;
  let sent = 0;
  for (const w of await weekOneTargets()) {
    if (isHeldBack(w.user.id, EVENT.weekOne)) {
      logEvent(EVENT.weekOne, w.user.id, { held: true, trips: w.trips, toSort: w.toSort });
      continue;
    }
    try {
      await sendWeekOneEmail(w.user.email, w.user.displayName, {
        trips: w.trips, miles: w.miles, claimPence: w.claimPence, toSort: w.toSort,
      }, w.user.id);
      logEvent(EVENT.weekOne, w.user.id, { trips: w.trips, toSort: w.toSort });
      sent++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[triggeredEmails] week one failed for ${w.user.id}:`, err);
    }
  }
  if (sent) console.log(`[triggeredEmails] week one: sent ${sent}`);
}

// ── 7. Gone quiet: 10-21 days with no drive (17:00 UK daily) ───────────
type GoneQuietTarget = { user: Candidate; lastTripAt: Date; android: boolean; claimPence: number | null };

async function goneQuietTargets(now = new Date()): Promise<GoneQuietTarget[]> {
  const out: GoneQuietTarget[] = [];
  const users = await prisma.user.findMany({
    where: {
      emailVerified: true,
      marketingEmailsEnabled: true,
      ...UK_ONLY_USER,
      createdAt: { lte: new Date(now.getTime() - 14 * DAY_MS) },
      lastTripAt: {
        gte: new Date(now.getTime() - GONE_QUIET_MAX_SILENCE_MS),
        lte: new Date(now.getTime() - GONE_QUIET_MIN_SILENCE_MS),
      },
    },
    select: {
      ...CANDIDATE_SELECT, createdAt: true, lastTripAt: true, platformsSeen: true, signupPlatform: true,
      lastHeartbeatAt: true, pushToken: true, bgLocationPermission: true,
    },
  });
  if (users.length === 0) return out;
  const ids = users.map((u) => u.id);
  const [counts, events, summaries] = await Promise.all([
    prisma.trip.groupBy({ by: ["userId"], where: { userId: { in: ids }, isPhantomTrip: false }, _count: { _all: true } }),
    prisma.appEvent.findMany({
      where: { userId: { in: ids }, type: { in: [EVENT.goneQuiet, "notification.capture_lapsed", APP_DELETED_EVENT] } },
      select: { userId: true, type: true, createdAt: true },
    }),
    prisma.mileageSummary.findMany({ where: { userId: { in: ids }, taxYear: getTaxYear(now) }, select: { userId: true, deductionPence: true } }),
  ]);
  const countBy = new Map(counts.map((c) => [c.userId, c._count._all]));
  const claimBy = new Map(summaries.map((m) => [m.userId, m.deductionPence]));
  const latest = (userId: string, type: string): Date | null => {
    const hits = events.filter((e) => e.userId === userId && e.type === type).map((e) => e.createdAt.getTime());
    return hits.length ? new Date(Math.max(...hits)) : null;
  };
  for (const u of users) {
    const ok = decideGoneQuiet({
      now,
      createdAt: u.createdAt,
      lastTripAt: u.lastTripAt,
      totalTrips: countBy.get(u.id) ?? 0,
      lastGoneQuietAt: latest(u.id, EVENT.goneQuiet),
      lastCaptureLapsedAt: latest(u.id, "notification.capture_lapsed"),
      capturedLapsedWillCover:
        !!u.pushToken &&
        !!u.lastHeartbeatAt &&
        now.getTime() - u.lastHeartbeatAt.getTime() < 14 * DAY_MS &&
        u.bgLocationPermission !== "granted",
      appDeleted: appDeletedSince(latest(u.id, APP_DELETED_EVENT), u.lastHeartbeatAt) !== null,
    });
    if (!ok) continue;
    out.push({
      user: u,
      lastTripAt: u.lastTripAt!,
      android: isAndroidUser(u),
      claimPence: taxAudience(u) ? (claimBy.get(u.id) ?? 0) : null,
    });
  }
  return out;
}

export async function runGoneQuietEmailJob(): Promise<void> {
  if (ukNow().hour !== 17) return; // 17:00-17:59 UK daily
  if (!RETENTION_ENABLED()) return;
  let sent = 0;
  for (const g of await goneQuietTargets()) {
    if (isHeldBack(g.user.id, EVENT.goneQuiet)) {
      logEvent(EVENT.goneQuiet, g.user.id, { held: true, lastTripAt: g.lastTripAt.toISOString(), android: g.android });
      continue;
    }
    try {
      await sendGoneQuietEmail(g.user.email, g.user.displayName, {
        lastTripLabel: londonDayLabel(g.lastTripAt), android: g.android, claimPence: g.claimPence,
      }, g.user.id);
      logEvent(EVENT.goneQuiet, g.user.id, { lastTripAt: g.lastTripAt.toISOString(), android: g.android });
      sent++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[triggeredEmails] gone quiet failed for ${g.user.id}:`, err);
    }
  }
  if (sent) console.log(`[triggeredEmails] gone quiet: sent ${sent}`);
}

// ── 8. Win-back: stopped for good, or never recorded (11:00 UK daily) ──
type WinBackTarget = {
  user: Candidate; group: WinBackGroup; since: Date; sinceLabel: string; changes: string[]; claimPence: number | null; appDeleted: boolean;
};

async function winBackTargets(now = new Date()): Promise<WinBackTarget[]> {
  const out: WinBackTarget[] = [];
  const oldest = new Date(now.getTime() - WIN_BACK_MAX_AGE_MS);
  const deletedIds = (await prisma.appEvent.findMany({
    where: { type: APP_DELETED_EVENT, createdAt: { gte: oldest }, userId: { not: null } },
    select: { userId: true },
    distinct: ["userId"],
  })).map((e) => e.userId!);
  const users = await prisma.user.findMany({
    where: {
      emailVerified: true,
      marketingEmailsEnabled: true,
      ...UK_ONLY_USER,
      OR: [
        // Never recorded: joined 14 days to 6 months ago.
        { lastTripAt: null, createdAt: { gte: oldest, lte: new Date(now.getTime() - WIN_BACK_NEVER_MIN_AGE_MS) } },
        // Stopped: last drive 30 days to 6 months ago.
        { lastTripAt: { gte: oldest, lte: new Date(now.getTime() - WIN_BACK_STOPPED_SILENCE_MS) } },
        // Deleted the app: last drive 3+ days ago.
        ...(deletedIds.length
          ? [{ id: { in: deletedIds }, lastTripAt: { gte: oldest, lte: new Date(now.getTime() - WIN_BACK_DELETED_SILENCE_MS) } }]
          : []),
      ],
    },
    select: { ...CANDIDATE_SELECT, createdAt: true, lastTripAt: true, lastHeartbeatAt: true },
  });
  if (users.length === 0) return out;
  const ids = users.map((u) => u.id);
  const [counts, events, summaries] = await Promise.all([
    prisma.trip.groupBy({ by: ["userId"], where: { userId: { in: ids }, isPhantomTrip: false }, _count: { _all: true } }),
    prisma.appEvent.findMany({
      where: { userId: { in: ids }, type: { in: [EVENT.winBack, EVENT.goneQuiet, "notification.capture_lapsed", APP_DELETED_EVENT] } },
      select: { userId: true, type: true, createdAt: true },
    }),
    prisma.mileageSummary.findMany({ where: { userId: { in: ids }, taxYear: getTaxYear(now) }, select: { userId: true, deductionPence: true } }),
  ]);
  const countBy = new Map(counts.map((c) => [c.userId, c._count._all]));
  const claimBy = new Map(summaries.map((m) => [m.userId, m.deductionPence]));
  const latest = (userId: string, type: string): Date | null => {
    const hits = events.filter((e) => e.userId === userId && e.type === type).map((e) => e.createdAt.getTime());
    return hits.length ? new Date(Math.max(...hits)) : null;
  };
  for (const u of users) {
    const appDeletedAt = appDeletedSince(latest(u.id, APP_DELETED_EVENT), u.lastHeartbeatAt);
    const group = winBackGroup({
      now,
      createdAt: u.createdAt,
      lastTripAt: u.lastTripAt,
      totalTrips: countBy.get(u.id) ?? 0,
      lastHeartbeatAt: u.lastHeartbeatAt,
      alreadySent: latest(u.id, EVENT.winBack) !== null,
      lastGoneQuietAt: latest(u.id, EVENT.goneQuiet),
      lastCaptureLapsedAt: latest(u.id, "notification.capture_lapsed"),
      appDeletedAt,
    });
    if (!group) continue;
    const since = group === "stopped" ? u.lastTripAt! : u.createdAt;
    const changes = winBackChanges(group, since);
    if (changes.length === 0) continue; // nothing new to tell them
    out.push({
      user: u,
      group,
      since,
      sinceLabel: winBackSinceLabel(group, since),
      changes,
      claimPence: group === "stopped" && taxAudience(u) ? (claimBy.get(u.id) ?? 0) : null,
      appDeleted: appDeletedAt !== null,
    });
  }
  // Stopped drivers first, most recent first: the people likeliest to come
  // back go in the first batch.
  return out.sort((a, b) =>
    a.group !== b.group ? (a.group === "stopped" ? -1 : 1) : b.since.getTime() - a.since.getTime()
  );
}

export async function runWinBackEmailJob(): Promise<void> {
  if (ukNow().hour !== 11) return; // 11:00-11:59 UK daily
  if (!WINBACK_ENABLED()) return;
  // The cap is per day, counted from the events, so the half-hourly ticks
  // inside the 11:00 hour can't send more than WIN_BACK_DAILY_CAP between them.
  const sentToday = await prisma.appEvent.count({ where: { type: EVENT.winBack, createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) } } });
  const room = WIN_BACK_DAILY_CAP - sentToday;
  if (room <= 0) return;
  let sent = 0;
  for (const w of (await winBackTargets()).slice(0, room)) {
    if (isHeldBack(w.user.id, EVENT.winBack)) {
      await prisma.appEvent.create({ data: { type: EVENT.winBack, userId: w.user.id, metadata: { held: true, group: w.group, changes: w.changes.length } } });
      continue;
    }
    try {
      await sendWinBackEmail(w.user.email, w.user.displayName, {
        group: w.group, sinceLabel: w.sinceLabel, changes: w.changes, claimPence: w.claimPence, appDeleted: w.appDeleted,
      }, w.user.id);
      await prisma.appEvent.create({ data: { type: EVENT.winBack, userId: w.user.id, metadata: { group: w.group, changes: w.changes.length, appDeleted: w.appDeleted } } });
      sent++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[triggeredEmails] win-back failed for ${w.user.id}:`, err);
    }
  }
  if (sent) console.log(`[triggeredEmails] win-back: sent ${sent}`);
}

/** Dry run: who would each job email right now, ignoring the time windows. */
export async function previewTriggeredEmails(): Promise<{
  enabled: boolean;
  unclassified: Array<{ userId: string; count: number; pence: number }>;
  recap: Array<{ userId: string; trips: number; miles: number }>;
  milestone: Array<{ userId: string; milestone: number; deductionPence: number }>;
  yearEnd: number;
  saDeadline: number;
  retentionEnabled: boolean;
  weekOne: Array<{ userId: string; trips: number; toSort: number; claimPence: number | null }>;
  goneQuiet: Array<{ userId: string; lastTripAt: string; android: boolean; claimPence: number | null }>;
  winBackEnabled: boolean;
  winBack: Array<{ userId: string; group: WinBackGroup; sinceLabel: string; changes: number; claimPence: number | null }>;
}> {
  const t = ukNow();
  const [u, r, m, y, s, w, g] = await Promise.all([
    unclassifiedTargets(), recapTargets(), milestoneTargets(), yearEndTargets(), saDeadlineTargets(t),
    weekOneTargets(), goneQuietTargets(),
  ]);
  const wb = await winBackTargets();
  return {
    enabled: ENABLED(),
    unclassified: u.map((x) => ({ userId: x.user.id, count: x.count, pence: x.pence })),
    recap: r.map((x) => ({ userId: x.user.id, trips: x.recap.totalTrips, miles: Math.round(x.recap.totalMiles) })),
    milestone: m.map((x) => ({ userId: x.user.id, milestone: x.milestone, deductionPence: x.deductionPence })),
    yearEnd: y.length,
    saDeadline: s.length,
    retentionEnabled: RETENTION_ENABLED(),
    weekOne: w.map((x) => ({ userId: x.user.id, trips: x.trips, toSort: x.toSort, claimPence: x.claimPence })),
    goneQuiet: g.map((x) => ({ userId: x.user.id, lastTripAt: x.lastTripAt.toISOString(), android: x.android, claimPence: x.claimPence })),
    winBackEnabled: WINBACK_ENABLED(),
    winBack: wb.map((x) => ({ userId: x.user.id, group: x.group, sinceLabel: x.sinceLabel, changes: x.changes.length, claimPence: x.claimPence })),
  };
}
