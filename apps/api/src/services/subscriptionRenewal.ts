// Will this driver's Pro carry on by itself when the current period ends?
//
// The "Your Pro period ends soon" push used to go to every Pro driver for
// each of the three days before their period ended, including monthly
// subscribers whose subscription renews by itself. In the 30 days to
// 16 Oct 2026 that was 89 pushes to 27 drivers, 16 of whom simply renewed
// (Kada asked why she kept being told). The push now goes only to drivers
// whose Pro will NOT renew: a store subscription they have cancelled, or Pro
// that was granted rather than bought (tester, referral, comp), once per
// period.
//
// What each store tells us:
//   Apple   DID_CHANGE_RENEWAL_STATUS (AUTO_RENEW_DISABLED / _ENABLED), logged
//           as billing.apple_auto_renew_changed from 16 Oct 2026. A driver
//           who turned renewal off before then has no event and reads as
//           renewing, so they miss our push (Apple emails them itself).
//   Google  billing.google_play_rtdn carries the subscription state; the
//           latest one says SUBSCRIPTION_STATE_CANCELED when renewal is off.
//   Stripe  asked live: cancel_at_period_end on the subscription.
// When a store cannot tell us, we assume it renews: a missed reminder costs
// less than telling a paying driver their Pro is ending when it is not.

export type RenewalSource = "apple" | "google" | "stripe" | "none";

export interface RenewalFacts {
  hasApple: boolean;
  hasGoogle: boolean;
  hasStripe: boolean;
  /** Latest Apple renewal-status subtype, e.g. "AUTO_RENEW_DISABLED". */
  appleLatestSubtype?: string | null;
  /** Latest Google Play subscription state from an RTDN. */
  googleLatestState?: string | null;
  /** Stripe's cancel_at_period_end; null when Stripe could not be asked. */
  stripeCancelAtPeriodEnd?: boolean | null;
}

export interface RenewalVerdict {
  source: RenewalSource;
  willRenew: boolean;
}

export function decideRenewal(f: RenewalFacts): RenewalVerdict {
  if (f.hasApple) {
    return { source: "apple", willRenew: f.appleLatestSubtype !== "AUTO_RENEW_DISABLED" };
  }
  if (f.hasGoogle) {
    return { source: "google", willRenew: f.googleLatestState !== "SUBSCRIPTION_STATE_CANCELED" };
  }
  if (f.hasStripe) {
    return { source: "stripe", willRenew: f.stripeCancelAtPeriodEnd !== true };
  }
  // Granted Pro (tester, referral, comp) never renews by itself.
  return { source: "none", willRenew: false };
}

/** The push wording for a driver whose Pro is ending. */
export function expiringMessage(daysLeft: number, source: RenewalSource): { title: string; body: string } {
  const dayWord = daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`;
  return {
    title: `Your Pro ends ${dayWord}`,
    body:
      source === "none"
        ? "To keep your Self Assessment PDF, exports and unlimited saved places, you can start Pro from Settings > Your plan."
        : "Your subscription is set not to renew. To keep your Self Assessment PDF, exports and unlimited saved places, turn renewal back on.",
  };
}
