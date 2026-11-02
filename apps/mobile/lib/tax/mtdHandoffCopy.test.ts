import { describe, it, expect, vi } from "vitest";

vi.mock("../db/index", () => ({ getDatabase: vi.fn() }));

import {
  addBusinessHandoff,
  connectHandoff,
  fileHandoff,
  longDate,
  payFigures,
  payHandoff,
  signUpHandoff,
  GOVUK_FILE_SELF_ASSESSMENT,
  type HandoffCopy,
} from "./mtdHandoffCopy";
import { GOVUK_MTD_SIGN_UP } from "./mtdSignUp";
import { GOVUK_PAY_SELF_ASSESSMENT } from "./mtdBalance";

const pounds = (p: number) => `£${(p / 100).toFixed(2)}`;
const all: HandoffCopy[] = [
  signUpHandoff(),
  connectHandoff("production"),
  connectHandoff("sandbox"),
  payHandoff({ amountPence: 140280, payBy: "2027-01-31", dateLabel: "Pay by", late: false, latePart: null }, pounds),
  payHandoff(null, pounds),
  fileHandoff(),
  addBusinessHandoff(),
];

describe("hand-off sheet copy", () => {
  it("sign up after HMRC said not signed up asks them to come back and Check again", () => {
    const c = signUpHandoff({ recheck: true });
    expect(c.comeBack).toContain("come back and tap Check again");
    expect(c.comeBack).not.toContain("step 2");
    expect(c.secondary).toBe("I've done this already");
  });
  it("sign up matches the spec and points at HMRC's sign-up guidance", () => {
    const c = signUpHandoff();
    expect(c.pill).toBe("Opens GOV.UK");
    expect(c.title).toBe("Sign up with HMRC");
    expect(c.why).toBe("Only HMRC can sign you up, so this part happens on GOV.UK. It's free and you only do it once.");
    expect(c.steps.map((s) => s.title)).toEqual(["Sign in", "Check your details", "Answer a few questions and confirm"]);
    expect(c.comeBack).toBe("Tap \"I've done this\" and we'll take you to step 2. We'll keep your place.");
    expect(c.primary).toBe("Open GOV.UK");
    expect(c.secondary).toBe("I've done this already");
    expect(c.url).toBe(GOVUK_MTD_SIGN_UP);
  });

  it("connect says what happens on HMRC's sign-in and has no web link of its own", () => {
    const c = connectHandoff("production");
    expect(c.pill).toBe("Opens HMRC sign-in");
    expect(c.title).toBe("Sign in to HMRC");
    expect(c.steps).toHaveLength(3);
    expect(c.steps[1].title).toBe("Enter the code HMRC texts you, if it asks");
    expect(c.comeBack).toContain("tap Connect again");
    expect(c.primary).toBe("Continue to HMRC");
    expect(c.url).toBeNull();
    expect(c.primaryOpensWeb).toBe(false);
  });

  it("connect on the test service says so", () => {
    const c = connectHandoff("sandbox");
    expect(c.title).toContain("test service");
    expect(c.why).toContain("nothing reaches your real tax account");
    // Unknown environment reads as the real service.
    expect(connectHandoff(undefined).title).toBe("Sign in to HMRC");
  });

  it("pay shows the amount, the date and where to find the UTR", () => {
    const c = payHandoff({ amountPence: 140280, payBy: "2027-01-31", dateLabel: "Pay by", late: false, latePart: null }, pounds);
    expect(c.title).toBe("Pay HMRC");
    expect(c.rows).toEqual([
      { label: "Amount", value: "£1402.80" },
      { label: "Pay by", value: "31 January 2027" },
    ]);
    expect(c.haveReady).toBe(
      "Your payment reference is your 10-digit UTR followed by K. Your UTR is on letters from HMRC and in the HMRC app.",
    );
    expect(c.comeBack).toBe("HMRC can take a few days to show the payment here.");
    expect(c.url).toBe(GOVUK_PAY_SELF_ASSESSMENT);
    expect(payHandoff(null, pounds).rows).toEqual([]);
  });

  it("file points at GOV.UK and offers the figures first", () => {
    const c = fileHandoff();
    expect(c.title).toBe("File your tax return on GOV.UK");
    expect(c.haveReady).toBe("Your figures from Tax > Self Assessment, box by box.");
    expect(c.primary).toBe("Open GOV.UK");
    expect(c.secondary).toBe("See my figures first");
    expect(c.url).toBe(GOVUK_FILE_SELF_ASSESSMENT);
  });

  it("every sheet links only to gov.uk", () => {
    for (const c of all) if (c.url) expect(c.url).toMatch(/^https:\/\/www\.gov\.uk\//);
  });

  it("no em dashes and no adjective about MileClear next to HMRC", () => {
    const text = JSON.stringify(all);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/hmrc[- ](approved|compliant|ready|recognised|recognized)/i);
    expect(text).not.toMatch(/approved|recognised/i);
  });
});

describe("payFigures", () => {
  const base = { overduePence: 0, overdueSince: null, dueNowPence: 0, dueNowDate: null, comingUpPence: 0, comingUpDate: null };

  it("nothing owed gives nothing", () => {
    expect(payFigures(base)).toBeNull();
  });
  it("due now uses its own date", () => {
    expect(payFigures({ ...base, dueNowPence: 5000, dueNowDate: "2027-01-31" })).toEqual({
      amountPence: 5000,
      payBy: "2027-01-31",
      dateLabel: "Pay by",
      late: false,
      latePart: null,
    });
  });
  it("late plus due now adds them, keeps the pay-by date and says which part is late", () => {
    const f = payFigures({ ...base, overduePence: 1000, overdueSince: "2026-07-31", dueNowPence: 5000, dueNowDate: "2027-01-31" });
    expect(f).toEqual({
      amountPence: 6000,
      payBy: "2027-01-31",
      dateLabel: "Pay by",
      late: true,
      latePart: { pence: 1000, since: "2026-07-31" },
    });
    expect(payHandoff(f, pounds).rows).toEqual([
      { label: "Amount", value: "£60.00" },
      { label: "Pay by", value: "31 January 2027" },
      { label: "Of which late", value: "£10.00, was due 31 July 2026" },
    ]);
  });
  it("only late says when it was due, without a second late row", () => {
    const f = payFigures({ ...base, overduePence: 1000, overdueSince: "2026-07-31" });
    expect(f).toEqual({
      amountPence: 1000,
      payBy: "2026-07-31",
      dateLabel: "Was due",
      late: true,
      latePart: null,
    });
    expect(payHandoff(f, pounds).rows.map((r) => r.label)).toEqual(["Amount", "Was due"]);
  });
  it("late part with no date still shows the amount", () => {
    const f = payFigures({ ...base, overduePence: 1000, dueNowPence: 5000, dueNowDate: "2027-01-31" });
    expect(payHandoff(f, pounds).rows[2]).toEqual({ label: "Of which late", value: "£10.00" });
  });
  it("only coming up uses that", () => {
    expect(payFigures({ ...base, comingUpPence: 2000, comingUpDate: "2027-07-31" })?.amountPence).toBe(2000);
  });
  it("long dates read in words", () => {
    expect(longDate("2027-01-31")).toBe("31 January 2027");
    expect(longDate("nonsense")).toBe("nonsense");
  });
});
