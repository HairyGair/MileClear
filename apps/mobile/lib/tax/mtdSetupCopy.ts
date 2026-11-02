// Words and step logic for the Quarterly updates setup screen (HMRC redesign
// spec 4.3 and 4.9): header, "Have these ready", the 3-step checklist, the
// "HMRC says you're not signed up" state and the "no business found" explainer.
//
// Pure, so it's tested. No em dashes; never an adjective about MileClear
// next to "HMRC".

import { formatWholePounds, type MtdScopeResult } from "@mileclear/shared";
import { isMtdTest, type HmrcEnv } from "./mtdCopy";

export const SETUP_EYEBROW = "Making Tax Digital";
export const SETUP_TITLE = "Send your updates to HMRC from here";

export function setupBody(env: HmrcEnv): string {
  return isMtdTest(env)
    ? "Set up once, about 10 minutes. This is the test version, so nothing reaches your real tax account."
    : "Set up once, about 10 minutes. Then each update takes 2.";
}

export const HAVE_READY_HEADING = "Have these ready";

export const HAVE_READY = [
  {
    key: "gateway",
    title: "Your Government Gateway login",
    body: "The one for your tax return. Lost it? GOV.UK resets it.",
  },
  {
    key: "nino",
    title: "Your National Insurance number",
    body: "On a payslip, a P60 or in the HMRC app.",
  },
  {
    key: "phone",
    title: "Your phone, for a code",
    body: "HMRC may text you a code when you sign in.",
  },
] as const;

export type SetupStepKey = "signUp" | "connect" | "details";

export const SETUP_STEP_COPY: Record<SetupStepKey, { title: string; body: string; tag: string }> = {
  signUp: {
    title: "Sign up for Making Tax Digital",
    body: "HMRC needs you to sign up before it takes updates. Free, and you only do it once.",
    tag: "On GOV.UK",
  },
  connect: {
    title: "Connect MileClear to HMRC",
    body: "Sign in on HMRC's page and give MileClear permission to send.",
    tag: "HMRC sign-in",
  },
  details: {
    title: "Check your details",
    body: "Your National Insurance number and your driving business.",
    tag: "In MileClear",
  },
};

export const SETUP_BUTTONS = {
  showMeHow: "Show me how",
  done: "I've done this",
  connect: "Connect",
  enterNumber: "Enter my number",
  changeNumber: "Change my number",
  checkAgain: "Check again",
  setUpAnyway: "Set up anyway",
  disconnect: "Disconnect",
} as const;

export const SETUP_FOOTER =
  "Your National Insurance number is stored encrypted and only used for your updates. You can disconnect any time.";

/** "3 steps", or "2 steps" on the test service, which needs no GOV.UK sign-up. */
export function stepsHeading(count: number): string {
  return `${count} steps`;
}

/** Step 1 reopened because HMRC refused: the driver isn't signed up (spec 4.3). */
export const NOT_SIGNED_UP_COPY = {
  title: "HMRC says you're not signed up yet",
  body: "If you've just signed up, it can take a little while to reach HMRC. Otherwise check the National Insurance number you entered is yours.",
} as const;

/** HMRC found no self-employed business for the driver (spec 4.9). Replaces a dead end. */
export const BUSINESS_NOT_FOUND = {
  title: "HMRC hasn't got a driving business for you",
  intro:
    "HMRC looked up your National Insurance number and found no self-employed business. Usually it's one of these:",
  causes: [
    {
      key: "notAdded",
      title: "You signed up for Making Tax Digital without adding your self-employment.",
      fix: "Add it in your HMRC online account.",
      button: "Show me how",
    },
    {
      key: "wrongNumber",
      title: "The National Insurance number isn't yours.",
      fix: "Check it and try again.",
      button: "Change my number",
    },
  ],
  checkAgain: "Check again",
} as const;

