/**
 * Quarterly update deadline reminders: when, who, and what they say.
 * Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";
import {
  buildMtdReminderPush,
  daysBetween,
  decideMtdReminder,
  dueLabel,
  isReadyDay,
  isStillOpen,
  latestObligations,
  obligationTaxYear,
  quarterLabel,
  snapshotFromConnection,
  stageForToday,
  mtdRemindersEnabled,
  periodLabel,
  reminderKey,
  reminderStageFor,
  taxYearOfDate,
  MTD_REMINDER_ACTION,
  type SeenObligation,
} from "../../jobs/mtdDeadlineReminders.js";
import { toSubmissionRow } from "../../routes/admin/hmrc.js";
import { ukDateParts } from "@mileclear/shared";

const Q2: SeenObligation = { start: "2026-07-06", end: "2026-10-05", due: "2026-11-07", status: "Open" };

describe("gate", () => {
  it("only runs against HMRC's live service", () => {
    expect(mtdRemindersEnabled({ HMRC_ENVIRONMENT: "production" } as NodeJS.ProcessEnv)).toBe(true);
    expect(mtdRemindersEnabled({ HMRC_ENVIRONMENT: "sandbox" } as NodeJS.ProcessEnv)).toBe(false);
    expect(mtdRemindersEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("opens the quarterly updates screen", () => {
    expect(MTD_REMINDER_ACTION).toBe("open_mtd");
  });
});

describe("schedule", () => {
  it("fires 7 days and 1 day before the due date only", () => {
    expect(reminderStageFor("2026-10-31", "2026-11-07")).toBe("7d");
    expect(reminderStageFor("2026-11-06", "2026-11-07")).toBe("1d");
    expect(reminderStageFor("2026-11-01", "2026-11-07")).toBeNull();
    expect(reminderStageFor("2026-11-07", "2026-11-07")).toBeNull();
    expect(reminderStageFor("2026-11-08", "2026-11-07")).toBeNull();
  });

  it("covers all four quarterly deadlines, including across the clock change and year end", () => {
    expect(reminderStageFor("2026-07-31", "2026-08-07")).toBe("7d");
    expect(reminderStageFor("2027-01-31", "2027-02-07")).toBe("7d");
    expect(reminderStageFor("2027-04-30", "2027-05-07")).toBe("7d");
    expect(reminderStageFor("2027-05-06", "2027-05-07T00:00:00Z")).toBe("1d");
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("keys each reminder by quarter, stage and channel", () => {
    expect(reminderKey("2026-10-05", "7d", "push")).toBe("2026-10-05:7d:push");
    expect(reminderKey("2026-10-05", "7d", "push")).not.toBe(reminderKey("2026-10-05", "1d", "push"));
    expect(reminderKey("2026-10-05", "7d", "push")).not.toBe(reminderKey("2026-10-05", "7d", "email"));
  });
});

describe("still open", () => {
  it("uses the newest thing HMRC said about each quarter", () => {
    const latest = latestObligations([
      { obligations: [{ ...Q2, status: "Fulfilled" }] },
      { obligations: [Q2, { start: "2026-04-06", end: "2026-07-05", due: "2026-08-07", status: "Open" }] },
    ]);
    expect(latest).toHaveLength(2);
    expect(latest.find((o) => o.end === "2026-10-05")?.status).toBe("Fulfilled");
  });

  it("is closed once an update covering the quarter end went through (updates are cumulative)", () => {
    expect(isStillOpen(Q2, [])).toBe(true);
    expect(isStillOpen(Q2, [{ taxYear: "2026-27", periodEnd: "2026-07-05" }])).toBe(true);
    expect(isStillOpen(Q2, [{ taxYear: "2026-27", periodEnd: "2026-10-05" }])).toBe(false);
    expect(isStillOpen(Q2, [{ taxYear: "2026-27", periodEnd: "2027-01-05" }])).toBe(false);
    expect(isStillOpen(Q2, [{ taxYear: "2025-26", periodEnd: "2026-04-05" }])).toBe(true);
    expect(isStillOpen({ ...Q2, status: "Fulfilled" }, [])).toBe(false);
  });

  it("works out the tax year from the quarter start", () => {
    expect(taxYearOfDate("2026-04-06")).toBe("2026-27");
    expect(taxYearOfDate("2027-01-06")).toBe("2026-27");
    expect(taxYearOfDate("2026-04-05")).toBe("2025-26");
  });
});

describe("who gets what", () => {
  const base = { hasPushToken: true, pushPrefs: null, hasEmail: true, pushSent: false, emailSent: false };

  it("sends both once, and honours the tax deadline push switch", () => {
    expect(decideMtdReminder(base)).toEqual({ push: true, email: true });
    expect(decideMtdReminder({ ...base, pushSent: true, emailSent: true })).toEqual({ push: false, email: false });
    expect(decideMtdReminder({ ...base, pushPrefs: { taxDeadline: false } })).toEqual({ push: false, email: true });
    expect(decideMtdReminder({ ...base, hasPushToken: false })).toEqual({ push: false, email: true });
  });
});

describe("copy", () => {
  it("says which quarter, by when, and that it is sent from MileClear", () => {
    const week = buildMtdReminderPush(Q2, "7d");
    expect(week.title).toBe("Quarterly update due in 7 days");
    expect(week.body).toBe(
      "Your update for 6 July to 5 October 2026 is due by 7 November and HMRC still shows it as not sent. Check your figures and send it from MileClear."
    );
    expect(buildMtdReminderPush(Q2, "1d").title).toBe("Quarterly update due tomorrow");
  });

  it("keeps to the wording rules", () => {
    for (const stage of ["7d", "1d"] as const) {
      const { title, body } = buildMtdReminderPush(Q2, stage);
      const text = `${title} ${body}`;
      expect(text).not.toMatch(/—|–/);
      expect(text).not.toMatch(/HMRC[- ](ready|approved|compliant|recognised|accepted)/i);
    }
  });

  it("writes dates the UK way", () => {
    expect(periodLabel("2026-10-06", "2027-01-05")).toBe("6 October 2026 to 5 January 2027");
    expect(dueLabel("2026-11-07")).toBe("Saturday 7 November 2026");
  });
});

describe("admin submissions view rows", () => {
  it("maps a trail row and an earlier success log", () => {
    const at = new Date("2026-10-11T10:00:00Z");
    expect(
      toSubmissionRow({
        id: "e1",
        type: "hmrc.submission",
        userId: "u1",
        createdAt: at,
        metadata: {
          operation: "period_submit",
          taxYear: "2026-27",
          periodStart: "2026-04-06",
          periodEnd: "2026-10-05",
          environment: "production",
          ok: false,
          httpStatus: 422,
          hmrcCode: "RULE_X",
          correlationId: "c-1",
        },
      })
    ).toMatchObject({ operation: "period_submit", environment: "production", ok: false, hmrcCode: "RULE_X", correlationId: "c-1", source: "trail" });
    expect(
      toSubmissionRow({ id: "e2", type: "hmrc.period_amended", userId: "u1", createdAt: at, metadata: { taxYear: "2025-26" } })
    ).toMatchObject({ operation: "period_amend", ok: true, environment: null, source: "earlier_log" });
    expect(toSubmissionRow({ id: "e3", type: "hmrc.api_call", userId: "u1", createdAt: at, metadata: {} })).toBeNull();
  });
});

describe("ready to send (the day after a quarter ends)", () => {
  const Q2_CAL: SeenObligation = { start: "2026-07-01", end: "2026-09-30", due: "2026-11-07", status: "Open" };

  it("fires on the 6th for standard quarters", () => {
    expect(stageForToday("2026-10-06", Q2)).toBe("ready");
    expect(stageForToday("2026-10-05", Q2)).toBeNull();
    expect(stageForToday("2026-10-07", Q2)).toBeNull();
    expect(stageForToday("2026-07-06", { end: "2026-07-05", due: "2026-08-07" })).toBe("ready");
  });

  it("fires on the 1st of the next month for calendar quarters", () => {
    expect(stageForToday("2026-10-01", Q2_CAL)).toBe("ready");
    expect(stageForToday("2026-09-30", Q2_CAL)).toBeNull();
    expect(stageForToday("2026-10-06", Q2_CAL)).toBeNull();
    expect(stageForToday("2026-07-01", { end: "2026-06-30", due: "2026-08-07" })).toBe("ready");
  });

  it("crosses month, year and tax-year ends", () => {
    // Standard Q3 ends 5 January; calendar Q3 ends 31 December.
    expect(stageForToday("2027-01-06", { end: "2027-01-05", due: "2027-02-07" })).toBe("ready");
    expect(stageForToday("2027-01-01", { end: "2026-12-31", due: "2027-02-07" })).toBe("ready");
    // Standard Q4 ends 5 April; calendar Q4 ends 31 March.
    expect(stageForToday("2027-04-06", { end: "2027-04-05", due: "2027-05-07" })).toBe("ready");
    expect(stageForToday("2027-04-01", { end: "2027-03-31", due: "2027-05-07" })).toBe("ready");
    // Leap year: a quarter ending 29 February.
    expect(stageForToday("2028-03-01", { end: "2028-02-29", due: "2028-04-07" })).toBe("ready");
    // HMRC sometimes sends full timestamps.
    expect(stageForToday("2026-10-06", { end: "2026-10-05T00:00:00Z", due: "2026-11-07T00:00:00Z" })).toBe("ready");
  });

  it("uses the UK date, not UTC", () => {
    // 23:30 UTC on 5 Oct is 00:30 on 6 Oct in London (BST).
    const parts = ukDateParts(new Date("2026-10-05T23:30:00Z"));
    const today = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    expect(today).toBe("2026-10-06");
    expect(stageForToday(today, Q2)).toBe("ready");
    // 10:30 UK on 6 Oct (BST) is 09:30 UTC, still the 6th; in winter (GMT) 10:30 UK is 10:30 UTC.
    expect(ukDateParts(new Date("2026-10-06T09:30:00Z")).hour).toBe(10);
    expect(ukDateParts(new Date("2027-01-06T10:30:00Z")).hour).toBe(10);
  });

  it("never fires once the deadline has passed, and a deadline reminder wins on the same day", () => {
    expect(isReadyDay("2026-10-06", { end: "2026-10-05", due: "2026-10-06" })).toBe(false);
    expect(isReadyDay("2026-10-06", { end: "2026-10-05", due: "2026-10-07" })).toBe(true);
    expect(stageForToday("2026-10-06", { end: "2026-10-05", due: "2026-10-07" })).toBe("1d");
    expect(stageForToday("2026-10-06", { end: "2026-10-05", due: "2026-10-13" })).toBe("7d");
  });

  it("is deduped on its own key, separate from the deadline reminders", () => {
    expect(reminderKey("2026-10-05", "ready", "push")).toBe("2026-10-05:ready:push");
    expect(reminderKey("2026-10-05", "ready", "push")).not.toBe(reminderKey("2026-10-05", "7d", "push"));
    const base = { hasPushToken: true, pushPrefs: null, hasEmail: true };
    expect(decideMtdReminder({ ...base, pushSent: true, emailSent: true })).toEqual({ push: false, email: false });
    expect(decideMtdReminder({ ...base, pushSent: true, emailSent: false })).toEqual({ push: false, email: true });
  });

  it("names the quarter by month and says when to send", () => {
    expect(quarterLabel(Q2.start, Q2.end)).toBe("July to October");
    expect(quarterLabel(Q2_CAL.start, Q2_CAL.end)).toBe("July to September");
    expect(quarterLabel("2026-10-06", "2027-01-05")).toBe("October to January");
    expect(buildMtdReminderPush(Q2, "ready")).toEqual({
      title: "Your July to October update is ready to send",
      body: "Your figures are in MileClear. Check them and send by 7 November.",
    });
    const { title, body } = buildMtdReminderPush(Q2_CAL, "ready");
    expect(title).toBe("Your July to September update is ready to send");
    expect(`${title} ${body}`).not.toMatch(/—|–|penalt|fine/i);
    expect(`${title} ${body}`).not.toMatch(/HMRC[- ](ready|approved|compliant|recognised|accepted)/i);
  });
});

describe("already sent", () => {
  it("counts an update sent from MileClear for a calendar quarter starting 1 April", () => {
    const q1Cal: SeenObligation = { start: "2026-04-01", end: "2026-06-30", due: "2026-08-07", status: "Open" };
    expect(obligationTaxYear(q1Cal)).toBe("2026-27");
    expect(isStillOpen(q1Cal, [])).toBe(true);
    expect(isStillOpen(q1Cal, [{ taxYear: "2026-27", periodEnd: "2026-06-30" }])).toBe(false);
    // Standard Q4 ends 5 April, still in the year it started.
    expect(obligationTaxYear({ end: "2027-04-05" })).toBe("2026-27");
    expect(obligationTaxYear({ end: "2027-03-31" })).toBe("2026-27");
  });

  it("suppresses the ready push once an update covering the quarter went through", () => {
    expect(stageForToday("2026-10-06", Q2)).toBe("ready");
    expect(isStillOpen(Q2, [{ taxYear: "2026-27", periodEnd: "2026-10-05" }])).toBe(false);
    expect(isStillOpen({ ...Q2, status: "Fulfilled" }, [])).toBe(false);
  });

  it("only trusts HMRC's dates from the current connection", () => {
    const conn = { environment: "production" as const, connectedAt: new Date("2026-10-01T00:00:00Z"), businessId: "XBIS1" };
    const after = new Date("2026-10-02T00:00:00Z");
    expect(snapshotFromConnection({ metadata: { environment: "production", businessId: "XBIS1" }, createdAt: after }, conn)).toBe(true);
    // Untagged older events still count if taken since connecting.
    expect(snapshotFromConnection({ metadata: { obligations: [] }, createdAt: after }, conn)).toBe(true);
    // Before the driver last connected.
    expect(snapshotFromConnection({ metadata: { environment: "production" }, createdAt: new Date("2026-09-30T00:00:00Z") }, conn)).toBe(false);
    // HMRC's test service.
    expect(snapshotFromConnection({ metadata: { environment: "sandbox" }, createdAt: after }, conn)).toBe(false);
    // Another business.
    expect(snapshotFromConnection({ metadata: { environment: "production", businessId: "XBIS2" }, createdAt: after }, conn)).toBe(false);
    expect(snapshotFromConnection({ metadata: { businessId: null }, createdAt: after }, conn)).toBe(true);
  });
});
