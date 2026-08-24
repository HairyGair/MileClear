import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { stripe } from "../lib/stripe.js";
import { logEvent } from "./appEvents.js";
import { notifyBillingEvent } from "./billingAlerts.js";
import type { TeamSeatBilling } from "@mileclear/shared";

// Milesheet Phase 3 (24 Aug 2026) - per-seat billing.
//
// SEATS: only active, accepted DRIVER memberships are billed. An org admin
// who manages a team but never drives is not a paid seat - the Phase 3 spec
// line ("Stripe per-seat, quantity = active driver memberships") already
// draws this line, and quietly charging a non-driving manager would be a
// surprise nobody asked for. If a customer wants admins metered too, that
// is a pricing decision for a human, not a default we choose here.
//
// CANCELLATION: `customer.subscription.deleted` clears the org's Stripe
// link (stripeSubscriptionId, seatsBilled) but does NOT touch any driver's
// Pro. Team Pro flows from an active OrgMembership row via
// subscriptionTruth.classifyProSource, not from live billing state, so a
// lapsed card does not silently strip a whole team's access mid-month. An
// `act_now` billing alert fires instead so a human decides whether to
// disable the org.
//
// STRIPE SAFETY: every Stripe call in this file is wrapped so failures log
// and swallow rather than throwing into a caller's request path (matching
// billing/index.ts and appleIap.ts). This is LIVE Stripe - prefer a seat
// count that is briefly stale over an unhandled throw that breaks an
// unrelated membership-change request.

const TEAM_SEAT_PRICE_ENV = "STRIPE_TEAM_SEAT_PRICE_ID";

// Shown on the billing card before Stripe has been asked, and used as a
// last-resort fallback if the live Price lookup fails. Kept near the
// spec's £6-7/user/mo target. This value is NEVER used to compute a
// charge - Stripe's Price object is always the source of truth for money.
const FALLBACK_SEAT_PRICE_PENCE = 650;

const PRICE_CACHE_TTL_MS = 60 * 60 * 1000; // a Price object rarely changes intraday
let cachedSeatPrice: { pence: number; cachedAt: number } | null = null;

async function getSeatPricePence(): Promise<number> {
  const priceId = process.env[TEAM_SEAT_PRICE_ENV];
  if (!stripe || !priceId) return FALLBACK_SEAT_PRICE_PENCE;
  const now = Date.now();
  if (cachedSeatPrice && now - cachedSeatPrice.cachedAt < PRICE_CACHE_TTL_MS) {
    return cachedSeatPrice.pence;
  }
  try {
    const price = await stripe.prices.retrieve(priceId);
    const pence = price.unit_amount ?? FALLBACK_SEAT_PRICE_PENCE;
    cachedSeatPrice = { pence, cachedAt: now };
    return pence;
  } catch (err) {
    console.error("teamBilling.getSeatPricePence: Stripe lookup failed:", err);
    return cachedSeatPrice?.pence ?? FALLBACK_SEAT_PRICE_PENCE;
  }
}

/**
 * Active, accepted driver seats for an org. Admins do not occupy a seat
 * (see file header). This is the number that gets pushed to Stripe as the
 * subscription quantity.
 */
export async function countActiveSeats(orgId: string): Promise<number> {
  return prisma.orgMembership.count({
    where: { orgId, role: "driver", status: "active", userId: { not: null } },
  });
}

/**
 * Recompute seats for an org and, only if the number changed since the
 * last sync, push the new quantity to Stripe. Idempotent (a no-op when
 * nothing changed), a no-op for pilotFree orgs, and a no-op for orgs that
 * have never subscribed. Never throws - call this fire-and-forget from any
 * membership-change path.
 */
export async function syncSeats(orgId: string): Promise<void> {
  if (!stripe) return;
  try {
    const org = await prisma.organisation.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        pilotFree: true,
        stripeSubscriptionId: true,
        seatsBilled: true,
      },
    });
    if (!org) return;
    if (org.pilotFree) return; // pilot orgs are never billed, no matter what
    if (!org.stripeSubscriptionId) return; // nothing to sync until they subscribe

    const seats = await countActiveSeats(orgId);
    if (seats === org.seatsBilled) return; // idempotent no-op

    const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    const item = sub.items.data[0];
    if (!item) {
      console.error(
        `teamBilling.syncSeats: org ${orgId} subscription ${org.stripeSubscriptionId} has no line items`
      );
      return;
    }
    await stripe.subscriptions.update(org.stripeSubscriptionId, {
      items: [{ id: item.id, quantity: seats }],
    });
    await prisma.organisation.update({
      where: { id: orgId },
      data: { seatsBilled: seats },
    });
    logEvent("team.seats_synced", null, { orgId, from: org.seatsBilled, to: seats });
  } catch (err) {
    console.error(`teamBilling.syncSeats failed for org ${orgId}:`, err);
  }
}