/** One self-employed business found: name it, and open the Confirm trade screen in one tap. */
export function foundBusinessLine(tradingName: string | null | undefined): string {
  const name = tradingName && tradingName.trim() ? tradingName.trim() : "Self-employed";
  return `We found your business: ${name}`;
}

export const FOUND_BUSINESS_SUB = "Check its details and confirm it's the right one.";
export const CHOOSE_BUSINESS = {
  title: "Choose your business",
  body: "HMRC has more than one self-employed business for you. Pick the one for your driving.",
} as const;

// ── Scope line (compact MtdScopeCheck) ───────────────────────────────

/**
 * now / later / not_yet come from the shared check. "unknown" means MileClear
 * has no earnings for a year HMRC looks at, so "not yet" can't be said as fact.
 * "failed" means none of the earnings could be read.
 */
export type ScopeTone = "now" | "later" | "not_yet" | "unknown" | "failed";

export interface ScopeLine {
  tone: ScopeTone;
  headline: string;
  detail: string;
  /** Show HMRC's checker link straight away, not only under "How we worked this out". */
  showChecker: boolean;
}

export const SCOPE_FAILED_LINE: ScopeLine = {
  tone: "failed",
  headline: "Couldn't check your earnings",
  detail: "We couldn't read your earnings just now. Check with HMRC's checker if you're not sure.",
  showChecker: true,
};

/**
 * The one-line answer at the top of setup. Built from the shared scope check
 * (packages/shared checkMtdScope), worded for this screen. A "not yet" with a
 * year MileClear holds nothing for is "can't tell", never "you don't need to".
 */
export function scopeLine(result: MtdScopeResult): ScopeLine {
  if (result.answer === "not_yet" || !result.phase) {
    if (result.missingTaxYears.length > 0) {
      return {
        tone: "unknown",
        headline: "We can't tell from MileClear",
        detail: `MileClear doesn't have your earnings for ${result.missingTaxYears.join(" or ")}, so we can't tell. Check with HMRC's checker if you're not sure.`,
        showChecker: true,
      };
    }
    return {
      tone: "not_yet",
      headline: "You don't need to yet",
      detail: "Going by what's in MileClear, your earnings are under HMRC's limits. You can still set up if you want to.",
      showChecker: false,
    };
  }
  const phase = result.phase;
  const year = result.years.find((y) => y.taxYear === phase.basedOnTaxYear);
  const limit = formatWholePounds(phase.thresholdPence);
  const earned = year?.qualifyingIncomePence != null ? formatWholePounds(year.qualifyingIncomePence) : null;
  const why = earned
    ? year?.complete
      ? `You earned ${earned} in ${phase.basedOnTaxYear}, over HMRC's ${limit} limit.`
      : `You've earned ${earned} so far in ${phase.basedOnTaxYear}, over HMRC's ${limit} limit.`
    : `Your earnings in ${phase.basedOnTaxYear} are over HMRC's ${limit} limit.`;
  if (result.answer === "now") {
    return { tone: "now", headline: "You need to do this now", detail: why, showChecker: false };
  }
  return {
    tone: "later",
    headline: `You'll need to from 6 ${phase.startsLabel}`,
    detail: `${why} You can set up now and get used to it.`,
    showChecker: false,
  };
}

/**
 * The earnings reads behind the scope check, per tax year: pence, or null for
 * "nothing held", or "error" when the read failed. All failed reads is
 * "failed"; a failed year otherwise counts as not held (so "can't tell").
 */
export function scopeFromReads(
  reads: Record<string, number | null | "error">,
  check: (byYear: Record<string, number | null>) => MtdScopeResult,
): { line: ScopeLine; result: MtdScopeResult | null } {
  const years = Object.keys(reads);
  if (years.length > 0 && years.every((y) => reads[y] === "error")) {
    return { line: SCOPE_FAILED_LINE, result: null };
  }
  const byYear: Record<string, number | null> = {};
  for (const y of years) {
    const v = reads[y];
    // Nothing logged for a year reads as "not held", not as £0 of income.
    byYear[y] = typeof v === "number" && v > 0 ? v : null;
  }
  const result = check(byYear);
  return { line: scopeLine(result), result };
}

