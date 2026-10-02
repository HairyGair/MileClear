/**
 * Road alerts trial (2 Oct 2026): which event gets the pre-departure push,
 * never repeating one, never while driving, the words, the screen split, the
 * offer card, and the 05:00-07:59 quiet-hours exemption.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseTomTomIncidents, type RoadEvent } from "../../services/roadEvents.js";
import {
  buildRoadAlertCopy,
  directionWord,
  eventHeadline,
  inEffectAt,
  isLikelyDriving,
  isNamedForPush,
  offerEligible,
  selectPushEvent,
  sentEventIdsFrom,
  splitForScreen,
  ukTimePhrase,
  type MatchedEvent,
} from "../../services/roadAlertsRule.js";
import {
  isPushQuietHours,
  roadAlertQuietHoursExempt,
} from "../../services/pushQuietHoursRule.js";
import { OPT_IN_PUSH_PREF_KEYS, pushPrefEnabled, pushPrefOptedIn, PUSH_PREF_KEYS } from "../../services/pushPrefs.js";

const FIX = path.resolve(__dirname, "../fixtures/roadAlerts");
const all = parseTomTomIncidents(JSON.parse(readFileSync(path.join(FIX, "tomtom-incidents.json"), "utf8")));
const ev = (id: string) => all.find((e) => e.id === `tt:${id}`)!;
const closure = ev("m6-sb-closure"); // 04:30-09:00Z on 5 Oct
const accident = ev("m6-nb-accident"); // 05:10-07:30Z, 25 min delay
const works = ev("a34-works"); // future, minor
const breakdown = ev("a518-breakdown"); // minor

// Monday 5 Oct 2026, BST. Usual departure 06:30 UK = 05:30Z; send tick 05:50 UK.
const NOW = new Date("2026-10-05T04:50:00Z");
const DEPART = new Date("2026-10-05T05:30:00Z");
const m = (event: RoadEvent, days = 9): MatchedEvent => ({ event, days });

describe("selectPushEvent", () => {
  it("picks the closure over a major delay, and counts the rest", () => {
    const r = selectPushEvent([m(accident), m(closure), m(breakdown)], { departureAt: DEPART, sentEventIds: new Set() });
    expect(r?.pick.event.id).toBe(closure.id);
    expect(r?.extra).toBe(1); // the accident; the breakdown is minor
  });

  it("never pushes a minor event", () => {
    expect(selectPushEvent([m(breakdown), m(works)], { departureAt: DEPART, sentEventIds: new Set() })).toBeNull();
  });

  it("never repeats an event already sent", () => {
    const r = selectPushEvent([m(closure), m(accident)], { departureAt: DEPART, sentEventIds: new Set([closure.id]) });
    expect(r?.pick.event.id).toBe(accident.id);
    expect(r?.extra).toBe(0);
    expect(
      selectPushEvent([m(closure), m(accident)], { departureAt: DEPART, sentEventIds: new Set([closure.id, accident.id]) })
    ).toBeNull();
  });

  it("only events in effect when they usually leave (or starting within the hour after)", () => {
    const over: RoadEvent = { ...closure, id: "tt:over", endAt: new Date("2026-10-05T05:00:00Z") };
    const later: RoadEvent = { ...closure, id: "tt:later", startAt: new Date("2026-10-05T07:00:00Z") };
    const soon: RoadEvent = { ...closure, id: "tt:soon", startAt: new Date("2026-10-05T06:15:00Z") };
    expect(selectPushEvent([m(over)], { departureAt: DEPART, sentEventIds: new Set() })).toBeNull();
    expect(selectPushEvent([m(later)], { departureAt: DEPART, sentEventIds: new Set() })).toBeNull();
    expect(selectPushEvent([m(soon)], { departureAt: DEPART, sentEventIds: new Set() })?.pick.event.id).toBe("tt:soon");
  });

  it("ties broken by delay, then by how often they use the road", () => {
    const a: RoadEvent = { ...accident, id: "tt:a", delayMinutes: 20 };
    const b: RoadEvent = { ...accident, id: "tt:b", delayMinutes: 40 };
    expect(selectPushEvent([m(a), m(b)], { departureAt: DEPART, sentEventIds: new Set() })?.pick.event.id).toBe("tt:b");
    const c: RoadEvent = { ...accident, id: "tt:c" };
    expect(selectPushEvent([m(accident, 3), m(c, 12)], { departureAt: DEPART, sentEventIds: new Set() })?.pick.event.id).toBe("tt:c");
  });
});

describe("sentEventIdsFrom", () => {
  it("collects ids from road_alert.sent metadata and ignores junk", () => {
    const s = sentEventIdsFrom([{ eventIds: ["tt:1", "sm:2"] }, null, { eventIds: "nope" }, { eventIds: [3, "tt:4"] }]);
    expect([...s].sort()).toEqual(["sm:2", "tt:1", "tt:4"]);
  });
});

describe("isLikelyDriving", () => {
  const quiet = { lastTripStartedAt: null, lastTripEndedAt: null, autoRecordingActive: null, recordingStartedAt: null, activeShiftStartedAt: null };
  const ago = (min: number) => new Date(NOW.getTime() - min * 60000);
  it("not driving with nothing recent", () => expect(isLikelyDriving(quiet, NOW)).toBe(false));
  it("a trip ended in the last 10 minutes", () => {
    expect(isLikelyDriving({ ...quiet, lastTripStartedAt: ago(30), lastTripEndedAt: ago(8) }, NOW)).toBe(true);
    expect(isLikelyDriving({ ...quiet, lastTripStartedAt: ago(30), lastTripEndedAt: ago(12) }, NOW)).toBe(false);
  });
  it("a trip still open, a live recording, an open shift", () => {
    expect(isLikelyDriving({ ...quiet, lastTripStartedAt: ago(40) }, NOW)).toBe(true);
    expect(isLikelyDriving({ ...quiet, autoRecordingActive: true, recordingStartedAt: ago(15) }, NOW)).toBe(true);
    expect(isLikelyDriving({ ...quiet, autoRecordingActive: true, recordingStartedAt: ago(60 * 9) }, NOW)).toBe(false);
    expect(isLikelyDriving({ ...quiet, activeShiftStartedAt: ago(120) }, NOW)).toBe(true);
  });
});

describe("push copy", () => {
  it("never pushes an unnamed road; names the stretch when there is no road number", () => {
    const now = new Date("2026-10-05T06:00:00Z");
    const base = { id: "x", source: "tomtom", severity: "closure", category: "road_closed", description: "Closed, Roadworks", directionMode: "along" } as unknown as RoadEvent;
    expect(isNamedForPush({ ...base, road: null, from: null, to: null } as RoadEvent)).toBe(false);
    expect(isNamedForPush({ ...base, road: null, from: "Saint Ives' Road", to: "A693" } as RoadEvent)).toBe(true);
    const c = buildRoadAlertCopy(m({ ...base, road: null, from: "Saint Ives' Road", to: "A693" } as RoadEvent, 4), 0, now);
    expect(c.title).toBe("Before you set off: Saint Ives' Road to A693 closed");
  });

  it("closure: road, direction, junctions, time, how often they use it", () => {
    const c = buildRoadAlertCopy(m(closure, 9), 0, NOW);
    expect(c.title).toBe("Before you set off: M6 closed");
    expect(c.body).toBe(
      "M6 southbound is closed from J14 (Stafford) to J13 (Stafford South) until about 10:00. " +
        "You've driven this way on 9 days in the last 6 weeks."
    );
  });

  it("major delay, with one more event mentioned", () => {
    const c = buildRoadAlertCopy(m(accident, 1), 1, NOW);
    expect(c.title).toBe("Before you set off: delays on the M6");
    expect(c.body).toBe(
      "M6 northbound: accident, Lane closed from J13 (Stafford South) to J14 (Stafford), delays of about 25 minutes until about 08:30. " +
        "You've driven this way on 1 day in the last 6 weeks. 1 more on your usual roads in the app."
    );
  });

  it("Street Manager closure", () => {
    const sm: RoadEvent = {
      ...closure,
      id: "sm:X",
      source: "street_manager",
      road: "Church Street",
      town: "London",
      from: null,
      to: null,
      bearing: null,
      directionMode: "axis",
      endAt: new Date("2026-10-05T17:00:00Z"),
    };
    expect(buildRoadAlertCopy(m(sm, 5), 0, NOW).body).toBe(
      "Church Street, London is closed for roadworks until 18:00. You've driven this way on 5 days in the last 6 weeks."
    );
  });

  it("no em dashes anywhere in the copy", () => {
    for (const e of all) {
      const c = buildRoadAlertCopy(m(e), 2, NOW);
      expect(c.title + c.body).not.toMatch(/—/);
    }
  });

  it("time phrases in UK time", () => {
    expect(ukTimePhrase(new Date("2026-10-05T09:00:00Z"), NOW)).toBe("10:00");
    expect(ukTimePhrase(new Date("2026-10-06T05:00:00Z"), NOW)).toBe("06:00 tomorrow");
    expect(ukTimePhrase(new Date("2026-10-10T17:00:00Z"), NOW)).toBe("18:00 on Sat 10 Oct");
  });

  it("direction words and headlines", () => {
    expect(directionWord(10)).toBe("northbound");
    expect(directionWord(95)).toBe("eastbound");
    expect(directionWord(200)).toBe("southbound");
    expect(directionWord(300)).toBe("westbound");
    expect(directionWord(null)).toBeNull();
    expect(eventHeadline(closure)).toBe("M6 southbound closed");
    expect(eventHeadline(accident)).toBe("M6 northbound: accident");
    expect(eventHeadline(works)).toBe("A34: roadworks");
  });
});

describe("splitForScreen", () => {
  it("now: serious and started; upcoming: next 7 days by start time", () => {
    const farFuture: RoadEvent = { ...works, id: "tt:far", startAt: new Date("2026-10-20T19:00:00Z") };
    const plannedClosure: RoadEvent = { ...closure, id: "tt:pc", startAt: new Date("2026-10-07T21:00:00Z"), future: true };
    const { current, upcoming } = splitForScreen(
      [m(breakdown), m(accident), m(closure), m(works), m(farFuture), m(plannedClosure)],
      new Date("2026-10-05T05:20:00Z") // the accident started at 05:10
    );
    expect(current.map((x) => x.event.id)).toEqual([closure.id, accident.id]);
    expect(upcoming.map((x) => x.event.id)).toEqual(["tt:pc", works.id]);
  });

  it("drops anything already over", () => {
    expect(inEffectAt(closure, new Date("2026-10-05T09:00:00Z"))).toBe(false);
    const { current } = splitForScreen([m(closure)], new Date("2026-10-05T10:00:00Z"));
    expect(current).toEqual([]);
  });
});

describe("offerEligible", () => {
  const trip = (iso: string, lat = 53.4, lng = -2.2) => ({ startedAt: new Date(iso), startLat: lat, startLng: lng });
  it("10 UK trips over 3 days", () => {
    const ten = Array.from({ length: 10 }, (_, i) => trip(`2026-09-2${i % 3}T08:00:00Z`));
    expect(offerEligible(ten)).toBe(true);
    expect(offerEligible(ten.slice(0, 9))).toBe(false);
    const oneDay = Array.from({ length: 12 }, () => trip("2026-09-20T08:00:00Z"));
    expect(offerEligible(oneDay)).toBe(false);
    const abroad = Array.from({ length: 12 }, (_, i) => trip(`2026-09-2${i % 3}T08:00:00Z`, 48.85, 2.35));
    expect(offerEligible(abroad)).toBe(false);
  });
});

describe("quiet hours exemption for road alerts", () => {
  it("BST: only 05:00-07:59 UK, only inside the driver's own window", () => {
    expect(roadAlertQuietHoursExempt(new Date("2026-10-05T03:59:00Z"), true)).toBe(false); // 04:59 UK
    expect(roadAlertQuietHoursExempt(new Date("2026-10-05T04:00:00Z"), true)).toBe(true); // 05:00 UK
    expect(roadAlertQuietHoursExempt(new Date("2026-10-05T06:59:00Z"), true)).toBe(true); // 07:59 UK
    expect(roadAlertQuietHoursExempt(new Date("2026-10-05T04:30:00Z"), false)).toBe(false); // not their window
  });

  it("GMT: 05:00 UK is 05:00 UTC", () => {
    expect(roadAlertQuietHoursExempt(new Date("2026-11-02T04:59:00Z"), true)).toBe(false);
    expect(roadAlertQuietHoursExempt(new Date("2026-11-02T05:00:00Z"), true)).toBe(true);
  });

  it("never in the evening part of quiet hours, and not needed in the day", () => {
    expect(isPushQuietHours(new Date("2026-10-05T20:30:00Z"))).toBe(true); // 21:30 UK
    expect(roadAlertQuietHoursExempt(new Date("2026-10-05T20:30:00Z"), true)).toBe(false);
    expect(roadAlertQuietHoursExempt(new Date("2026-10-05T09:00:00Z"), true)).toBe(false); // 10:00 UK, not quiet
  });
});

describe("push preference key", () => {
  it("roadAlerts is opt-in: off unless exactly true", () => {
    expect(PUSH_PREF_KEYS).toContain("roadAlerts");
    expect(OPT_IN_PUSH_PREF_KEYS).toContain("roadAlerts");
    expect(pushPrefOptedIn(null, "roadAlerts")).toBe(false);
    expect(pushPrefOptedIn({}, "roadAlerts")).toBe(false);
    expect(pushPrefOptedIn({ roadAlerts: "true" }, "roadAlerts")).toBe(false);
    expect(pushPrefOptedIn({ roadAlerts: true }, "roadAlerts")).toBe(true);
    // pushPrefEnabled would wrongly say on for a missing key: the job must use pushPrefOptedIn
    expect(pushPrefEnabled({}, "roadAlerts")).toBe(true);
  });
});