/** Portal read model. Always returns something - never throws. */
export async function getSeatBilling(orgId: string): Promise<TeamSeatBilling> {
  const pricePerSeatPence = await getSeatPricePence();
  const activeSeats = await countActiveSeats(orgId);

  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: {
      pilotFree: true,
      stripeSubscriptionId: true,
      seatsBilled: true,
      billingEmail: true,
    },
  });
  if (!org) {
    return {
      pilotFree: false,
      activeSeats,
      seatsBilled: null,
      pricePerSeatPence,
      status: "none",
      currentPeriodEnd: null,
      billingEmail: null,
    };
  }
  if (org.pilotFree) {
    return {
      pilotFree: true,
      activeSeats,
      seatsBilled: org.seatsBilled,
      pricePerSeatPence,
      status: "pilot",
      currentPeriodEnd: null,
      billingEmail: org.billingEmail,
    };
  }
  if (!org.stripeSubscriptionId || !stripe) {
    return {
      pilotFree: false,
      activeSeats,
      seatsBilled: org.seatsBilled,
      pricePerSeatPence,
      status: "none",
      currentPeriodEnd: null,
      billingEmail: org.billingEmail,
    };
  }

  // Organisation has no persisted status/period-end column (schema is
  // owned elsewhere), so - exactly like GET /billing/status does for an
  // individual user - read it live from Stripe rather than trust a stale
  // local copy.
  try {
    const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    const status: TeamSeatBilling["status"] =
      sub.status === "active" || sub.status === "trialing"
        ? "active"
        : sub.status === "past_due"
          ? "past_due"
          : "canceled";
    const periodEnd = sub.items.data[0]?.current_period_end;
    return {
      pilotFree: false,
      activeSeats,
      seatsBilled: org.seatsBilled,
      pricePerSeatPence,
      status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      billingEmail: org.billingEmail,
    };
  } catch (err) {
    console.error(`teamBilling.getSeatBilling: Stripe lookup failed for org ${orgId}:`, err);
    return {
      pilotFree: false,
      activeSeats,
      seatsBilled: org.seatsBilled,
      pricePerSeatPence,
      status: "none",
      currentPeriodEnd: null,
      billingEmail: org.billingEmail,
    };
  }
}

/**
 * Reuse or create the Stripe Customer for an org. Returns null when Stripe
 * isn't configured or the org doesn't exist - callers must handle that
 * (503, not a throw).
 */
export async function getOrCreateOrgCustomer(orgId: string): Promise<string | null> {
  if (!stripe) return null;
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, billingEmail: true, stripeCustomerId: true },
  });
  if (!org) return null;
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: org.name,
    email: org.billingEmail ?? undefined,
    metadata: { orgId: org.id, kind: "team_org" },
  });
  await prisma.organisation.update({
    where: { id: org.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

async function findOrgForSubscription(sub: Stripe.Subscription) {
  const metaOrgId = sub.metadata?.orgId;
  if (metaOrgId) {
    const org = await prisma.organisation.findUnique({
      where: { id: metaOrgId },
      select: { id: true, name: true, billingEmail: true },
    });
    if (org) return org;
  }
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  return prisma.organisation.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true, name: true, billingEmail: true },
  });
}

/**
 * Org-subscription webhook handling, called from the Stripe webhook in
 * routes/billing/index.ts (which this file does not own/edit - see the
 * exact call sites in the Phase 3 report). Returns true if the event
 * belonged to a team org and was handled; false means "not mine, keep
 * going" so it's always safe to call alongside the existing per-user
 * handling for the same event type - an individual user's Stripe customer
 * never matches an Organisation row, so this is a no-op for those events.
 */
export async function handleTeamSubscriptionEvent(event: Stripe.Event): Promise<boolean> {
  if (!stripe) return false;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const org = await findOrgForSubscription(sub);
      if (!org) return false;
      if (sub.id) {
        await prisma.organisation.update({
          where: { id: org.id },
          data: { stripeSubscriptionId: sub.id },
        });
      }
      logEvent("team.subscription_updated", null, { orgId: org.id, status: sub.status });
      // Bring the billed quantity in line in case membership changed while
      // the subscription didn't exist yet (first checkout) - harmless
      // no-op otherwise since syncSeats is idempotent.
      await syncSeats(org.id);
      return true;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const org = await findOrgForSubscription(sub);
      if (!org) return false;
      await prisma.organisation.update({
        where: { id: org.id },
        data: { stripeSubscriptionId: null, seatsBilled: null },
      });
      logEvent("team.subscription_cancelled", null, { orgId: org.id });
      notifyBillingEvent({
        kind: "subscription.revoked",
        tier: "act_now",
        title: "Team subscription cancelled",
        body: `${org.name}'s (${org.billingEmail ?? "no billing email"}) team seat subscription was cancelled. Driver Pro access is UNCHANGED - team Pro follows active membership, not billing. Decide by hand whether to disable the org.`,
        userId: null,
        userEmail: org.billingEmail,
        details: { orgId: org.id },
      });
      return true;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) return false;
      const org = await prisma.organisation.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true, name: true, billingEmail: true },
      });
      if (!org) return false;
      logEvent("team.payment_failed", null, { orgId: org.id });
      notifyBillingEvent({
        kind: "subscription.payment_failed",
        tier: "act_now",
        title: "Team seat billing payment failed",
        body: `${org.name}'s seat-billing payment failed. Stripe will retry automatically; driver Pro access is unaffected for now.`,
        userId: null,
        userEmail: org.billingEmail,
        details: { orgId: org.id, customerId },
      });
      return true;
    }

    default:
      return false;
  }
}