export const SCOPE_HOW_LINK = "How we worked this out";
export const SCOPE_LIMITS_INTRO =
  "HMRC looks at your income before expenses for an earlier tax year, from your Self Assessment:";
export const SCOPE_RENT_NOTE =
  "It counts self-employment income plus any rental (property) income. MileClear only holds your driving earnings, so add any rent you get yourself.";
export const SCOPE_CHECKER_LINK = "HMRC's own checker on GOV.UK";

export function scopeMissingYears(years: string[]): string | null {
  return years.length > 0
    ? `MileClear has no earnings for ${years.join(" or ")}, so this doesn't count that income.`
    : null;
}

// ── Step states ──────────────────────────────────────────────────────

export type StepState = "current" | "done" | "later" | "attention";

export interface SetupStepsInput {
  /** The real service. The test service needs no GOV.UK sign-up, so step 1 isn't shown. */
  live: boolean;
  /** The driver tapped "I've done this" (remembered on the phone). */
  saidSignedUp: boolean;
  /** Connected to HMRC now. A connection HMRC has ended is not connected; see `expired`. */
  connected: boolean;
  /**
   * HMRC ended the connection (it asked to sign in again). Step 2 shows
   * "Connection expired" in amber with Connect again, not a tick, and step 1
   * counts as done because they got past it before.
   */
  expired?: boolean;
  /** HMRC refused because the driver isn't signed up. */
  notSignedUp: boolean;
  /** The screen's own setup step. */
  step: "connect" | "nino" | "business" | "ready";
}

export interface SetupStepView {
  key: SetupStepKey;
  /** 1-based number as shown. */
  number: number;
  state: StepState;
}

/**
 * Which step is current, done or still to come. One step is current (or in
 * attention) at a time, so there's always one obvious thing to do.
 */
export function setupSteps(input: SetupStepsInput): SetupStepView[] {
  const { live, saidSignedUp, connected, notSignedUp, step } = input;
  const expired = !connected && input.expired === true;
  // An ended connection comes first: HMRC can't say anything else until they reconnect.
  const signUp: StepState = notSignedUp && !expired
    ? "attention"
    : saidSignedUp || connected || expired
      ? "done"
      : "current";
  const connect: StepState = connected
    ? "done"
    : expired
      ? "attention"
      : !live || signUp === "done"
        ? "current"
        : "later";
  const details: StepState =
    !connected || (live && notSignedUp)
      ? "later"
      : step === "ready"
        ? "done"
        : "current";

  const list: { key: SetupStepKey; state: StepState }[] = live
    ? [
        { key: "signUp", state: signUp },
        { key: "connect", state: connect },
        { key: "details", state: details },
      ]
    : [
        { key: "connect", state: connect },
        { key: "details", state: details },
      ];
  return list.map((s, i) => ({ ...s, number: i + 1 }));
}

export const CONNECTION_EXPIRED = {
  title: "Connection expired",
  body: "HMRC has ended the connection. Connect again to carry on.",
  button: "Connect again",
} as const;

/**
 * Hide the steps behind "Set up anyway" only when the scope check says, from
 * earnings MileClear holds for every year, that the driver doesn't need this
 * yet, they haven't started, and it's the real service. Never on the test
 * service (App Review uses it), never when we can't tell.
 */
export function collapseStepsForScope(args: {
  live: boolean;
  scope: ScopeTone | null;
  saidSignedUp: boolean;
  connected: boolean;
  notSignedUp: boolean;
}): boolean {
  return (
    args.live &&
    args.scope === "not_yet" &&
    !args.saidSignedUp &&
    !args.connected &&
    !args.notSignedUp
  );
}
