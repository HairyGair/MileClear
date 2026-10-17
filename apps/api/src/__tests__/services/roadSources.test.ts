/**
 * Road alerts (17 Oct 2026): TfL, Traffic Wales and National Highways
 * planned closures. Parsing from real responses saved on 17 Oct 2026,
 * category and severity mapping, the London de-duplication against Street
 * Manager, gating, and fail-soft caching.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  minDistanceMetres,
  nhCategory,
  nhJunctions,
  oneDirection,
  parseNhClosures,
  parseRssItems,
  parseTflDisruptions,
  parseTrafficWalesRss,
  streetKey,
  tflStreetName,
  ukLocalToUtc,
  walesTitleWindows,
  withoutStreetManagerDuplicates,
} from "../../services/roadSourcesParse.js";
import {
  ATTRIBUTION_NATIONAL_HIGHWAYS,
  ATTRIBUTION_TFL,
  ATTRIBUTION_TRAFFIC_WALES,
  FEED_SPECS,
  attributionForSources,
  extraRoadEventsFor,
  extraRoadSourcesEnabled,
  resetRoadSources,
  setRoadSourcesFetch,
  sourceEvents,
} from "../../services/roadSources.js";
import { streetWorksToRoadEvent, type RoadEvent } from "../../services/roadEvents.js";
import { buildCorridor, matchEventToCorridor } from "../../services/roadCorridor.js";
import { groupMatches } from "../../services/roadAlertGroups.js";

const FIX = path.resolve(__dirname, "../fixtures/roadAlerts");
const tflJson = JSON.parse(readFileSync(path.join(FIX, "tfl-road-disruption.json"), "utf8"));
const walesXml = readFileSync(path.join(FIX, "traffic-wales-roadworks.xml"), "utf8");
const walesEmptyXml = readFileSync(path.join(FIX, "traffic-wales-incidents-empty.xml"), "utf8");
const nhJson = JSON.parse(readFileSync(path.join(FIX, "nh-closures-page.json"), "utf8"));

const NOW = new Date("2026-10-17T19:00:00Z");
const LONDON = { minLat: 51.4, maxLat: 51.6, minLng: -0.3, maxLng: 0.1 };
const CARDIFF = { minLat: 51.4, maxLat: 51.6, minLng: -3.3, maxLng: -2.9 };
const LEEDS = { minLat: 53.7, maxLat: 53.9, minLng: -1.7, maxLng: -1.4 };

// ── TfL ─────────────────────────────────────────────────────────────

describe("parseTflDisruptions (real response, 17 Oct 2026)", () => {
  const events = parseTflDisruptions(tflJson);
  const byId = new Map(events.map((e) => [e.id, e]));

  it("a closed bridge is a closure on its own street segments, either way along it", () => {
    const e = byId.get("tfl:TIMS-224034")!;
    expect(e.source).toBe("tfl");
    expect(e.category).toBe("road_closed");
    expect(e.severity).toBe("closure");
    expect(e.road).toBe("A3031 Albert Bridge Road");
    expect(e.town).toBe("Kensington & Chelsea");
    expect(e.directionMode).toBe("axis");
    expect(e.lines.length).toBeGreaterThan(0);
    expect(e.points).toHaveLength(0);
    expect(e.startAt?.toISOString()).toBe("2026-09-23T04:45:00.000Z");
  });

  it("when only a side street is closed, the card is about that street, with its direction", () => {
    const e = byId.get("tfl:TIMS-236204")!;
    expect(e.severity).toBe("closure");
    expect(e.road).toBe("A218 Buckhold Road southbound");
    expect(e.town).toBe("Wandsworth");
  });

  it("lane closures and lights without a closure stay minor (screen only, never pushed)", () => {
    const lane = byId.get("tfl:TIMS-236268")!; // A2 Blackheath Road, lane one of two closed
    expect(lane.category).toBe("lane_closed");
    expect(lane.severity).toBe("minor");
    expect(lane.points).toHaveLength(1);
    expect(lane.directionMode).toBe("none");
    const works = byId.get("tfl:TIMS-236449")!;
    expect(works.severity).toBe("minor");
  });

  it("a collision with the road shut is a closure; nothing with 'No impact' and nothing shut is kept", () => {
    expect(byId.get("tfl:TIMS-236533")).toMatchObject({ severity: "closure", description: "Closed after a collision", road: "Church Lane" });
    expect(byId.has("tfl:TIMS-235998")).toBe(false); // concert, no impact
    expect(byId.has("tfl:TIMS-233025")).toBe(false); // works, no impact
    expect(byId.has("tfl:TIMS-235277")).toBe(false); // asset issue, no impact
    // An event that does close roads stays, on the closed roads only.
    expect(byId.get("tfl:TIMS-236071")).toMatchObject({ severity: "closure", description: "Closed for an event" });
  });

  it("the recurring schedule is the window, and the one-way direction is in the label", () => {
    const e = events.find((x) => x.id.startsWith("tfl:TIMS-230106"))!;
    expect(e.road).toBe("A40 Westway eastbound");
    expect(e.startAt?.toISOString()).toBe("2026-10-16T21:00:00.000Z");
    expect(e.endAt?.toISOString()).toBe("2026-10-19T20:59:00.000Z");
  });

  it("several schedules become one event per window", () => {
    const one = {
      ...tflJson[0],
      id: "TIMS-1",
      recurringSchedules: [
        { startTime: "2026-10-18T21:00:00Z", endTime: "2026-10-19T05:00:00Z" },
        { startTime: "2026-10-19T21:00:00Z", endTime: "2026-10-20T05:00:00Z" },
      ],
    };
    const evs = parseTflDisruptions([one]);
    expect(evs.map((e) => e.id)).toEqual(["tfl:TIMS-1@2026-10-18T21:00:00.000Z", "tfl:TIMS-1@2026-10-19T21:00:00.000Z"]);
  });

  it("junk in, nothing out", () => {
    expect(parseTflDisruptions(null)).toEqual([]);
    expect(parseTflDisruptions({ message: "rate limited" })).toEqual([]);
    expect(parseTflDisruptions([{ id: 3 }, { id: "x", severity: "Serious" }])).toEqual([]);
  });

  it("tflStreetName", () => {
    expect(tflStreetName("[A3031] ALBERT BRIDGE ROAD (SW11 ,SW3 ) (Kensington & Chelsea,Wandsworth)")).toEqual({
      road: "A3031 Albert Bridge Road",
      town: "Kensington & Chelsea",
    });
    expect(tflStreetName("CHURCH LANE (E11)")).toEqual({ road: "Church Lane", town: null });
    expect(tflStreetName(null)).toEqual({ road: null, town: null });
  });
});

// ── Traffic Wales ───────────────────────────────────────────────────

describe("Traffic Wales RSS (real roadworks feed, 17 Oct 2026)", () => {
  const events = parseTrafficWalesRss(walesXml, "roadworks");

  it("reads every item with its georss point", () => {
    const items = parseRssItems(walesXml);
    expect(items).toHaveLength(35);
    expect(items[0].point).toEqual([52.002762, -3.28621]);
    expect(new Set(events.map((e) => e.id.split("@")[0])).size).toBe(35);
    expect(events.every((e) => e.source === "traffic_wales" && e.points.length === 1 && e.lines.length === 0)).toBe(true);
  });

  it("a nightly closure is one event per night, in UK time", () => {
    // A470 Pont y Bat to Llyswen: 19/10/26-27/10/26 1900-0700 (BST until 25 Oct)
    const nights = events.filter((e) => e.id.startsWith("tw:595139@"));
    expect(nights).toHaveLength(8);
    expect(nights[0]).toMatchObject({ road: "A470", from: "Pont y Bat", to: "Llyswen", category: "road_closed", severity: "closure" });
    expect(nights[0].startAt?.toISOString()).toBe("2026-10-19T18:00:00.000Z");
    expect(nights[0].endAt?.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    // After the clocks go back on 25 Oct, 19:00 is 19:00 UTC.
    expect(nights[7].startAt?.toISOString()).toBe("2026-10-26T19:00:00.000Z");
    expect(nights[7].endAt?.toISOString()).toBe("2026-10-27T07:00:00.000Z");
  });

  it("motorway closures between junctions keep the direction and the stretch", () => {
    const e = events.find((x) => x.id.startsWith("tw:595105"))!;
    expect(e).toMatchObject({ road: "M4 westbound", from: "J24 Coldra", to: "J28 Tredegar Park", severity: "closure" });
  });

  it("slip road closures, lanes, lights and stop/go are minor roadworks", () => {
    const slip = events.find((x) => x.id === "tw:595138")!;
    expect(slip).toMatchObject({ road: "A55 eastbound", category: "roadworks", severity: "minor", description: "Slip road closed" });
    expect(events.find((x) => x.id.startsWith("tw:595059@"))).toMatchObject({ description: "Lane closed", severity: "minor" });
    expect(events.find((x) => x.id.startsWith("tw:594479@"))).toMatchObject({ description: "Stop/go boards", severity: "minor" });
    expect(events.find((x) => x.id.startsWith("tw:595101@"))).toMatchObject({ description: "Temporary lights", severity: "minor" });
  });

  it("nights already over are left out when now is given", () => {
    const later = parseTrafficWalesRss(walesXml, "roadworks", new Date("2026-10-24T12:00:00Z"));
    expect(later.filter((e) => e.id.startsWith("tw:595139@"))).toHaveLength(3);
    expect(later.every((e) => !e.endAt || e.endAt.getTime() > Date.parse("2026-10-24T12:00:00Z"))).toBe(true);
  });

  it("an empty feed gives nothing; an incident item maps by its words", () => {
    expect(parseTrafficWalesRss(walesEmptyXml, "incidents")).toEqual([]);
    const xml = walesEmptyXml.replace(
      "</channel>",
      `<item><title>M4 : Eastbound : J33 Capel Llanilltern to J32 Coryton : Accident : Lane closed :</title>
       <link>https://traffic.wales/road-traffic-alerts/1</link>
       <description>Description: x, Start time: 17/10/2026 18:30 , End Date:  17/10/2026 21:00, Severity: Severe, Source: Welsh Government</description>
       <guid isPermaLink="false">X1</guid><georss:point>51.52 -3.27</georss:point></item></channel>`
    );
    const [e] = parseTrafficWalesRss(xml, "incidents");
    expect(e).toMatchObject({ id: "tw:1", category: "accident", severity: "major", road: "M4 eastbound", from: "J33 Capel Llanilltern" });
    expect(e.startAt?.toISOString()).toBe("2026-10-17T17:30:00.000Z");
  });

  it("walesTitleWindows: one night to midnight, daytime ranges, no window", () => {
    const one = walesTitleWindows("A55 : Eastbound : x : Road closed : 19/10/26 2100-0000 :")!;
    expect(one).toHaveLength(1);
    expect(one[0].end.toISOString()).toBe("2026-10-19T23:00:00.000Z");
    const day = walesTitleWindows("A494 : Ruthin : 28/09/26-30/09/26 0900-1200 :")!;
    expect(day).toHaveLength(3);
    expect(walesTitleWindows("A470 : Both directions : Llanrwst : Closed :")).toBeNull();
  });

  it("ukLocalToUtc handles both GMT and BST", () => {
    expect(ukLocalToUtc(2026, 7, 1, 9, 0).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(ukLocalToUtc(2026, 12, 1, 9, 0).toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
});

// ── National Highways ───────────────────────────────────────────────

describe("National Highways planned closures (real ArcGIS page, 17 Oct 2026)", () => {
  const events = parseNhClosures(nhJson, NOW);
  const byId = new Map(events.map((e) => [e.id, e]));

  it("carriageway closures are closures with junctions and direction; lines match either way", () => {
    const e = byId.get("nh:9797428")!;
    expect(e).toMatchObject({
      source: "national_highways",
      category: "road_closed",
      severity: "closure",
      road: "M25 clockwise",
      from: "J11",
      to: "J13",
      directionMode: "axis",
    });
    expect(e.lines.length).toBeGreaterThan(0);
    expect(e.startAt?.toISOString()).toBe(new Date(1792443600000).toISOString());
    expect(byId.get("nh:9797438")).toMatchObject({ road: "M25 anti-clockwise", from: "J23", to: "J22", severity: "closure" });
    expect(byId.get("nh:9797445")).toMatchObject({ severity: "closure", road: "A282 northbound" }); // tunnel
  });

  it("slip, lane and link road closures are minor roadworks", () => {
    expect(byId.get("nh:9797479")).toMatchObject({ category: "roadworks", severity: "minor", description: "Slip road closed" });
    expect(byId.get("nh:9797502")).toMatchObject({ description: "Slip road closed" });
    expect(byId.get("nh:9797483")).toMatchObject({ description: "Slip road closed", road: "A21 southbound" });
    expect(byId.get("nh:9797432")).toMatchObject({ description: "Lane closed", road: "A1089" }); // two directions named
  });

  it("closures already over are dropped", () => {
    expect(byId.has("nh:9797443")).toBe(false); // ended 15 Oct
    expect(parseNhClosures(nhJson, new Date("2020-01-01")).length).toBe(10);
  });

  it("junk in, nothing out", () => {
    expect(parseNhClosures(null, NOW)).toEqual([]);
    expect(parseNhClosures({ error: { code: 400 } }, NOW)).toEqual([]);
    expect(parseNhClosures({ features: [{ properties: { objectid: 1 }, geometry: null }] }, NOW)).toEqual([]);
  });

  it("nhJunctions and nhCategory", () => {
    expect(nhJunctions("M56 both directions J14 to J16 - carriageway closure")).toEqual({ from: "J14", to: "J16" });
    expect(nhJunctions("M6 northbound Junction 22 to Junction 23")).toEqual({ from: "J22", to: "J23" });
    expect(nhJunctions("M62 westbound jct 6 exit slip road")).toEqual({ from: "J6", to: null });
    expect(nhJunctions("A38 westbound Dartbridge to Marley Head")).toEqual({ from: null, to: null });
    expect(nhCategory("Carriageway, slip road and lane closures due to electrical works").severity).toBe("closure");
    expect(nhCategory("M61 northbound Rivington to Jnc 8 - lane closure").description).toBe("Lane closed");
    expect(nhCategory("M62 westbound jct 6 exit slip road and roundabout closures").description).toBe("Slip road closed");
  });

  it("oneDirection", () => {
    expect(oneDirection("M25 Clockwise Jct 11")).toBe("clockwise");
    expect(oneDirection("M25 Anti-Clockwise Jct 28")).toBe("anti-clockwise");
    expect(oneDirection("A52 eastbound and westbound Spondon")).toBeNull();
    expect(oneDirection("M60 both directions Junction 23")).toBeNull();
  });
});

// ── Matching and grouping ──────────────────────────────────────────

describe("new sources go through the existing matching and grouping", () => {
  it("an NH closure on a driver's usual road matches; the nights group into one card", () => {
    const nh = parseNhClosures(nhJson, NOW);
    const e = nh.find((x) => x.id === "nh:9797428")!;
    const line = e.lines[0].map(([lat, lng]) => ({ lat, lng }));
    const corridor = buildCorridor(["d1", "d2", "d3", "d4"].map((dayKey) => ({ dayKey, points: line })));
    const m = matchEventToCorridor(corridor, e);
    expect(m.matched).toBe(true);
    expect(m.days).toBe(4);
    const second = { ...e, id: "nh:x2", startAt: new Date(e.startAt!.getTime() + 86400000), endAt: new Date(e.endAt!.getTime() + 86400000) };
    const groups = groupMatches([{ event: e, days: 4 }, { event: second, days: 4 }], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].recurring).toBe(true);
  });
});

// ── London de-dup ───────────────────────────────────────────────────

describe("TfL works that Street Manager already lists", () => {
  const tfl = parseTflDisruptions(tflJson);
  const bridge = tfl.find((e) => e.id === "tfl:TIMS-224034")!;
  const sm = (over: Partial<Parameters<typeof streetWorksToRoadEvent>[0]>): RoadEvent =>
    streetWorksToRoadEvent(
      {
        reference: "SM1",
        trafficManagement: "road_closure",
        isTrafficSensitive: true,
        streetName: "ALBERT BRIDGE ROAD",
        town: "LONDON",
        promoter: "RBKC",
        startAt: new Date("2026-09-20T00:00:00Z"),
        endAt: new Date("2027-03-01T00:00:00Z"),
        lines: [bridge.lines[0]],
        points: [],
        ...over,
      },
      NOW
    );

  it("same street, within 50 m, overlapping dates: the TfL copy goes", () => {
    expect(minDistanceMetres(bridge, sm({}))).toBeLessThan(1);
    expect(withoutStreetManagerDuplicates([bridge], [sm({})])).toEqual([]);
  });

  it("another street, too far, or other dates: both stay", () => {
    expect(withoutStreetManagerDuplicates([bridge], [sm({ streetName: "CHEYNE WALK" })])).toHaveLength(1);
    const far = bridge.lines[0].map(([lat, lng]) => [lat + 0.002, lng] as [number, number]); // about 220 m north
    expect(withoutStreetManagerDuplicates([bridge], [sm({ lines: [far] })])).toHaveLength(1);
    expect(
      withoutStreetManagerDuplicates([bridge], [sm({ startAt: new Date("2027-04-01T00:00:00Z"), endAt: new Date("2027-05-01T00:00:00Z") })])
    ).toHaveLength(1);
  });

  it("collisions are never in Street Manager, so they always stay", () => {
    const crash = { ...bridge, id: "tfl:c", category: "accident" as const };
    expect(withoutStreetManagerDuplicates([crash], [sm({})])).toHaveLength(1);
  });

  it("street names compare without road numbers, directions or abbreviations", () => {
    expect(streetKey("A3031 Albert Bridge Road eastbound")).toBe("albert bridge road");
    expect(streetKey("Albert Bridge Rd")).toBe("albert bridge road");
    expect(streetKey(null)).toBeNull();
  });
});

// ── Gating and fail-soft ────────────────────────────────────────────

describe("roadSources gating and fail-soft", () => {
  const flags = ["ROAD_SOURCE_TFL", "ROAD_SOURCE_WALES", "ROAD_SOURCE_NH"];
  let calls: string[];
  let mode: "ok" | "fail" | "http500";
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetRoadSources();
    for (const f of flags) delete process.env[f];
    calls = [];
    mode = "ok";
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setRoadSourcesFetch(async (url) => {
      calls.push(url);
      if (mode === "fail") throw new Error("network down");
      if (mode === "http500") return { ok: false, status: 500, text: async () => "" };
      if (url.includes("tfl.gov.uk")) return { ok: true, status: 200, text: async () => JSON.stringify(tflJson) };
      if (url.includes("traffic.wales")) {
        const body = url.includes("roadworks") ? walesXml : walesEmptyXml;
        return { ok: true, status: 200, text: async () => body };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ ...nhJson, properties: {} }) };
    });
  });

  afterEach(() => {
    setRoadSourcesFetch(null);
    errorSpy.mockRestore();
    for (const f of flags) delete process.env[f];
  });

  it("every source is off by default: no fetch, nothing returned", async () => {
    expect(extraRoadSourcesEnabled()).toBe(false);
    expect(await extraRoadEventsFor(LONDON, [], NOW)).toEqual([]);
    expect(await sourceEvents("national_highways", LEEDS, NOW)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("an enabled source is fetched only when the corridor touches its area", async () => {
    process.env.ROAD_SOURCE_TFL = "1";
    process.env.ROAD_SOURCE_WALES = "1";
    expect(await sourceEvents("tfl", LEEDS, NOW)).toEqual([]);
    expect(await sourceEvents("traffic_wales", LONDON, NOW)).toEqual([]);
    expect(calls).toEqual([]);
    const ev = await sourceEvents("tfl", LONDON, NOW);
    expect(ev.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("app_key");
  });

  it("one request serves every driver until the refresh interval passes", async () => {
    process.env.ROAD_SOURCE_TFL = "1";
    await sourceEvents("tfl", LONDON, NOW);
    await sourceEvents("tfl", LONDON, new Date(NOW.getTime() + 60000));
    await sourceEvents("tfl", { ...LONDON, minLat: 51.3 }, new Date(NOW.getTime() + 2 * 60000));
    expect(calls).toHaveLength(1);
    await sourceEvents("tfl", LONDON, new Date(NOW.getTime() + FEED_SPECS.tfl.refreshMs + 1000));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(2);
  });

  it("the TfL key, when set, is sent as app_key", async () => {
    process.env.ROAD_SOURCE_TFL = "1";
    process.env.TFL_APP_KEY = "abc";
    try {
      await sourceEvents("tfl", LONDON, NOW);
      expect(calls[0]).toContain("app_key=abc");
    } finally {
      delete process.env.TFL_APP_KEY;
    }
  });

  it("a failure keeps the last good copy until it is stale, logs once an hour, then gives nothing", async () => {
    process.env.ROAD_SOURCE_TFL = "1";
    const first = await sourceEvents("tfl", LONDON, NOW);
    expect(first.length).toBeGreaterThan(0);

    mode = "fail";
    const t1 = new Date(NOW.getTime() + 6 * 60000);
    const kept = await sourceEvents("tfl", LONDON, t1);
    await new Promise((r) => setTimeout(r, 0));
    expect(kept.length).toBe(first.length);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // Next tries (after the retry wait) fail too, but within the hour log nothing more.
    for (const min of [12, 18, 24]) {
      await sourceEvents("tfl", LONDON, new Date(NOW.getTime() + min * 60000));
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // Retried after each 5-minute wait, not on every call.
    expect(calls.length).toBe(5);

    // Past the 30-minute staleness limit: nothing, and no throw.
    const stale = await sourceEvents("tfl", LONDON, new Date(NOW.getTime() + 31 * 60000));
    expect(stale).toEqual([]);

    // An hour after the first log, one more line.
    await sourceEvents("tfl", LONDON, new Date(NOW.getTime() + 70 * 60000));
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("an HTTP error with no copy yet gives nothing and never throws", async () => {
    process.env.ROAD_SOURCE_NH = "1";
    mode = "http500";
    await expect(sourceEvents("national_highways", LEEDS, NOW)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][1])).toContain("HTTP 500");
    expect(String(errorSpy.mock.calls[0].join(" "))).not.toContain("http");
  });

  it("one source failing does not stop the others", async () => {
    process.env.ROAD_SOURCE_TFL = "1";
    process.env.ROAD_SOURCE_WALES = "1";
    process.env.ROAD_SOURCE_NH = "1";
    setRoadSourcesFetch(async (url) => {
      if (url.includes("tfl.gov.uk")) throw new Error("boom");
      if (url.includes("traffic.wales")) return { ok: true, status: 200, text: async () => (url.includes("roadworks") ? walesXml : walesEmptyXml) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ...nhJson, properties: {} }) };
    });
    const wide = { minLat: 51.2, maxLat: 52.2, minLng: -3.5, maxLng: 0.2 };
    const ev = await extraRoadEventsFor(wide, [], NOW);
    const sources = new Set(ev.map((e) => e.source));
    expect(sources.has("traffic_wales")).toBe(true);
    expect(sources.has("national_highways")).toBe(true);
    expect(sources.has("tfl")).toBe(false);
  });

  it("ended events are never handed out, and future is set against now", async () => {
    process.env.ROAD_SOURCE_WALES = "1";
    const ev = await sourceEvents("traffic_wales", CARDIFF, NOW);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => !e.endAt || e.endAt > NOW)).toBe(true);
    expect(ev.every((e) => e.future === (e.startAt != null && e.startAt > NOW))).toBe(true);
    // Nothing more than 8 days ahead.
    expect(ev.every((e) => !e.startAt || e.startAt.getTime() <= NOW.getTime() + 8 * 86400000)).toBe(true);
  });

  it("extraRoadEventsFor drops TfL works that Street Manager already has", async () => {
    process.env.ROAD_SOURCE_TFL = "1";
    const all = await extraRoadEventsFor(LONDON, [], NOW);
    const bridge = all.find((e) => e.id === "tfl:TIMS-224034")!;
    const smCopy = streetWorksToRoadEvent(
      {
        reference: "SM1", trafficManagement: "road_closure", isTrafficSensitive: true, streetName: "ALBERT BRIDGE ROAD",
        town: null, promoter: null, startAt: null, endAt: null, lines: [bridge.lines[0]], points: [],
      },
      NOW
    );
    const deduped = await extraRoadEventsFor(LONDON, [smCopy], NOW);
    expect(deduped.find((e) => e.id === "tfl:TIMS-224034")).toBeUndefined();
    expect(deduped.length).toBe(all.length - 1);
  });
});

describe("attribution", () => {
  it("only for the sources actually shown, in a fixed order", () => {
    expect(attributionForSources([])).toEqual([]);
    expect(attributionForSources(["street_manager", "tomtom"])).toEqual([]);
    expect(attributionForSources(["national_highways", "tfl", "tfl"])).toEqual([ATTRIBUTION_TFL, ATTRIBUTION_NATIONAL_HIGHWAYS]);
    expect(attributionForSources(["traffic_wales"])).toEqual([ATTRIBUTION_TRAFFIC_WALES]);
  });
});
