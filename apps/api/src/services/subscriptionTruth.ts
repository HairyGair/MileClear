// One source of truth for "who is paying us, and how much".
//
// Admin revenue review, 21 Aug 2026. Every admin view counted `isPremium`
// rows and multiplied by £4.99. That number mixed four things that are
// not revenue - admin comp grants, App Review's sandbox subscription,
// referral credit, and the monthly price applied to annual subscribers -
// and the Revenue tab showed an MRR about 70% above what customers pay.
//
// This module classifies every Pro user into exactly one bucket and
// derives MRR from the paying buckets only. Revenue, Overview, Funnel and
// the Users list all read from here so they cannot disagree.
//
// Period: the webhooks stamp `subscriptionProductId` from 21 Aug 2026.
// Rows written before that have no product id, so the period is inferred
// from how far out `premiumExpiresAt` sits - a monthly subscription is
// never more than ~31 days from expiry; anything further out is annual.
// An annual subscriber inside their last 45 days reads as monthly until
// their renewal stamps the product id. The result says when it inferred.

import { prisma } from "../lib/prisma.js";
import {
  PREMIUM_PRICE_MONTHLY_PENCE,
  PREMIUM_PRICE_ANNUAL_PENCE,
} from "@mileclear/shared";

export type BillingPeriod = "monthly" | "annual";
/** Why a user has Pro. `null` = not Pro. */
export type ProSource = "paying" | "comp" | "referral" | "sandbox" | "team";

const DAY_MS = 24 * 60 * 60 * 1000;
const ANNUAL_HORIZON_DAYS = 45;

export function inferPeriod(
  productId: string | null | undefined,
  premiumExpiresAt: Date | null | undefined,
  now: Date = new Date()
): { period: BillingPeriod; inferred: boolean } {
  if (productId) {
    return { period: /annual|year/i.test(productId) ? "annual" : "monthly", inferred: false };
  }
  if (
    premiumExpiresAt &&
    premiumExpiresAt.getTime() - now.getTime() > ANNUAL_HORIZON_DAYS * DAY_MS
  ) {
    return { period: "annual", inferred: true };
  }
  return { period: "monthly", inferred: true };
}

export function monthlyEquivalentPence(period: BillingPeriod): number {
  return period === "annual"
    ? Math.round(PREMIUM_PRICE_ANNUAL_PENCE / 12)
    : PREMIUM_PRICE_MONTHLY_PENCE;
}

export interface ProUserRow {
  isPremium: boolean;
  premiumExpiresAt: Date | null;
  stripeSubscriptionId: string | null;
  appleOriginalTransactionId: string | null;
  subscriptionProductId?: string | null;
  referralProUntil: Date | null;
  /** Active Milesheet membership (set by callers that joined it). */
  hasTeamMembership?: boolean;
}

/**
 * Classify one user. Pure, so the Users list can call it per row with a
 * preloaded sandbox set. A flagged-premium row whose expiry has passed is
 * not Pro (matches resolvePremiumStatus) and returns null.
 */
export function classifyProSource(
  u: ProUserRow,
  sandboxTxns: ReadonlySet<string>,
  now: Date = new Date()
): ProSource | null {
  const subscriptionActive =
    u.isPremium && (u.premiumExpiresAt == null || u.premiumExpiresAt.getTime() > now.getTime());
  if (subscriptionActive) {
    if (u.stripeSubscriptionId) return "paying";
    if (u.appleOriginalTransactionId) {
      return sandboxTxns.has(u.appleOriginalTransactionId) ? "sandbox" : "paying";
    }
    return "comp";
  }
  if (u.referralProUntil && u.referralProUntil.getTime() > now.getTime()) return "referral";
  if (u.hasTeamMembership) return "team";
  return null;
}

/** Apple transaction ids ever seen on a sandbox webhook. Apple ids are
 *  environment-specific, so one sandbox sighting is definitive. */
export async function loadSandboxTxnIds(): Promise<Set<string>> {
  const rows = await prisma.appleIapWebhookLog.findMany({
    where: { environment: "sandbox", originalTransactionId: { not: null } },
    distinct: ["originalTransactionId"],
    select: { originalTransactionId: true },
  });
  return new Set(rows.map((r) => r.originalTransactionId!).filter(Boolean));
}

export interface SubscriptionTruth {
  mrrPence: number;
  payingSubscribers: number;
  breakdown: {
    stripeMonthly: number;
    stripeAnnual: number;
    appleMonthly: number;
    appleAnnual: number;
    appleSandbox: number;
    comp: number;
    referral: number;
    /** Active team-membership drivers. Pilot orgs pay nothing, so this is
     *  visibility, not revenue. */
    team: number;
    /** isPremium=true rows whose expiry has passed - flagged but not active. */
    expiredFlag: number;
  };
  /** Paying rows whose period was inferred from expiry rather than read
   *  from a stamped product id. Falls to zero as webhooks stamp rows. */
  inferredPeriods: number;
  proTotal: number;
}

