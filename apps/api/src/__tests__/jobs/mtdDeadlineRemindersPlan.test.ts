/**
 * Quarterly update reminders, end to end through planMtdReminders and the job
 * with Prisma mocked (no database: the repo-root .env is PRODUCTION).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  connections: [] as unknown[],
  snapshots: [] as unknown[],
  submissions: [] as unknown[],
  sent: [] as unknown[],
  createFails: false,
  created: [] as unknown[],
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    hmrcConnection: { findMany: vi.fn(async () => db.connections) },
    appEvent: {
      findMany: vi.fn(async (args: { where: { type: string } }) => {
        if (args.where.type === "hmrc.obligations_seen") return db.snapshots;
        if (args.where.type === "hmrc.submission") return db.submissions;
        if (args.where.type === "notification.mtd_deadline") return db.sent;
        return [];
      }),
      create: vi.fn(async (args: unknown) => {
        if (db.createFails) throw new Error("db down");
        db.created.push(args);
        return {};
      }),
    },
    orgMembership: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => null) },
  },
}));

const sendPushNotifications = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../lib/push.js", () => ({ sendPushNotifications }));

const emails = vi.hoisted(() => ({
  ready: vi.fn(async () => undefined),
  deadline: vi.fn(async () => undefined),
}));
vi.mock("../../services/email.js", () => ({
  sendMtdQuarterReadyEmail: emails.ready,
  sendMtdQuarterlyReminderEmail: emails.deadline,
}));

import {
  buildMtdReminderPush,
  planMtdReminders,
  runMtdDeadlineRemindersJob,
} from "../../jobs/mtdDeadlineReminders.js";

// 10:30 UK (BST) on 6 October 2026: the day after the standard Q2 ends.
const READY_DAY = new Date("2026-10-06T09:30:00Z");
const Q1 = { start: "2026-04-06", end: "2026-07-05", due: "2026-08-07", status: "Fulfilled" };
const Q2 = { start: "2026-07-06", end: "2026-10-05", due: "2026-11-07", status: "Open" };
const Q2_CAL = { start: "2026-07-01", end: "2026-09-30", due: "2026-11-07", status: "Open" };

function connection(user: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    connectedAt: new Date("2026-09-01T00:00:00Z"),
    businessId: "XBIS1",
    user: {
      email: "sam@example.com",
      displayName: "Sam",
      pushToken: "ExponentPushToken[x]",
      pushPrefs: null,
      marketingEmailsEnabled: true,
      workType: "gig",
      dashboardMode: "work",
      isPremium: false,
      premiumExpiresAt: null,
      referralProUntil: null,
      ...user,
    },
  };
}

function snapshot(meta: Record<string, unknown>, at = "2026-09-15T10:00:00Z") {
  return { userId: "u1", createdAt: new Date(at), metadata: { environment: "production", businessId: "XBIS1", obligations: [Q1, Q2], ...meta } };
}

function okSubmission(meta: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    metadata: {
      ok: true,
      environment: "production",
      operation: "period_submit",
      taxYear: "2026-27",
      periodStart: "2026-04-06",
      periodEnd: "2026-10-05",
      businessId: "XBIS1",
      ...meta,
    },
  };
}

beforeEach(() => {
  db.connections = [connection()];
  db.snapshots = [snapshot({})];
  db.submissions = [];
  db.sent = [];
  db.createFails = false;
  db.created = [];
  sendPushNotifications.mockClear();
  emails.ready.mockClear();
  emails.deadline.mockClear();
});

describe("planMtdReminders", () => {
  it("picks the ready stage the day after the quarter ends, push and email", async () => {
    const plan = await planMtdReminders(READY_DAY);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      userId: "u1",
      stage: "ready",
      obligation: { end: "2026-10-05" },
      push: "ExponentPushToken[x]",
      email: { address: "sam@example.com" },
      pro: false,
      selfEmployed: true,
    });
  });

  it("ignores HMRC's dates from before the driver last connected", async () => {
    db.snapshots = [snapshot({}, "2026-08-20T10:00:00Z")];
    expect(await planMtdReminders(READY_DAY)).toEqual([]);
  });

  it("ignores dates from HMRC's test service", async () => {
    db.snapshots = [snapshot({ environment: "sandbox" })];
    expect(await planMtdReminders(READY_DAY)).toEqual([]);
  });

  it("ignores dates for another business", async () => {
    db.snapshots = [snapshot({ businessId: "XBIS2" })];
    expect(await planMtdReminders(READY_DAY)).toEqual([]);
  });

  it("an update sent from MileClear for this business suppresses it; one for another business does not", async () => {
    db.submissions = [okSubmission()];
    expect(await planMtdReminders(READY_DAY)).toEqual([]);
    db.submissions = [okSubmission({ businessId: "XBIS2" })];
    expect(await planMtdReminders(READY_DAY)).toHaveLength(1);
    db.submissions = [okSubmission({ ok: false })];
    expect(await planMtdReminders(READY_DAY)).toHaveLength(1);
    db.submissions = [okSubmission({ environment: "sandbox" })];
    expect(await planMtdReminders(READY_DAY)).toHaveLength(1);
  });

  it("never sends the same stage twice", async () => {
    db.sent = [
      { userId: "u1", metadata: { key: "2026-10-05:ready:push" } },
      { userId: "u1", metadata: { key: "2026-10-05:ready:email" } },
    ];
    expect(await planMtdReminders(READY_DAY)).toEqual([]);
    db.sent = [{ userId: "u1", metadata: { key: "2026-10-05:ready:push" } }];
    const plan = await planMtdReminders(READY_DAY);
    expect(plan[0]).toMatchObject({ push: null, email: { address: "sam@example.com" } });
  });

  it("skips the email for a driver who unsubscribed, but still pushes", async () => {
    db.connections = [connection({ marketingEmailsEnabled: false })];
    const plan = await planMtdReminders(READY_DAY);
    expect(plan[0]).toMatchObject({ push: "ExponentPushToken[x]", email: null });
  });

  it("tells Pro from not Pro with the same rule as the send route", async () => {
    db.connections = [connection({ isPremium: true })];
    expect((await planMtdReminders(READY_DAY))[0].pro).toBe(true);
    db.connections = [connection({ referralProUntil: new Date("2027-01-01T00:00:00Z") })];
    expect((await planMtdReminders(READY_DAY))[0].pro).toBe(true);
    db.connections = [connection({ isPremium: true, premiumExpiresAt: new Date("2026-01-01T00:00:00Z") })];
    expect((await planMtdReminders(READY_DAY))[0].pro).toBe(false);
  });

  it("knows when Quarterly updates is not in the driver's Settings yet", async () => {
    db.connections = [connection({ workType: "employee" })];
    expect((await planMtdReminders(READY_DAY))[0].selfEmployed).toBe(false);
    db.connections = [connection({ workType: "both" })];
    expect((await planMtdReminders(READY_DAY))[0].selfEmployed).toBe(true);
  });

  it("sends one message per deadline after a switch between standard and calendar quarters", async () => {
    // 7 days before 7 November: both quarters are due that day.
    const weekBefore = new Date("2026-10-31T10:30:00Z");
    db.snapshots = [
      snapshot({ obligations: [Q1, Q2] }, "2026-10-20T10:00:00Z"),
      snapshot({ obligations: [{ ...Q1, start: "2026-04-01", end: "2026-06-30" }, Q2_CAL] }, "2026-09-10T10:00:00Z"),
    ];
    const plan = await planMtdReminders(weekBefore);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ stage: "7d", obligation: { start: "2026-07-06" } });
  });
});

describe("runMtdDeadlineRemindersJob", () => {
  const env = process.env.HMRC_ENVIRONMENT;
  beforeEach(() => {
    process.env.HMRC_ENVIRONMENT = "production";
  });
  afterEach(() => {
    process.env.HMRC_ENVIRONMENT = env;
  });

  it("records each send first, then pushes the non-Pro copy and sends the ready email", async () => {
    await runMtdDeadlineRemindersJob(READY_DAY);
    expect(db.created).toHaveLength(2);
    expect(sendPushNotifications).toHaveBeenCalledTimes(1);
    const [messages] = sendPushNotifications.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(messages[0]).toMatchObject({
      title: "Your July to October update is due by 7 November",
      body: "Sending it from MileClear needs Pro. You can also send it another way.",
      data: { action: "open_mtd", stage: "ready" },
    });
    expect(emails.ready).toHaveBeenCalledTimes(1);
    expect(emails.deadline).not.toHaveBeenCalled();
    expect((emails.ready.mock.calls[0] as unknown[])[2]).toMatchObject({
      quarterLabel: "July to October",
      dueShort: "7 November",
      pro: false,
      selfEmployed: true,
    });
  });

  it("sends nothing when the dedupe row cannot be written", async () => {
    db.createFails = true;
    await runMtdDeadlineRemindersJob(READY_DAY);
    expect(sendPushNotifications).not.toHaveBeenCalled();
    expect(emails.ready).not.toHaveBeenCalled();
  });

  it("does nothing outside 10:00 to 10:59 UK", async () => {
    await runMtdDeadlineRemindersJob(new Date("2026-10-06T10:30:00Z")); // 11:30 BST
    expect(db.created).toHaveLength(0);
  });
});

describe("push copy, Pro and not", () => {
  const q = { start: Q2.start, end: Q2.end, due: Q2.due };
  it("reads right for every stage", () => {
    expect(buildMtdReminderPush(q, "ready", true)).toEqual({
      title: "Your July to October update is ready to send",
      body: "Your figures are in MileClear. Check them and send by 7 November.",
    });
    expect(buildMtdReminderPush(q, "ready", false)).toEqual({
      title: "Your July to October update is due by 7 November",
      body: "Sending it from MileClear needs Pro. You can also send it another way.",
    });
    expect(buildMtdReminderPush(q, "7d", false)).toEqual({
      title: "Quarterly update due in 7 days",
      body: "Your update for 6 July to 5 October 2026 is due by 7 November and HMRC still shows it as not sent. Sending it from MileClear needs Pro. You can also send it another way.",
    });
    for (const stage of ["ready", "7d", "1d"] as const) {
      for (const pro of [true, false]) {
        const { title, body } = buildMtdReminderPush(q, stage, pro);
        expect(`${title} ${body}`).not.toMatch(/—|–|penalt|fine\b/i);
        if (!pro) expect(`${title} ${body}`).not.toMatch(/ready to send|send it from MileClear/i);
      }
    }
  });
});
