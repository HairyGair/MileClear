import { describe, it, expect } from "vitest";
import { checkMtdScope } from "@mileclear/shared";
import {
  BUSINESS_NOT_FOUND,
  HAVE_READY,
  NOT_SIGNED_UP_COPY,
  SETUP_FOOTER,
  SETUP_STEP_COPY,
  SETUP_TITLE,
  collapseStepsForScope,
  foundBusinessLine,
  scopeLine,
  scopeMissingYears,
  setupBody,
  setupSteps,
  stepsHeading,
} from "./mtdSetupCopy";

const gbp = (n: number) => n * 100;
const OCT_2026 = new Date(2026, 9, 15, 12);

describe("setup copy", () => {
  it("header follows the spec, with test wording on the test service", () => {
    expect(SETUP_TITLE).toBe("Send your updates to HMRC from here");
    expect(setupBody("production")).toBe("Set up once, about 10 minutes. Then each update takes 2.");
    expect(setupBody("sandbox")).toContain("test version");
    expect(setupBody(undefined)).not.toContain("test");
  });
  it("have these ready and the three steps", () => {
    expect(HAVE_READY.map((h) => h.title)).toEqual([
      "Your Government Gateway login",
      "Your National Insurance number",
      "Your phone, for a code",
    ]);
    expect(SETUP_STEP_COPY.signUp.title).toBe("Sign up for Making Tax Digital");
    expect(SETUP_STEP_COPY.connect.title).toBe("Connect MileClear to HMRC");
    expect(SETUP_STEP_COPY.details.title).toBe("Check your details");
    expect(stepsHeading(3)).toBe("3 steps");
  });
  it("no em dashes, no raw ids, no adjective about MileClear next to HMRC", () => {
    const text = JSON.stringify([HAVE_READY, SETUP_STEP_COPY, SETUP_FOOTER, NOT_SIGNED_UP_COPY, BUSINESS_NOT_FOUND]);
    expect(text).not.toMatch(/—|XAIS|NINO/);
    expect(text).not.toMatch(/hmrc[- ](approved|compliant|ready|recognised)/i);
  });
  it("not signed up and business not found match the spec", () => {
    expect(NOT_SIGNED_UP_COPY.title).toBe("HMRC says you're not signed up yet");
    expect(BUSINESS_NOT_FOUND.title).toBe("HMRC hasn't got a driving business for you");
    expect(BUSINESS_NOT_FOUND.causes.map((c) => c.button)).toEqual(["Show me how", "Change my number"]);
  });
  it("names the business found, or says Self-employed", () => {
    expect(foundBusinessLine("AJ Deliveries")).toBe("We found your business: AJ Deliveries");
    expect(foundBusinessLine(null)).toBe("We found your business: Self-employed");
    expect(foundBusinessLine("  ")).toBe("We found your business: Self-employed");
  });
});

describe("scopeLine", () => {
  it("now", () => {
    const r = checkMtdScope({ selfEmploymentPenceByTaxYear: { "2024-25": gbp(51_200) }, today: OCT_2026 });
    expect(scopeLine(r)).toEqual({
      tone: "now",
      headline: "You need to do this now",
      detail: "You earned £51,200 in 2024-25, over HMRC's £50,000 limit.",
    });
  });
  it("later", () => {
    const r = checkMtdScope({
      selfEmploymentPenceByTaxYear: { "2024-25": gbp(20_000), "2025-26": gbp(34_800) },
      today: OCT_2026,
    });
    expect(scopeLine(r)).toEqual({
      tone: "later",
      headline: "You'll need to from 6 April 2027",
      detail: "You earned £34,800 in 2025-26, over HMRC's £30,000 limit. You can set up now and get used to it.",
    });
  });
  it("later, from a year still running", () => {
    const r = checkMtdScope({ selfEmploymentPenceByTaxYear: { "2026-27": gbp(21_000) }, today: OCT_2026 });
    expect(scopeLine(r).detail).toBe(
      "You've earned £21,000 so far in 2026-27, over HMRC's £20,000 limit. You can set up now and get used to it.",
    );
  });
  it("not yet", () => {
    const r = checkMtdScope({ selfEmploymentPenceByTaxYear: { "2026-27": gbp(3_000) }, today: OCT_2026 });
    expect(scopeLine(r)).toEqual({
      tone: "not_yet",
      headline: "You don't need to yet",
      detail: "Your earnings are under HMRC's limits. You can still set up if you want to.",
    });
  });
  it("missing years note", () => {
    expect(scopeMissingYears([])).toBeNull();
    expect(scopeMissingYears(["2024-25", "2025-26"])).toContain("2024-25 or 2025-26");
  });
});

describe("setupSteps", () => {
  const base = { live: true, saidSignedUp: false, connected: false, notSignedUp: false, step: "connect" as const };
  const states = (input: Parameters<typeof setupSteps>[0]) => setupSteps(input).map((s) => `${s.key}:${s.state}`);

  it("starts on sign up, with the rest still to come", () => {
    expect(states(base)).toEqual(["signUp:current", "connect:later", "details:later"]);
  });
  it("I've done this moves the driver to Connect", () => {
    expect(states({ ...base, saidSignedUp: true })).toEqual(["signUp:done", "connect:current", "details:later"]);
  });
  it("connected moves to Check your details", () => {
    expect(states({ ...base, connected: true, step: "nino" })).toEqual(["signUp:done", "connect:done", "details:current"]);
    expect(states({ ...base, connected: true, step: "business" })).toEqual(["signUp:done", "connect:done", "details:current"]);
  });
  it("HMRC saying not signed up reopens step 1 even after I've done this", () => {
    expect(states({ ...base, saidSignedUp: true, connected: true, notSignedUp: true, step: "ready" })).toEqual([
      "signUp:attention",
      "connect:done",
      "details:later",
    ]);
  });
  it("the test service has no sign-up step and numbers from 1", () => {
    const s = setupSteps({ ...base, live: false });
    expect(s.map((x) => `${x.number}:${x.key}:${x.state}`)).toEqual(["1:connect:current", "2:details:later"]);
  });
  it("only one step is ever current or in attention", () => {
    for (const live of [true, false])
      for (const saidSignedUp of [true, false])
        for (const connected of [true, false])
          for (const notSignedUp of [true, false])
            for (const step of ["connect", "nino", "business", "ready"] as const) {
              const active = setupSteps({ live, saidSignedUp, connected, notSignedUp, step }).filter(
                (s) => s.state === "current" || s.state === "attention",
              );
              expect(active.length).toBeLessThanOrEqual(1);
            }
  });
});

describe("collapseStepsForScope", () => {
  const base = { scope: "not_yet" as const, saidSignedUp: false, connected: false, notSignedUp: false };
  it("collapses only for a driver who doesn't need it and hasn't started", () => {
    expect(collapseStepsForScope(base)).toBe(true);
    expect(collapseStepsForScope({ ...base, scope: "now" })).toBe(false);
    expect(collapseStepsForScope({ ...base, scope: null })).toBe(false);
    expect(collapseStepsForScope({ ...base, saidSignedUp: true })).toBe(false);
    expect(collapseStepsForScope({ ...base, connected: true })).toBe(false);
  });
});
