/**
 * Road alerts trial (2 Oct 2026): parsing TomTom incidents and Street Manager
 * open data into one RoadEvent shape, and the severity filter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  bngToOsgb36,
  bngToWgs84,
  combineDateTime,
  normaliseEventType,
  parseBngWkt,
  parseStreetManagerMessage,
  parseTomTomIncidents,
  streetWorksToRoadEvent,
  tomtomSeverity,
} from "../../services/roadEvents.js";
import { haversineMetres } from "../../services/roadCorridor.js";

const FIX = path.resolve(__dirname, "../fixtures/roadAlerts");
const tomtom = JSON.parse(readFileSync(path.join(FIX, "tomtom-incidents.json"), "utf8"));
const sm = JSON.parse(readFileSync(path.join(FIX, "street-manager-messages.json"), "utf8"));

describe("parseTomTomIncidents", () => {
  const events = parseTomTomIncidents(tomtom);
  const byId = new Map(events.map((e) => [e.id, e]));

  it("drops jams: daily congestion is the sat-nav's job", () => {
    expect(byId.has("tt:a1-jam")).toBe(false);
    expect(events).toHaveLength(5);
  });

  it("reads a motorway closure: road, stretch, times, direction of travel", () => {
    const e = byId.get("tt:m6-sb-closure")!;
    expect(e.severity).toBe("closure");
    expect(e.category).toBe("road_closed");
    expect(e.road).toBe("M6");
    expect(e.from).toBe("J14 (Stafford)");
    expect(e.to).toBe("J13 (Stafford South)");
    expect(e.endAt?.toISOString()).toBe("2026-10-05T09:00:00.000Z");
    expect(e.directionMode).toBe("along");
    // TomTom coordinates are [lng, lat]; we store [lat, lng]
    expect(e.lines[0][0]).toEqual([52.777935, -2.118535]);
    // Southbound: bearing roughly 160-200 degrees
    expect(e.bearing!).toBeGreaterThan(150);
    expect(e.bearing!).toBeLessThan(210);
  });

  it("an accident with a 25 minute delay is major and keeps both descriptions", () => {
    const e = byId.get("tt:m6-nb-accident")!;
    expect(e.severity).toBe("major");
    expect(e.delayMinutes).toBe(25);
    expect(e.description).toBe("Accident, Lane closed");
    expect(e.bearing! < 30 || e.bearing! > 330).toBe(true); // northbound
  });

  it("future roadworks are flagged future and have no direction (a point)", () => {
    const e = byId.get("tt:a34-works")!;
    expect(e.future).toBe(true);
    expect(e.severity).toBe("minor");
    expect(e.directionMode).toBe("none");
    expect(e.points).toEqual([[52.8012, -2.1235]]);
  });

  it("a short breakdown delay is minor; an unlikely lane closure is minor whatever the delay", () => {
    expect(byId.get("tt:a518-breakdown")!.severity).toBe("minor");
    expect(byId.get("tt:a449-risk")!.severity).toBe("minor");
  });

  it("survives junk", () => {
    expect(parseTomTomIncidents(null)).toEqual([]);
    expect(parseTomTomIncidents({ incidents: [{ properties: {} }, { properties: { id: "x" } }] })).toEqual([]);
  });
});

describe("tomtomSeverity", () => {
  it("closure icon anywhere = closure", () => {
    expect(tomtomSeverity({ iconCategory: 9, eventIcons: [8] })).toBe("closure");
  });
  it("15 minutes of delay is the line for major", () => {
    expect(tomtomSeverity({ iconCategory: 7, delaySeconds: 899 })).toBe("minor");
    expect(tomtomSeverity({ iconCategory: 7, delaySeconds: 900 })).toBe("major");
  });
  it("TomTom's major magnitude counts; 'undefined' (4) alone does not", () => {
    expect(tomtomSeverity({ iconCategory: 1, magnitudeOfDelay: 3 })).toBe("major");
    expect(tomtomSeverity({ iconCategory: 1, magnitudeOfDelay: 4 })).toBe("minor");
  });
  it("improbable events are never serious", () => {
    expect(tomtomSeverity({ iconCategory: 8, probabilityOfOccurrence: "improbable" })).toBe("minor");
  });
});

describe("British National Grid", () => {
  it("matches the Ordnance Survey worked example (OSGB36)", () => {
    // E 651409.903, N 313177.270 -> 52 39' 27.2531" N, 1 43' 4.5177" E
    const [lat, lng] = bngToOsgb36(651409.903, 313177.27);
    expect(lat).toBeCloseTo(52 + 39 / 60 + 27.2531 / 3600, 5);
    expect(lng).toBeCloseTo(1 + 43 / 60 + 4.5177 / 3600, 5);
  });

  it("the WGS84 shift is the usual 50-150 m", () => {
    const os = bngToOsgb36(651409.903, 313177.27);
    const wgs = bngToWgs84(651409.903, 313177.27);
    const d = haversineMetres(os, wgs);
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(150);
  });

  it("puts the Street Manager docs' Church Street, Westminster point in Marylebone", () => {
    const [lat, lng] = bngToWgs84(527155.33, 182227.95);
    expect(lat).toBeGreaterThan(51.51);
    expect(lat).toBeLessThan(51.53);
    expect(lng).toBeGreaterThan(-0.18);
    expect(lng).toBeLessThan(-0.16);
  });

  it("parses WKT shapes", () => {
    expect(parseBngWkt("POINT(527155.33 182227.95)").points).toHaveLength(1);
    const line = parseBngWkt("LINESTRING(501251.53 222574.64,501305.92 222506.65)");
    expect(line.lines).toHaveLength(1);
    expect(line.lines[0]).toHaveLength(2);
    const multi = parseBngWkt("MULTILINESTRING((500000 200000,500100 200100),(500200 200200,500300 200300))");
    expect(multi.lines).toHaveLength(2);
    expect(parseBngWkt("GEOMETRYCOLLECTION(...)")).toEqual({ lines: [], points: [] });
    expect(parseBngWkt(null)).toEqual({ lines: [], points: [] });
  });
});

describe("parseStreetManagerMessage", () => {
  it("reads the SNS notification's Message string (docs example)", () => {
    const change = parseStreetManagerMessage(sm.snsNotification.Message);
    expect(change.kind).toBe("upsert");
    if (change.kind !== "upsert") return;
    const r = change.record;
    expect(r.reference).toBe("0000218889274-01");
    expect(r.trafficManagement).toBe("road_closure");
    expect(r.isTrafficSensitive).toBe(true);
    expect(r.streetName).toBe("CHURCH STREET");
    // Actual start wins over the proposed date
    expect(r.startAt?.toISOString()).toBe("2026-10-05T10:11:00.000Z");
    // Proposed end with no time = the end of that day
    expect(r.endAt?.toISOString()).toBe("2026-10-09T22:59:59.000Z");
    expect(r.points).toHaveLength(1);
  });

  it("the CURRENT traffic management wins: a closure eased to signals is no longer a closure", () => {
    const change = parseStreetManagerMessage(sm.permitLinestring);
    expect(change.kind).toBe("upsert");
    if (change.kind !== "upsert") return;
    expect(change.record.trafficManagement).toBe("multi_way_signals");
    expect(change.record.startAt?.toISOString()).toBe("2026-10-10T13:50:00.000Z");
    expect(change.record.lines[0]).toHaveLength(2);
    const ev = streetWorksToRoadEvent({ ...change.record }, new Date("2026-10-05T07:00:00Z"));
    expect(ev.severity).toBe("minor");
    expect(ev.future).toBe(true);
    expect(ev.road).toBe("High Street North");
  });

  it("an activity with a road closure becomes a closure", () => {
    const change = parseStreetManagerMessage(sm.activity);
    expect(change.kind).toBe("upsert");
    if (change.kind !== "upsert") return;
    const ev = streetWorksToRoadEvent(change.record, new Date("2026-10-05T07:00:00Z"));
    expect(ev.id).toBe("sm:ARN-5990-85775436");
    expect(ev.severity).toBe("closure");
    expect(ev.directionMode).toBe("axis");
  });

  it("cancellations delete, Section 58 notices are ignored", () => {
    const cancelled = { ...sm.permitLinestring, event_type: "PERMIT_CANCELLED" };
    expect(parseStreetManagerMessage(cancelled).kind).toBe("delete");
    const actCancelled = { ...sm.activity, object_data: { ...sm.activity.object_data, cancelled: "Yes" } };
    expect(parseStreetManagerMessage(actCancelled).kind).toBe("delete");
    expect(parseStreetManagerMessage(sm.section58)).toEqual({ kind: "ignore", reason: "object_type" });
    expect(parseStreetManagerMessage("{not json")).toEqual({ kind: "ignore", reason: "bad_json" });
  });

  it("works that do not hold traffic up are dropped", () => {
    const quiet = {
      ...sm.permitLinestring,
      object_data: { ...sm.permitLinestring.object_data, current_traffic_management_type_ref: "no_carriageway_incursion" },
    };
    expect(parseStreetManagerMessage(quiet).kind).toBe("delete");
  });

  it("normalises event type spellings and Street Manager's split date/time", () => {
    expect(normaliseEventType("work-start")).toBe("work_start");
    expect(normaliseEventType("WORK_START")).toBe("work_start");
    expect(normaliseEventType("Work start")).toBe("work_start");
    expect(combineDateTime("2026-10-10T00:00:00.000Z", null, false)?.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(combineDateTime("2026-10-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z", true)?.toISOString()).toBe(
      "2026-10-10T00:00:00.000Z"
    );
    expect(combineDateTime(null, null, false)).toBeNull();
  });
});
