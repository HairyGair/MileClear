// What has to happen OUTSIDE our database when an account is deleted.
//
// GDPR audit H6 (14 Aug 2026): deleting an account removed our rows (the
// user delete cascades) but left every upstream grant alive. A deleted
// driver's QuickBooks and Xero refresh tokens still worked at Intuit and
// Xero, TrueLayer still held a consent to read their bank, and Stripe kept
// a customer record with their email and card fingerprint. This module
// revokes what the providers let us revoke, before the rows (and so the
// tokens) are gone.
//
// Every step is best-effort and independent: a provider being down must
// never stop someone deleting their account. Each outcome is returned, so
// the caller can log which steps failed and someone can finish them by hand.
//
// HMRC has no API to revoke an MTD grant. Deleting our row discards the
// tokens; the driver can also remove MileClear under "Manage authorised
// software" in their HMRC account. That is recorded as a skipped step.

import { prisma } from "../lib/prisma.js";
import { stripe } from "../lib/stripe.js";
import { decrypt } from "../lib/encryption.js";
import { getQboConfig, revokeRefreshToken as revokeQbo } from "./quickbooks.js";
import { getXeroConfig, revokeRefreshToken as revokeXero } from "./xero.js";
import { revokeTrueLayerAccess } from "./openBanking.js";

export interface UpstreamStepResult {
  step: string;
  outcome: "done" | "skipped" | "failed";
  detail?: string;
}

/** The side effects, injectable so the orchestration can be tested. */
export interface UpstreamDeps {
  cancelStripeSubscription: (subscriptionId: string) => Promise<void>;
  deleteStripeCustomer: (customerId: string) => Promise<void>;
  revokeQuickBooks: (refreshTokenEncrypted: string) => Promise<void>;
  revokeXero: (refreshTokenEncrypted: string) => Promise<void>;
  revokeTrueLayer: (conn: { id: string; accessToken: string; refreshToken: string | null }) => Promise<void>;
  deleteWaitlistEntry: (email: string) => Promise<number>;
}

export interface UpstreamUserData {
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  quickBooks: { id: string; refreshTokenEncrypted: string }[];
  xero: { id: string; refreshTokenEncrypted: string }[];
  trueLayer: { id: string; accessToken: string; refreshToken: string | null; status: string }[];
  hasHmrcConnection: boolean;
}

const STEP_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

function errMsg(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200);
}

/** Pure orchestration over injected side effects. Never throws. */
export async function runUpstreamRevocation(
  data: UpstreamUserData,
  deps: UpstreamDeps
): Promise<UpstreamStepResult[]> {
  const results: UpstreamStepResult[] = [];
  const attempt = async (step: string, fn: () => Promise<unknown>) => {
    try {
      await withTimeout(fn());
      results.push({ step, outcome: "done" });
    } catch (err) {
      results.push({ step, outcome: "failed", detail: errMsg(err) });
    }
  };

  // Stripe: end the subscription first (a customer delete also does this,
  // but an explicit cancel survives a failed delete), then remove the
  // customer so Stripe stops holding the driver's email and card details.
  if (data.stripeSubscriptionId) {
    const id = data.stripeSubscriptionId;
    await attempt("stripe.subscription_cancel", () => deps.cancelStripeSubscription(id));
  }
  if (data.stripeCustomerId) {
    const id = data.stripeCustomerId;
    await attempt("stripe.customer_delete", () => deps.deleteStripeCustomer(id));
  }

  for (const c of data.quickBooks) {
    await attempt("quickbooks.revoke", () => deps.revokeQuickBooks(c.refreshTokenEncrypted));
  }
  for (const c of data.xero) {
    await attempt("xero.revoke", () => deps.revokeXero(c.refreshTokenEncrypted));
  }
  // Disconnected bank links have already been revoked (since 11 Oct 2026)
  // or were left with a dead token; trying again costs one request each and
  // covers links disconnected before revocation existed.
  for (const c of data.trueLayer) {
    await attempt("truelayer.revoke", () => deps.revokeTrueLayer(c));
  }

  if (data.hasHmrcConnection) {
    results.push({
      step: "hmrc.revoke",
      outcome: "skipped",
      detail: "HMRC has no revocation API; tokens are discarded with the row",
    });
  }

  // The pre-launch waitlist is keyed by email with no link to the account,
  // so the cascade never reached it.
  if (data.email) {
    const email = data.email;
    await attempt("waitlist.delete", () => deps.deleteWaitlistEntry(email));
  }

  return results;
}

export const defaultUpstreamDeps: UpstreamDeps = {
  async cancelStripeSubscription(subscriptionId) {
    if (!stripe) throw new Error("Stripe not configured");
    try {
      await stripe.subscriptions.cancel(subscriptionId);
    } catch (err) {
      // Already cancelled is the state we want.
      if ((err as { code?: string })?.code === "resource_missing") return;
      throw err;
    }
  },
  async deleteStripeCustomer(customerId) {
    if (!stripe) throw new Error("Stripe not configured");
    try {
      await stripe.customers.del(customerId);
    } catch (err) {
      if ((err as { code?: string })?.code === "resource_missing") return;
      throw err;
    }
  },
  async revokeQuickBooks(refreshTokenEncrypted) {
    const config = getQboConfig();
    if (!config) throw new Error("QuickBooks not configured");
    await revokeQbo({ config, refreshToken: decrypt(refreshTokenEncrypted) });
  },
  async revokeXero(refreshTokenEncrypted) {
    const config = getXeroConfig();
    if (!config) throw new Error("Xero not configured");
    await revokeXero({ config, refreshToken: decrypt(refreshTokenEncrypted) });
  },
  revokeTrueLayer: (conn) => revokeTrueLayerAccess(conn),
  async deleteWaitlistEntry(email) {
    const r = await prisma.waitlistEntry.deleteMany({ where: { email } });
    return r.count;
  },
};

/** Load what the revocation needs. Call BEFORE the user row is deleted. */
export async function loadUpstreamUserData(userId: string): Promise<UpstreamUserData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      quickBooksConnection: { select: { id: true, refreshTokenEncrypted: true } },
      xeroConnection: { select: { id: true, refreshTokenEncrypted: true } },
      plaidConnections: { select: { id: true, accessToken: true, refreshToken: true, status: true } },
      hmrcConnection: { select: { id: true } },
    },
  });
  if (!user) return null;
  return {
    email: user.email,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    quickBooks: user.quickBooksConnection ? [user.quickBooksConnection] : [],
    xero: user.xeroConnection ? [user.xeroConnection] : [],
    trueLayer: user.plaidConnections,
    hasHmrcConnection: Boolean(user.hmrcConnection),
  };
}

/** Load, revoke, return the outcomes. Never throws. */
export async function revokeUpstreamForDeletion(
  userId: string,
  deps: UpstreamDeps = defaultUpstreamDeps
): Promise<UpstreamStepResult[]> {
  try {
    const data = await loadUpstreamUserData(userId);
    if (!data) return [];
    return await runUpstreamRevocation(data, deps);
  } catch (err) {
    return [{ step: "load", outcome: "failed", detail: errMsg(err) }];
  }
}
