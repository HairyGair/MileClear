/**
 * "Next week on your roads" job (Oct 2026): off unless ROAD_WEEK_AHEAD_PUSH=1,
 * Sunday 18:00-19:59 UK only (BST and GMT), one push per driver per week,
 * respects the road alerts daily cap, never while driving, logs counts only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  users: [] as unknown[],
  events: [] as { userId: string; type: string; metadata: unknown; createdAt: Date }[],
  trips: [] as { userId: string; startedAt: Date; endedAt: Date | null }[],
  shifts: [] as { userId: string; startedAt: Date }[],
}));
const sendPushNotifications = vi.hoisted(() => vi.fn());
const logEvent = vi.hoisted(() => vi.fn());
const selection = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => db.users) },
    appEvent: { findMany: vi.fn(async () => db.events) },
    trip: { findMany: vi.fn(async () => db.trips) },
    shift: { findMany: vi.fn(async () => db.shifts) },
  },
}));
vi.mock("../../lib/push.js", () => ({ sendPushNotifications }));
vi.mock("../../services/appEvents.js", () => ({ logEvent }));
vi.mock("../../services/streetManager.js", () => ({ isStreetManagerEnabled: () => true }));
vi.mock("../../services/roadAlerts.js", () => ({
  loadCorridor: async () => ({ cells: new Map([["c", { days: 5, bins: 0 }]]), bbox: { minLat: 50, maxLat: 50.1, minLng: -2, maxLng: -1.9 }, drivingDays: 5 }),
  loadDismissedIds: async (ids: string[]) => new Map(ids.map((id) => [id, new Set<string>()])),
}));
vi.mock("../../services/roadWeekAhead.js", () => ({
  weekAheadForCorridor: async () => selection.value,
}));

import { runRoadWeekAheadJob, alreadySentForWeek } from "../../jobs/roadWeekAhead.js";
import { WEEK_AHEAD_SENT_EVENT, WEEK_AHEAD_SKIPPED_EVENT } from "../../services/roadWeekAheadRule.js";
import { ROAD_ALERT_SENT_EVENT } from "../../services/roadAlertsRule.js";

// Sunday 18 Oct 2026, 18:00 BST; Sunday 25 Oct 2026, 18:00 GMT.
const SUN_BST = new Date("2026-10-18T17:00:00Z");
const SUN_GMT = new Date("2026-10-25T18:00:00Z");

function closureSelection() {
  const group = {
    id: "sm:A",
    members: [{ event: { id: "sm:A" }, days: 6 }],
    lead: { id: "sm:A", town: "Testtown" },
    roads: ["Test Road"],
    startAt: new Date("2026-10-20T07:00:00Z"),
    days: 6,
  };
  return {
    items: [{ group, tier: 0, trafficManagement: "road_closure", trafficSensitive: false, promoter: "BT" }],
    more: 0,
    total: 3,
  };
}

const user = (id: string) => ({
  id,
  pushToken: `ExponentPushToken[${id}]`,
  pushPrefs: { roadAlerts: true },
  autoRecordingActive: false,
  recordingStartedAt: null,
});

beforeEach(() => {
  process.env.ROAD_WEEK_AHEAD_PUSH = "1";
  db.users = [user("u1")];
  db.events = [];
  db.trips = [];
  db.shifts = [];
  selection.value = closureSelection();
  sendPushNotifications.mockReset();
  sendPushNotifications.mockImplementation(async (msgs: unknown[]) => msgs.map(() => ({ status: "ok" })));
  logEvent.mockReset();
});
afterEach(() => {
  delete process.env.ROAD_WEEK_AHEAD_PUSH;
});

describe("runRoadWeekAheadJob", () => {
  it("does nothing unless ROAD_WEEK_AHEAD_PUSH=1", async () => {
    delete process.env.ROAD_WEEK_AHEAD_PUSH;
    expect(await runRoadWeekAheadJob(SUN_BST)).toBeUndefined();
    process.env.ROAD_WEEK_AHEAD_PUSH = "true";
    expect(await runRoadWeekAheadJob(SUN_BST)).toBeUndefined();
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("does nothing outside Sunday 18:00-19:59 UK", async () => {
    expect(await runRoadWeekAheadJob(new Date("2026-10-18T16:30:00Z"))).toBeUndefined(); // 17:30 BST
    expect(await runRoadWeekAheadJob(new Date("2026-10-18T19:00:00Z"))).toBeUndefined(); // 20:00 BST
    expect(await runRoadWeekAheadJob(new Date("2026-10-25T17:30:00Z"))).toBeUndefined(); // 17:30 GMT
    expect(await runRoadWeekAheadJob(new Date("2026-10-19T17:00:00Z"))).toBeUndefined(); // Monday
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("sends one push opening Road alerts at the week section, and logs the week", async () => {
    const r = await runRoadWeekAheadJob(SUN_BST);
    expect(r?.sent).toBe(1);
    const [messages] = sendPushNotifications.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      to: "ExponentPushToken[u1]",
      title: "Next week on your roads",
      body: "Test Road closed from Tue 20 Oct (BT works), plus 2 more",
    });
    expect(messages[0].data).toMatchObject({ action: "open_road_alerts", section: "week", week: "2026-W43" });
    const sent = logEvent.mock.calls.find((c) => c[0] === WEEK_AHEAD_SENT_EVENT)!;
    expect(sent[1]).toBe("u1");
    expect(sent[2]).toMatchObject({ week: "2026-W43", items: 1, total: 3 });
    expect(JSON.stringify(sent[2])).not.toMatch(/Test Road|BT/);
  });

  it("works on the GMT side of the clock change, for the week of 26 Oct", async () => {
    const r = await runRoadWeekAheadJob(SUN_GMT);
    expect(r?.sent).toBe(1);
    expect(r?.weekKey).toBe("2026-W44");
  });

  it("never sends twice for the same week (a later tick in the window)", async () => {
    db.events = [{ userId: "u1", type: WEEK_AHEAD_SENT_EVENT, metadata: { week: "2026-W43" }, createdAt: SUN_BST }];
    const r = await runRoadWeekAheadJob(new Date("2026-10-18T17:30:00Z"));
    expect(r?.sent).toBe(0);
    expect(r?.skipped.already_sent_this_week).toBe(1);
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("last week's push does not block this week's", async () => {
    db.events = [
      { userId: "u1", type: WEEK_AHEAD_SENT_EVENT, metadata: { week: "2026-W42" }, createdAt: new Date("2026-10-11T17:00:00Z") },
    ];
    expect((await runRoadWeekAheadJob(SUN_BST))?.sent).toBe(1);
  });

  it("respects the one-road-alert-a-day cap", async () => {
    db.events = [
      { userId: "u1", type: ROAD_ALERT_SENT_EVENT, metadata: { eventIds: ["tt:x"] }, createdAt: new Date("2026-10-18T06:00:00Z") },
    ];
    const r = await runRoadWeekAheadJob(SUN_BST);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.road_alert_cap_today).toBe(1);
  });

  it("not while likely driving", async () => {
    db.trips = [{ userId: "u1", startedAt: new Date("2026-10-18T16:55:00Z"), endedAt: null }];
    const r = await runRoadWeekAheadJob(SUN_BST);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.likely_driving).toBe(1);
  });

  it("drivers who have not switched road alerts on are never candidates", async () => {
    db.users = [{ ...user("u2"), pushPrefs: { roadAlerts: false } }, { ...user("u3"), pushPrefs: null }];
    const r = await runRoadWeekAheadJob(SUN_BST);
    expect(r?.candidates).toBe(0);
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("nothing planned: no push, and a skipped row with counts only", async () => {
    selection.value = { items: [], more: 0, total: 0 };
    const r = await runRoadWeekAheadJob(SUN_BST);
    expect(r?.sent).toBe(0);
    const skipped = logEvent.mock.calls.find((c) => c[0] === WEEK_AHEAD_SKIPPED_EVENT)!;
    expect(skipped[1]).toBeNull();
    expect(skipped[2]).toEqual({ week: "2026-W43", candidates: 1, sent: 0, skipped: { nothing_planned: 1 } });
  });

  it("alreadySentForWeek reads only week-ahead rows for that week", () => {
    expect(alreadySentForWeek([{ type: WEEK_AHEAD_SENT_EVENT, metadata: { week: "2026-W43" } }], "2026-W43")).toBe(true);
    expect(alreadySentForWeek([{ type: ROAD_ALERT_SENT_EVENT, metadata: { week: "2026-W43" } }], "2026-W43")).toBe(false);
    expect(alreadySentForWeek([{ type: WEEK_AHEAD_SENT_EVENT, metadata: null }], "2026-W43")).toBe(false);
  });
});
