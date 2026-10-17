/**
 * "Road reopened" job (Oct 2026): off unless ROAD_REOPENED_PUSH=1, nothing in
 * quiet hours, only drivers with road alerts on whose usual roads the closure
 * was on, one a day, never twice for the same works, never for a dismissed
 * closure, respects the road alerts daily cap, never while driving, and every
 * push opens Road alerts. Streets are made up (the repo is public).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  users: [] as unknown[],
  pending: [] as { createdAt: Date; metadata: unknown }[],
  sent: [] as { userId: string; type: string; metadata: unknown; createdAt: Date }[],
  works: [] as unknown[],
  trips: [] as { userId: string; startedAt: Date; endedAt: Date | null }[],
  shifts: [] as { userId: string; startedAt: Date }[],
  dismissed: new Map<string, Set<string>>(),
}));
const sendPushNotifications = vi.hoisted(() => vi.fn());
const logEvent = vi.hoisted(() => vi.fn());

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => db.users) },
    appEvent: {
      findMany: vi.fn(async (args: { where: { type: unknown } }) =>
        args.where.type === "road_alert.reopened_pending" ? db.pending : db.sent
      ),
    },
    streetWorksEvent: {
      findMany: vi.fn(async (args: { where: { reference: { in: string[] } } }) =>
        (db.works as { reference: string }[]).filter((w) => args.where.reference.in.includes(w.reference))
      ),
    },
    trip: { findMany: vi.fn(async () => db.trips) },
    shift: { findMany: vi.fn(async () => db.shifts) },
  },
}));
vi.mock("../../lib/push.js", () => ({ sendPushNotifications }));
vi.mock("../../services/appEvents.js", () => ({ logEvent }));
vi.mock("../../services/streetManager.js", () => ({ isStreetManagerEnabled: () => true }));
vi.mock("../../services/roadAlerts.js", () => ({
  loadCorridor: async () => ({ cells: new Map([["c", { days: 5, bins: 0 }]]), bbox: { minLat: 52, maxLat: 53, minLng: -2, maxLng: -1 }, drivingDays: 5 }),
  loadDismissedIds: async (ids: string[]) => new Map(ids.map((id) => [id, db.dismissed.get(id) ?? new Set<string>()])),
}));
// On "their roads" means south of 53 degrees in these tests.
vi.mock("../../services/roadCorridor.js", async (orig) => ({
  ...(await orig<typeof import("../../services/roadCorridor.js")>()),
  matchEventToCorridor: (_c: unknown, g: { lines: [number, number][][]; points: [number, number][] }) => {
    const p = g.lines[0]?.[0] ?? g.points[0];
    const on = p != null && p[0] < 53;
    return { matched: on, days: on ? 7 : 0, matchedMetres: 0 };
  },
}));

import { runRoadReopenedJob } from "../../jobs/roadReopened.js";
import { ROAD_REOPENED_SENT_EVENT } from "../../services/roadReopenedRule.js";
import { ROAD_ALERT_SENT_EVENT } from "../../services/roadAlertsRule.js";

// Wednesday 14 Oct 2026, 11:00 BST.
const NOW = new Date("2026-10-14T10:00:00Z");
const H = 3600000;

function pending(reference: string, over: Record<string, unknown> = {}) {
  return {
    createdAt: new Date(NOW.getTime() - 2 * H),
    metadata: {
      reference,
      streetName: "TEST ROAD",
      town: "TESTTOWN",
      promoter: null,
      workCategory: "standard",
      startedAt: new Date(NOW.getTime() - 50 * H).toISOString(),
      finishedAt: new Date(NOW.getTime() - 2 * H).toISOString(),
      plannedEndAt: new Date(NOW.getTime() + 70 * H).toISOString(),
      lines: [[[52.5, -1.5], [52.501, -1.5]]],
      points: [],
      ...over,
    },
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
  process.env.ROAD_REOPENED_PUSH = "1";
  db.users = [user("u1")];
  db.pending = [pending("REF1-01")];
  db.sent = [];
  db.works = [];
  db.trips = [];
  db.shifts = [];
  db.dismissed = new Map();
  sendPushNotifications.mockReset();
  sendPushNotifications.mockImplementation(async (msgs: unknown[]) => msgs.map(() => ({ status: "ok" })));
  logEvent.mockReset();
});
afterEach(() => {
  delete process.env.ROAD_REOPENED_PUSH;
});

describe("runRoadReopenedJob", () => {
  it("does nothing unless ROAD_REOPENED_PUSH=1", async () => {
    delete process.env.ROAD_REOPENED_PUSH;
    expect(await runRoadReopenedJob(NOW)).toBeUndefined();
    process.env.ROAD_REOPENED_PUSH = "true";
    expect(await runRoadReopenedJob(NOW)).toBeUndefined();
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("does nothing in quiet hours (the reopening waits for 08:00)", async () => {
    expect(await runRoadReopenedJob(new Date("2026-10-14T21:00:00Z"))).toBeUndefined(); // 22:00 BST
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("sends Road reopened, opening Road alerts, and logs the works reference only", async () => {
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(1);
    const [messages] = sendPushNotifications.mock.calls[0];
    expect(messages[0]).toMatchObject({
      to: "ExponentPushToken[u1]",
      title: "Road reopened",
      body: "Test Road has reopened, earlier than planned.",
    });
    expect(messages[0].data).toMatchObject({ type: "road_reopened", action: "open_road_alerts", eventId: "sm:REF1-01" });
    const sent = logEvent.mock.calls.find((c) => c[0] === ROAD_REOPENED_SENT_EVENT)!;
    expect(sent[1]).toBe("u1");
    expect(sent[2]).toMatchObject({ reference: "REF1-01" });
    expect(JSON.stringify(sent[2])).not.toMatch(/Test Road|TEST ROAD|Testtown/i);
  });

  it("only to drivers whose usual roads the closure was on", async () => {
    db.pending = [pending("REF9-01", { lines: [[[54.9, -1.5], [54.901, -1.5]]] })];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.not_on_their_roads).toBe(1);
  });

  it("never for a closure the driver dismissed", async () => {
    db.dismissed.set("u1", new Set(["sm:REF1-01"]));
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.dismissed).toBe(1);
  });

  it("dedupe: never twice for the same works", async () => {
    db.sent = [{ userId: "u1", type: ROAD_REOPENED_SENT_EVENT, metadata: { reference: "REF1-01" }, createdAt: new Date(NOW.getTime() - 30 * H) }];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.already_told).toBe(1);
  });

  it("at most one a day", async () => {
    db.pending = [pending("REF1-01"), pending("REF2-01", { streetName: "MILL LANE", lines: [[[52.6, -1.5], [52.601, -1.5]]] })];
    db.sent = [{ userId: "u1", type: ROAD_REOPENED_SENT_EVENT, metadata: { reference: "REF2-01" }, createdAt: new Date(NOW.getTime() - 1 * H) }];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.reopened_sent_today).toBe(1);
  });

  it("two reopenings at once make one push", async () => {
    db.pending = [pending("REF1-01"), pending("REF2-01", { streetName: "OTHER STREET", lines: [[[52.6, -1.5], [52.601, -1.5]]] })];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(1);
    expect(sendPushNotifications.mock.calls[0][0]).toHaveLength(1);
  });

  it("a permit and its activity for one closure are one closure, logged with both references", async () => {
    db.pending = [pending("REF1-01"), pending("ARN-1", { lines: [[[52.5004, -1.5], [52.502, -1.5]]] })];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.pending).toBe(1);
    expect(r?.sent).toBe(1);
    const sent = logEvent.mock.calls.find((c) => c[0] === ROAD_REOPENED_SENT_EVENT)!;
    expect((sent[2] as { references: string[] }).references.sort()).toEqual(["ARN-1", "REF1-01"]);
  });

  it("dismissing the activity hides the permit's reopening (same street, same place)", async () => {
    db.dismissed.set("u1", new Set(["sm:ARN-9"]));
    db.works = [{ reference: "ARN-9", streetName: "Test Road", geometry: { lines: [[[52.5003, -1.5], [52.502, -1.5]]], points: [] } }];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.dismissed).toBe(1);
  });

  it("told about the activity already: not told again about the permit", async () => {
    db.pending = [pending("REF1-01"), pending("ARN-1", { lines: [[[52.5004, -1.5], [52.502, -1.5]]] })];
    db.sent = [
      { userId: "u1", type: ROAD_REOPENED_SENT_EVENT, metadata: { reference: "ARN-1", references: ["ARN-1"] }, createdAt: new Date(NOW.getTime() - 30 * H) },
    ];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.already_told).toBe(1);
  });

  it("freshness is counted from when the road reopened, not when the message arrived", async () => {
    // Reported 2 hours ago, but the road reopened 16 hours ago.
    db.pending = [pending("REF1-01", { finishedAt: new Date(NOW.getTime() - 16 * H).toISOString() })];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.pending).toBe(0);
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("respects the one-road-alert-a-day cap", async () => {
    db.sent = [{ userId: "u1", type: ROAD_ALERT_SENT_EVENT, metadata: { eventIds: ["tt:x"] }, createdAt: new Date(NOW.getTime() - 3 * H) }];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.road_alert_cap_today).toBe(1);
  });

  it("not while likely driving", async () => {
    db.trips = [{ userId: "u1", startedAt: new Date(NOW.getTime() - 5 * 60000), endedAt: null }];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.likely_driving).toBe(1);
  });

  it("not when the closure is back in place (a work stop reverted)", async () => {
    db.works = [
      { reference: "REF1-01", workStatus: "in_progress", trafficManagement: "road_closure", startAt: new Date(NOW.getTime() - 50 * H), endAt: new Date(NOW.getTime() + 70 * H) },
    ];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.sent).toBe(0);
    expect(r?.skipped.closure_back_in_place).toBe(1);
  });

  it("drivers who have not switched road alerts on are never candidates", async () => {
    db.users = [{ ...user("u2"), pushPrefs: { roadAlerts: false } }];
    const r = await runRoadReopenedJob(NOW);
    expect(r?.candidates).toBe(0);
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });
});