export async function getSubscriptionTruth(now: Date = new Date()): Promise<SubscriptionTruth> {
  const [premiumRows, referral, sandboxTxns, team] = await Promise.all([
    prisma.user.findMany({
      where: { isPremium: true },
      select: {
        isPremium: true,
        premiumExpiresAt: true,
        stripeSubscriptionId: true,
        appleOriginalTransactionId: true,
        subscriptionProductId: true,
        referralProUntil: true,
      },
    }),
    prisma.user.count({ where: { isPremium: false, referralProUntil: { gt: now } } }),
    loadSandboxTxnIds(),
    prisma.orgMembership.count({ where: { status: "active", userId: { not: null } } }),
  ]);

  const b = {
    stripeMonthly: 0,
    stripeAnnual: 0,
    appleMonthly: 0,
    appleAnnual: 0,
    appleSandbox: 0,
    comp: 0,
    referral,
    team,
    expiredFlag: 0,
  };
  let mrrPence = 0;
  let inferredPeriods = 0;

  for (const u of premiumRows) {
    const source = classifyProSource(u, sandboxTxns, now);
    if (source === null) {
      b.expiredFlag += 1;
      continue;
    }
    if (source === "comp") {
      b.comp += 1;
      continue;
    }
    if (source === "sandbox") {
      b.appleSandbox += 1;
      continue;
    }
    // paying
    if (u.stripeSubscriptionId) {
      // Stripe has a single live price (monthly) unless a product id says otherwise.
      const period = u.subscriptionProductId
        ? inferPeriod(u.subscriptionProductId, null, now).period
        : "monthly";
      if (period === "annual") b.stripeAnnual += 1;
      else b.stripeMonthly += 1;
      mrrPence += monthlyEquivalentPence(period);
    } else {
      const { period, inferred } = inferPeriod(u.subscriptionProductId, u.premiumExpiresAt, now);
      if (inferred) inferredPeriods += 1;
      if (period === "annual") b.appleAnnual += 1;
      else b.appleMonthly += 1;
      mrrPence += monthlyEquivalentPence(period);
    }
  }

  const payingSubscribers = b.stripeMonthly + b.stripeAnnual + b.appleMonthly + b.appleAnnual;
  return {
    mrrPence,
    payingSubscribers,
    breakdown: b,
    inferredPeriods,
    proTotal: payingSubscribers + b.appleSandbox + b.comp + b.referral + b.team,
  };
}

// ── Monthly trend from the event trail ─────────────────────────────────
//
// The users table only knows the present, so a trend has to come from
// events: production Apple webhooks and the Stripe lifecycle events. The
// paying count at each month end is reconstructed backwards from today's
// paying count, so the series is exact wherever the event trail is
// complete and is cut off before the month the trail begins.

export interface PaidEvent {
  month: string; // YYYY-MM
  kind: "new" | "churn";
}

export interface TrendRow {
  month: string;
  payingAtMonthEnd: number;
  newPaid: number;
  churned: number;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Pure reconstruction. `months` must be ascending and end at the current month. */
export function reconstructTrend(
  currentPaying: number,
  events: PaidEvent[],
  months: string[]
): TrendRow[] {
  const byMonth = new Map<string, { newPaid: number; churned: number }>();
  for (const m of months) byMonth.set(m, { newPaid: 0, churned: 0 });
  for (const e of events) {
    const row = byMonth.get(e.month);
    if (!row) continue;
    if (e.kind === "new") row.newPaid += 1;
    else row.churned += 1;
  }
  const out: TrendRow[] = [];
  let paying = currentPaying;
  for (let i = months.length - 1; i >= 0; i--) {
    const m = months[i];
    const { newPaid, churned } = byMonth.get(m)!;
    out.unshift({ month: m, payingAtMonthEnd: paying, newPaid, churned });
    paying = paying - newPaid + churned;
  }
  return out;
}

const APPLE_CHURN_TYPES = ["EXPIRED", "REVOKE", "REFUND", "GRACE_PERIOD_EXPIRED"];

export async function loadPaidEvents(since: Date): Promise<PaidEvent[]> {
  const [apple, stripe] = await Promise.all([
    prisma.appleIapWebhookLog.findMany({
      where: {
        environment: "production",
        receivedAt: { gte: since },
        notificationType: { in: ["SUBSCRIBED", ...APPLE_CHURN_TYPES] },
      },
      select: { notificationType: true, receivedAt: true },
    }),
    prisma.appEvent.findMany({
      where: {
        createdAt: { gte: since },
        type: { in: ["billing.subscription_activated", "billing.subscription_cancelled"] },
      },
      select: { type: true, createdAt: true },
    }),
  ]);
  const events: PaidEvent[] = [];
  for (const a of apple) {
    events.push({
      month: monthKey(a.receivedAt),
      kind: a.notificationType === "SUBSCRIBED" ? "new" : "churn",
    });
  }
  for (const s of stripe) {
    events.push({
      month: monthKey(s.createdAt),
      kind: s.type === "billing.subscription_activated" ? "new" : "churn",
    });
  }
  return events;
}

/** First month the webhook trail exists; months before it cannot be trusted. */
export async function paidTrailStartMonth(): Promise<string | null> {
  const first = await prisma.appleIapWebhookLog.findFirst({
    where: { environment: "production" },
    orderBy: { receivedAt: "asc" },
    select: { receivedAt: true },
  });
  return first ? monthKey(first.receivedAt) : null;
}

export function lastNMonths(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

export async function getPaidTrend(months = 6, now: Date = new Date()) {
  const keys = lastNMonths(months, now);
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const [truth, events, startMonth] = await Promise.all([
    getSubscriptionTruth(now),
    loadPaidEvents(since),
    paidTrailStartMonth(),
  ]);
  const usable = startMonth ? keys.filter((k) => k >= startMonth) : keys;
  return {
    rows: reconstructTrend(truth.payingSubscribers, events, usable),
    trailStartMonth: startMonth,
  };
}

export async function churnLast30d(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [apple, stripe] = await Promise.all([
    prisma.appleIapWebhookLog.count({
      where: {
        environment: "production",
        receivedAt: { gte: since },
        notificationType: { in: APPLE_CHURN_TYPES },
      },
    }),
    prisma.appEvent.count({
      where: { createdAt: { gte: since }, type: "billing.subscription_cancelled" },
    }),
  ]);
  return apple + stripe;
}
