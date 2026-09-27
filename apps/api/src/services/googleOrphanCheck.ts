// A Google "subscription purchased" notification (RTDN) for a purchase token
// no account holds yet.
//
// 27 Sep 2026: both new Android subscribers set off "Orphan Google Play
// subscription, someone may be paying without Pro". Google's notification
// reached us 14 s and 68 s BEFORE the customer's phone called
// /billing/google/validate, which is what links the token to the account.
// Both were Pro a minute later. So an orphan is normal for the first minutes
// of every purchase: look again after a grace period, and only raise the alert
// if the token is still unbound then.

export const ORPHAN_GRACE_MS = 15 * 60 * 1000;

export interface OrphanCheckDeps {
  /** Does any account hold this purchase token now? */
  isBound: (purchaseToken: string) => Promise<boolean>;
  alert: (notificationType: number) => void;
  schedule?: (fn: () => void, ms: number) => void;
}

export function checkOrphanAfterGrace(
  purchaseToken: string,
  notificationType: number,
  deps: OrphanCheckDeps,
): void {
  const schedule =
    deps.schedule ??
    ((fn: () => void, ms: number) => {
      // An in-memory timer: a restart inside the window loses the check, but a
      // real orphan is still caught by the next RTDN for the same token
      // (renewal, recovery) and by the validate-failed alert.
      const t = setTimeout(fn, ms);
      t.unref?.();
    });
  schedule(() => {
    deps
      .isBound(purchaseToken)
      .then((bound) => {
        if (!bound) deps.alert(notificationType);
      })
      .catch(() => deps.alert(notificationType));
  }, ORPHAN_GRACE_MS);
}
