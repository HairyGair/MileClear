// When an in-app Apple purchase check fails (1 Oct 2026).
//
// After the 30 Sep fix let checks reach Apple at all, the first failure was a
// 401 from the App Store Server API for Agnieszka, a subscriber since August
// whose Pro was already active: her phone re-sent an old purchase, Apple
// refused two lookups in three seconds, then answered normally. The alert
// said "They paid; we didn't bind. Investigate immediately." Nothing was lost.
//
// Two rules, pure so they are tested:
//   - transient Apple errors (401, 429, 5xx) are retried once;
//   - a failure for someone already on an active Apple subscription is an
//     email-only note, not an urgent alarm. Anyone else still gets act_now,
//     because that can be a real lost payment.

/** Apple errors worth one retry: auth hiccups, rate limits, server errors. */
export function isTransientAppleError(err: unknown): boolean {
  const status = (err as { httpStatusCode?: number } | null)?.httpStatusCode;
  if (typeof status !== "number") return false;
  return status === 401 || status === 429 || status >= 500;
}

export interface ValidateFailureSubject {
  isPremium: boolean;
  premiumExpiresAt: Date | null;
  appleOriginalTransactionId: string | null;
}

export interface ValidateFailureAlert {
  tier: "act_now" | "aware";
  title: string;
  body: string;
}

export function validateFailureAlert(
  userId: string | null,
  user: ValidateFailureSubject | null,
  now: Date
): ValidateFailureAlert {
  const activeApple =
    !!user &&
    user.isPremium &&
    !!user.appleOriginalTransactionId &&
    (user.premiumExpiresAt == null || user.premiumExpiresAt.getTime() > now.getTime());
  if (activeApple) {
    const until = user!.premiumExpiresAt
      ? ` until ${user!.premiumExpiresAt.toISOString().slice(0, 10)}`
      : "";
    return {
      tier: "aware",
      title: "Apple check failed for an existing subscriber",
      body: `User ${userId ?? "(unknown)"} already has an active Apple subscription and Pro${until}. Their phone re-sent a purchase and Apple's check failed, so nothing was lost. Only worth a look if it keeps happening.`,
    };
  }
  return {
    tier: "act_now",
    title: "Apple IAP validate failed",
    body: `User ${userId ?? "(unknown)"} attempted to validate an Apple purchase but the server rejected it, and they are not on an active Apple subscription with us. They may have paid without getting Pro. Investigate immediately.`,
  };
}
