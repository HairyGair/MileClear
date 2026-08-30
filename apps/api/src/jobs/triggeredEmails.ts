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
// Why these five and not a newsletter: the app's value is that it needs no
// attention, so the emails that earn their place are the ones about the
// user's own numbers - unclassified trips waiting, a deduction milestone,
// the year-end figure, the January deadline - and the weekly recap only for
// people who cannot get it as a push.
import { prisma } from "../lib/prisma.js";
import { logEvent } from "../services/appEvents.js";
import {
  sendUnclassifiedTripsNudgeEmail,
  sendWeeklyRecapEmail,
  sendTaxMilestoneEmail,
  sendTaxYearEndSummaryEmail,
  sendSelfAssessmentDeadlineEmail,
} from "../services/email.js";
import { getPeriodRecap } from "../services/gamification.js";
import { calculateMileageDeduction, resolveMileageRates, getTaxYear } from "@mileclear/shared";

const ENABLED = () => process.env.TRIGGERED_EMAILS_ENABLED === "1";
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

export const EVENT = {
  unclassified: "email.unclassified_nudge_sent",
  recap: "email.weekly_recap_sent",
  milestone: "email.tax_milestone_sent",
  yearEnd: "email.tax_year_end_sent",
  saDeadline: "email.sa_deadline_sent",
} as const;

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
  id: string; email: string; displayName: string | null; workType: string;
  employerMileageRatePence: number | null; employerMileageRatePenceAfter10k: number | null;
};
const CANDIDATE_SELECT = {
  id: true, email: true, displayName: true, workType: true,
  employerMileageRatePence: true, employerMileageRatePenceAfter10k: true,
} as const;

/** Verified, opted-in, drove in the last 30 days. */
async function activeCandidates(extra: Record<string, unknown> = {}): Promise<Candidate[]> {
  return prisma.user.findMany({
    where: {
      emailVerified: true,
      marketingEmailsEnabled: true,
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
  // not a thing they are neglecting.
  for (const user of await activeCandidates({ NOT: { dashboardMode: "personal" } })) {
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
    const pence = calculateMileageDeduction("car", agg._sum.distanceMiles ?? 0, {
      ...resolveMileageRates(user), taxYear,
    }).deductionPence;
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
      await sendUnclassifiedTripsNudgeEmail(user.email, user.displayName, { count, potentialDeductionPence: pence }, user.id);
      logEvent(EVENT.unclassified, user.id, { count, potentialDeductionPence: pence });
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
        weekLabel: recap.label, trips: recap.totalTrips, miles: recap.totalMiles, deductionPence: recap.deductionPence,
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
    if (!user) continue;
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
        taxYear: m.taxYear, milestonePence: m.milestone, deductionPence: m.deductionPence, businessMiles: m.businessMiles,
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
    where: { id: { in: summaries.map((s) => s.userId) }, emailVerified: true, marketingEmailsEnabled: true },
    select: CANDIDATE_SELECT,
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const s of summaries) {
    const user = byId.get(s.userId);
    if (!user) continue;
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
        taxYear: y.taxYear, businessMiles: y.businessMiles, trips: y.trips, deductionPence: y.deductionPence,
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
    where: { id: { in: summaries.map((s) => s.userId) }, emailVerified: true, marketingEmailsEnabled: true },
    select: CANDIDATE_SELECT,
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const s of summaries) {
    const user = byId.get(s.userId);
    if (!user) continue;
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
        deductionPence: x.deductionPence,
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

/** Dry run: who would each job email right now, ignoring the time windows. */
export async function previewTriggeredEmails(): Promise<{
  enabled: boolean;
  unclassified: Array<{ userId: string; count: number; pence: number }>;
  recap: Array<{ userId: string; trips: number; miles: number }>;
  milestone: Array<{ userId: string; milestone: number; deductionPence: number }>;
  yearEnd: number;
  saDeadline: number;
}> {
  const t = ukNow();
  const [u, r, m, y, s] = await Promise.all([
    unclassifiedTargets(), recapTargets(), milestoneTargets(), yearEndTargets(), saDeadlineTargets(t),
  ]);
  return {
    enabled: ENABLED(),
    unclassified: u.map((x) => ({ userId: x.user.id, count: x.count, pence: x.pence })),
    recap: r.map((x) => ({ userId: x.user.id, trips: x.recap.totalTrips, miles: Math.round(x.recap.totalMiles) })),
    milestone: m.map((x) => ({ userId: x.user.id, milestone: x.milestone, deductionPence: x.deductionPence })),
    yearEnd: y.length,
    saDeadline: s.length,
  };
}
