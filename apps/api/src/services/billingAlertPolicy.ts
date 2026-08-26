// Environment policy for billing alerts.
//
// Apple delivers sandbox webhooks (TestFlight testers, App Review) to the
// same endpoint as production, and a sandbox subscription renews on an
// accelerated clock for as long as Apple keeps it alive. Until 21 Aug 2026
// every sandbox DID_RENEW fired the full "celebrate" fan-out - push, email
// and #founder - as if money had arrived: App Review's account from the
// 1.3.7 approval renewed nightly for a week and was celebrated every time.
//
// Sandbox events still grant Pro (the handler does that before alerting, and
// testers need it), but they must never look like revenue:
//   - sandbox renewals are suppressed outright; there is nothing to know.
//   - every other sandbox event is demoted to the email-only "aware" tier
//     and its title prefixed "[Sandbox]", so a reviewer's purchase is still
//     visible in the record without a push or a celebration.
//
// Pure function with no I/O so the rule is testable without the transports.

export type BillingAlertTier = "celebrate" | "act_now" | "aware";

export interface EnvironmentPolicyInput {
  kind: string;
  tier: BillingAlertTier;
  title: string;
  /** Apple environment the event came from, when known. */
  environment?: string | null;
}

export type EnvironmentPolicyResult<T> =
  | { action: "send"; input: T }
  | { action: "suppress"; reason: "sandbox_renewal" };

const SANDBOX_PREFIX = "[Sandbox] ";

export function applyEnvironmentPolicy<T extends EnvironmentPolicyInput>(
  input: T
): EnvironmentPolicyResult<T> {
  if (input.environment !== "sandbox") return { action: "send", input };

  if (input.kind === "subscription.renewed") {
    return { action: "suppress", reason: "sandbox_renewal" };
  }

  const title = input.title.startsWith(SANDBOX_PREFIX)
    ? input.title
    : `${SANDBOX_PREFIX}${input.title}`;
  return { action: "send", input: { ...input, tier: "aware", title } };
}
