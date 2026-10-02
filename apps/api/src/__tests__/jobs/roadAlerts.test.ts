/**
 * Road alerts job (2 Oct 2026): one push in the driver's own pre-departure
 * window, at most one a day, never the same event twice, never while driving,
 * and the 05:00-07:59 quiet-hours exemption passed to the sender.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({
  users: [] as unknown[],
  sent: [] as { userId: string; metadata: unknown; createdAt: Date }[],
  trips: [] as { userId: string; startedAt: Date; endedAt: Date | null }[],
  shifts: [] as { userId: string; startedAt: Date }[],
}));
const sendPushNotifications = vi.hoisted(() => vi.fn());
const logEvent = vi.hoisted(() => vi.fn());
const matched = vi.hoisted(() => ({ list: [] as unknown[], departure: 390 }));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => db.users) },
    appEvent: { findMany: vi.fn(async () => db.sent) },
    trip: { findMany: vi.fn(async () => db.trips) },
    shift: { findMany: vi.fn(async () => db.shifts) },
  },
}));
vi.mock("../../lib/push.js", () => ({ sendPushNotifications }));
vi.mock("../../services/appEvents.js", () => ({ logEvent }));
vi.mock("../../services/roadAlerts.js", () => ({
  roadAlertsAvailable: () => ({ incidents: true, plannedWorks: false }),
  pruneRoadAlertCaches: () => {},
  // Usual Monday departure (06:30 UK unless a test changes it)
  loadDepartureProfiles: async (ids: string[]) =>
    new Map(ids.map((id) => [id, { byWeekday: [null, matched.departure, null, null, null, null, null] }])),
  matchedEventsForDriver: async () => ({ corridor: {}, matches: matched.list }),
}));
vi.mock("../../services/tomtomTraffic.js", () => ({
  budgetSnapshot: async () => ({ day: "2026-10-05", used: 4, stopped: null, cap: 2000 }),
  pruneTileCache: () => {},
}));
vi.mock("../../services/streetManager.js", () => ({ purgeEndedStreetWorks: async () => 0 }));

import { runRoadAlertsJob } from "../../jobs/roadAlerts.js";
import { parseTomTomIncidents } from "../../services/roadEvents.js";

const FIX = path.resolve(__dirname, "../fixtures/roadAlerts");
const events = parseTomTomIncidents(JSON.parse(readFileSync(path.join(FIX, "tomtom-incidents.json"), "utf8")));
const closure = events.find((e) => e.id === "tt:m6-sb-closure")!;

// Monday 5 Oct 2026 (BST). 05:50 UK = 04:50Z: 40 minutes before 06:30.
const SEND_TICK = new Date("2026-10-05T04:50:00Z");

beforeEach(() => {
  db.users = [
    { id: "u1", pushToken: "ExponentPushToken[x]", pushPrefs: { roadAlerts: true }, autoRecordingActive: false, recordingStartedAt: null },
  ];
  db.sent = [];
  db.trips = [];
  db.shifts = [];
  matched.list = [{ event: closure, days: 9 }];
  matched.departure = 390;
  sendPushNotifications.mockReset();
  sendPushNotifications.mockResolvedValue([{ status: "ok" }]);
  logEvent.mockReset();
});

describe("runRoadAlertsJob", () => {
  it("sends one push in the window, routed to the Road alerts screen, using the 05:00-07:59 exemption", async () => {
    const r = await runRoadAlertsJob(SEND_TICK);
    expect(r?.sent).toBe(1);
    const [messages, opts] = sendPushNotifications.mock.calls[0];
    expect(messages[0].title).toBe("Before you set off: M6 closed");
    expect(messages[0].data).toMatchObject({ action: "open_road_alerts", eventId: closure.id });
    expect(opts).toEqual({ ignoreQuietHours: true });
    expect(logEvent).toHaveBeenCalledWith("road_alert.sent", "u1", expect.objectContaining({ eventIds: [closure.id], quietHoursExempt: true }));
  });

  it("outside quiet hours the exemption flag is off", async () => {
    matched.departure = 10 * 60 + 30; // 10:30 UK
    // The fixture closure ends at 10:00 UK, before this departure, so it
    // would rightly not be sent; use one that runs until 13:00.
    matched.list = [{ event: { ...closure, endAt: new Date("2026-10-05T12:00:00Z") }, days: 9 }];
    const r = await runRoadAlertsJob(new Date("2026-10-05T08:50:00Z")); // 09:50 UK
    expect(r?.sent).toBe(1);
    expect(sendPushNotifications.mock.calls[0][1]).toEqual({ ignoreQuietHours: false });
  });

  it("outside the driver's window nothing happens", async () => {
    const r = await runRoadAlertsJob(new Date("2026-10-05T09:00:00Z")); // 10:00 UK
    expect(r?.sent).toBe(0);
    expect(r?.skipped.outside_window).toBe(1);
  });

  it("at most one a day", async () => {
    db.sent = [{ userId: "u1", metadata: { eventIds: ["tt:other"] }, createdAt: new Date("2026-10-05T04:40:00Z") }];
    const r = await runRoadAlertsJob(SEND_TICK);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.already_sent_today).toBe(1);
  });

  it("never the same event twice (sent last week)", async () => {
    db.sent = [{ userId: "u1", metadata: { eventIds: [closure.id] }, createdAt: new Date("2026-09-30T05:00:00Z") }];
    const r = await runRoadAlertsJob(SEND_TICK);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.nothing_serious).toBe(1);
  });

  it("not while they are likely driving", async () => {
    db.trips = [{ userId: "u1", startedAt: new Date("2026-10-05T04:30:00Z"), endedAt: new Date("2026-10-05T04:45:00Z") }];
    const r = await runRoadAlertsJob(SEND_TICK);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.likely_driving).toBe(1);
  });

  it("never before 05:00 UK, even in the driver's window", async () => {
    matched.departure = 5 * 60 + 10; // 05:10 UK -> window 04:25-04:45
    const r = await runRoadAlertsJob(new Date("2026-10-05T03:30:00Z")); // 04:30 UK
    expect(r?.sent).toBe(0);
    expect(r?.skipped.quiet_hours).toBe(1);
  });

  it("never in the evening part of quiet hours", async () => {
    matched.departure = 22 * 60; // 22:00 UK -> window 21:15-21:35
    const r = await runRoadAlertsJob(new Date("2026-10-05T20:20:00Z")); // 21:20 UK
    expect(r?.sent).toBe(0);
    expect(r?.skipped.quiet_hours).toBe(1);
  });

  it("does nothing for drivers who have not opted in (the JSON filter is re-checked in JS)", async () => {
    db.users = [{ id: "u2", pushToken: "ExponentPushToken[y]", pushPrefs: { roadAlerts: "yes" }, autoRecordingActive: false, recordingStartedAt: null }];
    const r = await runRoadAlertsJob(SEND_TICK);
    expect(r?.candidates).toBe(0);
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("a failed push is not recorded, so the next tick can try again", async () => {
    sendPushNotifications.mockResolvedValue([{ status: "error", message: "quiet_hours" }]);
    const r = await runRoadAlertsJob(SEND_TICK);
    expect(r?.sent).toBe(0);
    expect(logEvent).not.toHaveBeenCalled();
  });
});
