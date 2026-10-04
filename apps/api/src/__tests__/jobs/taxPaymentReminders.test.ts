/**
 * Tax payment reminder pushes: when, who, and what they say.
 * Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";
import { ukDateParts, type TaxPlannerPayment } from "@mileclear/shared";
import {
  buildTaxPaymentBody,
  buildTaxPaymentTitle,
  decideTaxPaymentPush,
  dueTaxPaymentStage,
  stageKey,
  taxPaymentPushEnabled,
  TAX_PAYMENT_ACTION,
  type TaxPaymentCandidate,
} from "../../jobs/taxPaymentReminders.js";

const january: TaxPlannerPayment = {
  dueDate: "2027-01-31",
  daysAway: 14,
  amountPence: 450_000,
  parts: [
    { kind: "balancing", taxYear: "2025-26", amountPence: 300_000 },
    { kind: "poa1", taxYear: "2026-27", amountPence: 150_000 },
  ],
  firstPaymentOnAccount: true,
};

function candidate(over: Partial<TaxPaymentCandidate> = {}): TaxPaymentCandidate {
  return {
    hasPushToken: true,
    pushPrefs: null,
    dashboardMode: "work",
    workType: "gig",
    alreadySent: false,
    payment: january,
    ...over,
  };
}

describe("schedule", () => {
  it("fires at 12:00 UK, 14 and 3 days before 31 January and 31 July", () => {
    expect(dueTaxPaymentStage(ukDateParts(new Date("2027-01-17T12:05:00Z")))).toEqual({
      dueDate: "2027-01-31",
      leadDays: 14,
    });
    expect(dueTaxPaymentStage(ukDateParts(new Date("2027-01-28T12:30:00Z")))).toEqual({
      dueDate: "2027-01-31",
      leadDays: 3,
    });
    // July is BST: 11:00 UTC is 12:00 UK.
    expect(dueTaxPaymentStage(ukDateParts(new Date("2027-07-17T11:00:00Z")))).toEqual({
      dueDate: "2027-07-31",
      leadDays: 14,
    });
    expect(dueTaxPaymentStage(ukDateParts(new Date("2027-07-28T11:59:00Z")))?.leadDays).toBe(3);
    expect(dueTaxPaymentStage(ukDateParts(new Date("2027-07-17T12:00:00Z")))).toBeNull(); // 13:00 UK
    expect(dueTaxPaymentStage(ukDateParts(new Date("2027-01-18T12:00:00Z")))).toBeNull();
    expect(dueTaxPaymentStage(ukDateParts(new Date("2027-03-17T12:00:00Z")))).toBeNull();
  });

  it("keys each stage by date and lead", () => {
    expect(stageKey({ dueDate: "2027-01-31", leadDays: 14 })).toBe("2027-01-31:14");
  });

  it("is a dry run unless TAX_PAYMENT_PUSH is exactly 1", () => {
    expect(taxPaymentPushEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(taxPaymentPushEnabled({ TAX_PAYMENT_PUSH: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(taxPaymentPushEnabled({ TAX_PAYMENT_PUSH: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("routes to the planner", () => {
    expect(TAX_PAYMENT_ACTION).toBe("open_tax_planner");
  });
});

describe("decideTaxPaymentPush", () => {
  it("sends for a known amount above £0", () => {
    expect(decideTaxPaymentPush(candidate())).toEqual({ send: true, amountPence: 450_000 });
  });

  it("skips personal mode, employees, no token, pref off and repeats", () => {
    expect(decideTaxPaymentPush(candidate({ dashboardMode: "personal" }))).toEqual({ send: false, reason: "personal_mode" });
    expect(decideTaxPaymentPush(candidate({ workType: "employee" }))).toEqual({ send: false, reason: "employee" });
    expect(decideTaxPaymentPush(candidate({ hasPushToken: false }))).toEqual({ send: false, reason: "no_token" });
    expect(decideTaxPaymentPush(candidate({ pushPrefs: { taxDeadline: false } }))).toEqual({ send: false, reason: "pref_off" });
    expect(decideTaxPaymentPush(candidate({ alreadySent: true }))).toEqual({ send: false, reason: "already_sent" });
  });

  it("never pushes an unknown or zero amount", () => {
    expect(decideTaxPaymentPush(candidate({ payment: { ...january, amountPence: null } }))).toEqual({
      send: false,
      reason: "unknown_amount",
    });
    expect(decideTaxPaymentPush(candidate({ payment: null }))).toEqual({ send: false, reason: "unknown_amount" });
    expect(decideTaxPaymentPush(candidate({ payment: { ...january, amountPence: 0 } }))).toEqual({
      send: false,
      reason: "nothing_due",
    });
  });
});

describe("copy", () => {
  it("names the date and what the money is for, no dashes", () => {
    const stage = { dueDate: "2027-01-31", leadDays: 14 as const };
    expect(buildTaxPaymentTitle(stage)).toBe("Tax payment due 31 January");
    const body = buildTaxPaymentBody(january, stage);
    expect(body).toBe(
      "MileClear estimates about £4,500.00: the balancing payment for 2025-26 and your first payment on account for 2026-27. See your plan."
    );
    expect(body).not.toMatch(/[—–]/);
  });

  it("3 days out says the date in the body", () => {
    const stage = { dueDate: "2027-07-31", leadDays: 3 as const };
    const july: TaxPlannerPayment = {
      dueDate: "2027-07-31",
      daysAway: 3,
      amountPence: 150_000,
      parts: [{ kind: "poa2", taxYear: "2026-27", amountPence: 150_000 }],
      firstPaymentOnAccount: false,
    };
    expect(buildTaxPaymentTitle(stage)).toBe("Tax payment due in 3 days");
    expect(buildTaxPaymentBody(july, stage)).toBe(
      "MileClear estimates about £1,500.00 on 31 July: your second payment on account for 2026-27. See your plan."
    );
  });
});
