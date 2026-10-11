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
  isStillOpen,
  latestObligations,
  mtdRemindersEnabled,
  periodLabel,
  reminderKey,
  reminderStageFor,
  taxYearOfDate,
  MTD_REMINDER_ACTION,
  type SeenObligation,
} from "../../jobs/mtdDeadlineReminders.js";
import { toSubmissionRow } from "../../routes/admin/hmrc.js";

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
