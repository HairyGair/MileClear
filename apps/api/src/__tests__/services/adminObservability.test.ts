import { describe, expect, it } from "vitest";
import {
  ageHours,
  classifyAndroidTester,
  feedbackIsOpen,
  lastReplyBy,
  liveActivityRollup,
  handledReportIds,
  missingTripAnswered,
  tripQualityRollup,
} from "../../services/adminObservability.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-09T09:00:00Z");

describe("support queue helpers", () => {
  it("treats done-like statuses as closed and everything else as open", () => {
    expect(feedbackIsOpen("new")).toBe(true);
    expect(feedbackIsOpen("in_progress")).toBe(true);
    expect(feedbackIsOpen("done")).toBe(false);
    expect(feedbackIsOpen("Closed")).toBe(false);
    expect(feedbackIsOpen(null)).toBe(true);
  });

  it("names who replied last", () => {
    expect(lastReplyBy([])).toBeNull();
    expect(
      lastReplyBy([
        { createdAt: new Date(NOW - DAY), isAdmin: true },
        { createdAt: new Date(NOW), isAdmin: false },
      ])
    ).toBe("user");
    expect(
      lastReplyBy([
        { createdAt: new Date(NOW), isAdmin: true },
        { createdAt: new Date(NOW - DAY), isAdmin: false },
      ])
    ).toBe("admin");
  });

  it("measures age in hours to one decimal", () => {
    expect(ageHours(NOW, new Date(NOW - 90 * 60 * 1000))).toBe(1.5);
    expect(ageHours(NOW, new Date(NOW + DAY))).toBe(0);
  });

  it("counts a report answered only by a later reply or admin-added trip", () => {
    const at = new Date(NOW - DAY);
    expect(missingTripAnswered(at, [])).toBe(false);
    expect(missingTripAnswered(at, [{ type: "support.reply_sent", createdAt: new Date(NOW - 2 * DAY) }])).toBe(false);
    expect(missingTripAnswered(at, [{ type: "support.reply_sent", createdAt: new Date(NOW) }])).toBe(true);
    expect(missingTripAnswered(at, [{ type: "admin.trip_created", createdAt: new Date(NOW) }])).toBe(true);
    expect(missingTripAnswered(at, [{ type: "trip.created", createdAt: new Date(NOW) }])).toBe(false);
  });

  it("collects the report ids an admin has marked handled", () => {
    const ids = handledReportIds([
      { metadata: { reportEventId: "a" } },
      { metadata: { reportEventId: "b", note: "answered before logging existed" } },
    ]);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("ignores handled rows with no usable report id rather than throwing", () => {
    const ids = handledReportIds([
      { metadata: null },
      { metadata: {} },
      { metadata: { reportEventId: "" } },
      { metadata: { reportEventId: 42 } },
      { metadata: "nonsense" },
    ]);
    expect(ids.size).toBe(0);
  });
});

describe("classifyAndroidTester", () => {
  const base = {
    createdAt: new Date(NOW - 10 * DAY),
    lastHeartbeatAt: new Date(NOW - DAY),
    bgLocationPermission: "granted",
    now: NOW,
  };

  it("flags Jenny's pattern as stub fixes", () => {
    expect(classifyAndroidTester({ ...base, autoTrips7d: 5, stubTrips7d: 3 })).toBe("stub_fixes");
  });

  it("calls a healthy tester capturing", () => {
    expect(classifyAndroidTester({ ...base, autoTrips7d: 6, stubTrips7d: 1 })).toBe("capturing");
  });

  it("separates new, silent, no-permission and gone", () => {
    expect(classifyAndroidTester({ ...base, createdAt: new Date(NOW - DAY), autoTrips7d: 0, stubTrips7d: 0 })).toBe("new");
    expect(classifyAndroidTester({ ...base, autoTrips7d: 0, stubTrips7d: 0 })).toBe("silent");
    expect(classifyAndroidTester({ ...base, bgLocationPermission: "denied", autoTrips7d: 0, stubTrips7d: 0 })).toBe(
      "no_permission"
    );
    expect(classifyAndroidTester({ ...base, lastHeartbeatAt: new Date(NOW - 20 * DAY), autoTrips7d: 3, stubTrips7d: 0 })).toBe(
      "gone"
    );
    expect(classifyAndroidTester({ ...base, lastHeartbeatAt: null, autoTrips7d: 0, stubTrips7d: 0 })).toBe("gone");
  });
});

describe("liveActivityRollup", () => {
  it("buckets push starts, presence and progress by outcome and build", () => {
    const r = liveActivityRollup([
      { type: "la.push_start", buildNumber: "89", metadata: { ok: true } },
      { type: "la.push_start", buildNumber: "89", metadata: { ok: false, reason: "no_token" } },
      { type: "la.push_start", buildNumber: "87", metadata: { ok: false, reason: "suppressed_by_pref" } },
      { type: "la.push_start", buildNumber: "87", metadata: { ok: false, reason: "apns_410" } },
      { type: "la.presence_check", buildNumber: "89", metadata: { present: true } },
      { type: "la.presence_check", buildNumber: "89", metadata: { present: false } },
      { type: "la.presence_check", buildNumber: "87", metadata: { present: false } },
      { type: "la.foreground_heal", buildNumber: "89", metadata: {} },
      { type: "la.progress_update", buildNumber: "89", metadata: { found: true } },
      { type: "la.progress_update", buildNumber: "89", metadata: { found: false } },
      { type: "trip.created", buildNumber: "89", metadata: {} },
    ]);
    expect(r.pushStarts).toEqual({ ok: 1, noToken: 1, suppressedByPref: 1, other: 1 });
    expect(r.presence).toEqual({ checks: 3, present: 1, rate: 33.3 });
    expect(r.foregroundHeals).toBe(1);
    expect(r.progressUpdates).toEqual({ found: 1, notFound: 1 });
    expect(r.byBuild).toEqual([
      { buildNumber: "89", checks: 2, present: 1 },
      { buildNumber: "87", checks: 1, present: 0 },
    ]);
  });

  it("returns a null rate with no checks", () => {
    expect(liveActivityRollup([]).presence.rate).toBeNull();
  });
});

describe("tripQualityRollup", () => {
  it("counts stubs, phantoms and per-platform rates", () => {
    const r = tripQualityRollup([
      { isManualEntry: false, isPhantomTrip: false, coordinateCount: 200, platform: "ios" },
      { isManualEntry: false, isPhantomTrip: false, coordinateCount: 2, platform: "android" },
      { isManualEntry: false, isPhantomTrip: true, coordinateCount: 4, platform: "android" },
      { isManualEntry: false, isPhantomTrip: false, coordinateCount: 3, platform: null },
      { isManualEntry: true, isPhantomTrip: false, coordinateCount: 40, platform: "ios" },
    ]);
    expect(r.autoTrips).toBe(4);
    expect(r.manualTrips).toBe(1);
    expect(r.stubTrips).toBe(2);
    expect(r.stubRate).toBe(50);
    expect(r.phantomFlagged).toBe(1);
    expect(r.avgCoords).toBe(52);
    expect(r.byPlatform).toEqual([
      { platform: "android", autoTrips: 2, stubTrips: 1, stubRate: 50 },
      { platform: "ios", autoTrips: 1, stubTrips: 0, stubRate: 0 },
      { platform: "unknown", autoTrips: 1, stubTrips: 1, stubRate: 100 },
    ]);
  });

  it("handles an empty week", () => {
    const r = tripQualityRollup([]);
    expect(r.stubRate).toBeNull();
    expect(r.avgCoords).toBeNull();
    expect(r.byPlatform).toEqual([]);
  });
});
