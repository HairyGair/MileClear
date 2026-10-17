/**
 * Road alerts newer sources (17 Oct 2026), fixes from review: Wales points
 * never pushed, slip/link/hard shoulder not closures, both carriageways said
 * once, unrelated same-night closures kept apart, TfL closures never hidden
 * behind a lesser Street Manager item, per-feed Wales expiry, "2400",
 * first-load wait, byte cap, linear RSS parsing, NH server-side filter and
 * page cap, the padded prefilter, and minor NH/Wales items off the screen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  mayMergeAsOnePlan,
  oppositeDirectionLabels,
  parseNhClosures,
  parseRssItems,
  parseTflDisruptions,
  parseTrafficWalesRss,
  screenWorthy,
  stripDirectionWord,
  walesCategory,
  walesTitleWindows,
  withoutStreetManagerDuplicates,
} from "../../services/roadSourcesParse.js";
import {
  MAX_RESPONSE_BYTES,
  loadNh,
  loadWales,
  nhWhere,
  resetRoadSources,
  setFirstLoadWaitMs,
  setRoadSourcesFetch,
  sourceEvents,
} from "../../services/roadSources.js";
import { streetWorksToRoadEvent, type RoadEvent } from "../../services/roadEvents.js";
import { groupMatches, selectPushGroup } from "../../services/roadAlertGroups.js";

const FIX = path.resolve(__dirname, "../fixtures/roadAlerts");
const tflJson = JSON.parse(readFileSync(path.join(FIX, "tfl-road-disruption.json"), "utf8"));
const walesXml = readFileSync(path.join(FIX, "traffic-wales-roadworks.xml"), "utf8");
const walesEmptyXml = readFileSync(path.join(FIX, "traffic-wales-incidents-empty.xml"), "utf8");
const nhJson = JSON.parse(readFileSync(path.join(FIX, "nh-closures-page.json"), "utf8"));

const NOW = new Date("2026-10-17T19:00:00Z");

function ev(over: Partial<RoadEvent>): RoadEvent {
  return {
    id: "x",
    source: "national_highways",
    category: "road_closed",
    severity: "closure",
    road: "M25 clockwise",
    from: "J11",
    to: "J13",
    bearing: null,
    directionMode: "axis",
    description: "Closed",
    delayMinutes: null,
    startAt: new Date("2026-10-17T20:00:00Z"),
    endAt: new Date("2026-10-18T04:30:00Z"),
    future: true,
    town: null,
    lines: [[[51.38, -0.51], [51.37, -0.5]]],
    points: [],
    ...over,
  };
}

describe("1. Traffic Wales items are shown but never pushed", () => {
  it("every Wales event is marked not pushable; other sources are not", () => {
    expect(parseTrafficWalesRss(walesXml, "roadworks").every((e) => e.pushable === false)).toBe(true);
    expect(parseNhClosures(nhJson, NOW).every((e) => e.pushable === undefined)).toBe(true);
    expect(parseTflDisruptions(tflJson).every((e) => e.pushable === undefined)).toBe(true);
  });

  it("selectPushGroup skips a Wales closure in effect at departure, but takes the same closure from NH", () => {
    const at = new Date("2026-10-17T21:00:00Z");
    const wales = ev({ id: "tw:1", source: "traffic_wales", road: "M4 westbound", lines: [], points: [[51.58, -2.95]], pushable: false });
    const groups = groupMatches([{ event: wales, days: 9 }], NOW);
    expect(selectPushGroup(groups, { departureAt: at, sentEventIds: new Set() })).toBeNull();
    const nh = ev({ id: "nh:1" });
    const pick = selectPushGroup(groupMatches([{ event: nh, days: 9 }], NOW), { departureAt: at, sentEventIds: new Set() });
    expect(pick?.pick.id).toBe("nh:1");
  });
});

describe("2. Wales: slip roads, link roads, hard shoulders and lay-bys are not road closures", () => {
  const cases: [string, "closure" | "minor", string][] = [
    ["A55 : Eastbound : J33 : Entry slip road and link road closed : 19/10/26 2000-0600 :", "minor", "Slip road closed"],
    ["A55 : Eastbound : J33 : Link road closed : 19/10/26 2000-0600 :", "minor", "Link road closed"],
    ["M4 : Westbound : J24 : Hard shoulder closed : 19/10/26 2000-0600 :", "minor", "Hard shoulder closed"],
    ["A470 : Northbound : Storey Arms : Lay-by closed :", "minor", "Lay-by closed"],
    ["M4 : Westbound : J43 : Onslip closed : Offslip closed : 22/10/26 2000-0600 :", "minor", "Slip road closed"],
    ["A465 : Both directions : Glynneath : Roadworks : Entry slip road closed : and Exit slip road closed :", "minor", "Slip road closed"],
    ["M4 : Eastbound : J35 to J34 : Lane closures and road closed overnight :", "closure", "Closed"],
    ["A494 : Both directions : Mold Bypass : 19/10/26-22/10/26 1900-0600 : Cyclic maintenance : Closed :", "closure", "Closed"],
    ["A55 : Eastbound : J33 to J33B : Road closed : Diversions in place :", "closure", "Closed"],
    ["M48 : Both directions : Dewstoe : Lane closed :", "minor", "Lane closed"],
  ];
  for (const [title, severity, description] of cases) {
    it(title, () => {
      const m = walesCategory(title, "", "Road closure");
      expect(m.severity).toBe(severity);
      expect(m.description).toBe(description);
    });
  }
});

describe("3. both carriageways shut are said once, both ways", () => {
  it("clockwise and anti-clockwise on the same night: one card, 'M25 closed both ways'", () => {
    const a = ev({ id: "nh:a", road: "M25 clockwise" });
    const b = ev({ id: "nh:b", road: "M25 anti-clockwise", lines: [[[51.3802, -0.5098], [51.3702, -0.4998]]] });
    const groups = groupMatches([{ event: a, days: 5 }, { event: b, days: 5 }], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].bothDirections).toBe(true);
    expect(groups[0].roads).toEqual(["M25"]);
    expect(groups[0].headline).toBe("M25 closed both ways");
    expect(groups[0].sentence).toContain("in both directions");
    expect(groups[0].sentence).not.toContain("clockwise");
  });

  it("helpers", () => {
    expect(stripDirectionWord("M25 anti-clockwise")).toBe("M25");
    expect(stripDirectionWord("A3031 Albert Bridge Road")).toBe("A3031 Albert Bridge Road");
    expect(oppositeDirectionLabels(["M6 northbound", "M6 southbound"])).toBe(true);
    expect(oppositeDirectionLabels(["M6 northbound", "M6 northbound"])).toBe(false);
    expect(oppositeDirectionLabels(["M6 northbound", "M5 southbound"])).toBe(false);
    expect(oppositeDirectionLabels(["A40 eastbound", "A40 westbound", "A40"])).toBe(true);
  });
});

describe("4. unrelated closures on the same night stay apart", () => {
  it("NH closures on different roads within 3 km and the same window: two cards", () => {
    const a = ev({ id: "nh:a", road: "M25 clockwise" });
    const b = ev({ id: "nh:b", road: "A3 northbound", lines: [[[51.39, -0.49], [51.4, -0.48]]] });
    expect(groupMatches([{ event: a, days: 5 }, { event: b, days: 5 }], NOW)).toHaveLength(2);
  });

  it("the same road a couple of kilometres on, same night: one card", () => {
    const a = ev({ id: "nh:a" });
    const b = ev({ id: "nh:b", lines: [[[51.36, -0.49], [51.35, -0.48]]] });
    expect(groupMatches([{ event: a, days: 5 }, { event: b, days: 5 }], NOW)).toHaveLength(1);
  });

  it("only NH and Wales are restricted", () => {
    expect(mayMergeAsOnePlan({ source: "street_manager", road: "High Street" }, { source: "street_manager", road: "Low Street" })).toBe(true);
    expect(mayMergeAsOnePlan({ source: "traffic_wales", road: "M4 eastbound" }, { source: "traffic_wales", road: "M4 westbound" })).toBe(true);
    expect(mayMergeAsOnePlan({ source: "traffic_wales", road: null }, { source: "traffic_wales", road: null })).toBe(false);
  });
});

describe("5. a TfL closure is never hidden behind a lesser Street Manager item", () => {
  const bridge = parseTflDisruptions(tflJson).find((e) => e.id === "tfl:TIMS-224034")!;
  const sm = (trafficManagement: string) =>
    streetWorksToRoadEvent(
      {
        reference: "SM1", trafficManagement, isTrafficSensitive: true, streetName: "ALBERT BRIDGE ROAD", town: null,
        promoter: null, startAt: null, endAt: null, lines: [bridge.lines[0]], points: [],
      },
      NOW
    );
  it("SM lane closure (minor) does not drop the TfL closure", () => {
    expect(withoutStreetManagerDuplicates([bridge], [sm("lane_closure")])).toHaveLength(1);
  });
  it("SM road closure does", () => {
    expect(withoutStreetManagerDuplicates([bridge], [sm("road_closure")])).toHaveLength(0);
  });
  it("a minor TfL item is dropped for a minor SM item", () => {
    const minor = { ...bridge, severity: "minor" as const, category: "roadworks" as const };
    expect(withoutStreetManagerDuplicates([minor], [sm("two_way_signals")])).toHaveLength(0);
  });
});

describe("7. '2400' is midnight at the end of the day", () => {
  it("2000-2400 ends at 00:00 the next day, UK time", () => {
    const w = walesTitleWindows("A55 : Eastbound : x : Road closed : 19/10/26-20/10/26 2000-2400 :")!;
    expect(w).toHaveLength(2);
    expect(w[0].start.toISOString()).toBe("2026-10-19T19:00:00.000Z");
    expect(w[0].end.toISOString()).toBe("2026-10-19T23:00:00.000Z");
    expect(w[1].end.toISOString()).toBe("2026-10-20T23:00:00.000Z");
  });
  it("2400 with minutes, or a start at 24, is not a window", () => {
    expect(walesTitleWindows("A55 : x : 19/10/26 2000-2430 :")).toBeNull();
    expect(walesTitleWindows("A55 : x : 19/10/26 2400-0600 :")).toBeNull();
  });
});

describe("8c. RSS parsing is linear", () => {
  it("thousands of unclosed items parse quickly and give nothing", () => {
    const bad = "<rss><channel>" + "<item><title>x".repeat(50000);
    const t = Date.now();
    expect(parseRssItems(bad)).toEqual([]);
    expect(Date.now() - t).toBeLessThan(1000);
  });
  it("<items> is not an item; attributes on <item> are fine", () => {
    const xml = `<rss><items>no</items><item id="1"><title>A &amp; B</title><georss:point>51.5 -3.1</georss:point></item></rss>`;
    const items = parseRssItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("A & B");
    expect(items[0].point).toEqual([51.5, -3.1]);
  });
});

describe("9. minor NH and Wales items are kept off the screen", () => {
  it("screenWorthy", () => {
    expect(screenWorthy({ source: "national_highways", severity: "minor" })).toBe(false);
    expect(screenWorthy({ source: "traffic_wales", severity: "minor" })).toBe(false);
    expect(screenWorthy({ source: "national_highways", severity: "closure" })).toBe(true);
    expect(screenWorthy({ source: "tfl", severity: "minor" })).toBe(true);
    expect(screenWorthy({ source: "street_manager", severity: "minor" })).toBe(true);
  });
});

// ── IO ──────────────────────────────────────────────────────────────

type Resp = { ok: boolean; status: number; headers?: { get(n: string): string | null }; text(): Promise<string> };
const okText = (body: string, headers: Record<string, string> = {}): Resp => ({
  ok: true,
  status: 200,
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  text: async () => body,
});

describe("roadSources IO fixes", () => {
  let calls: string[];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetRoadSources();
    calls = [];
    for (const f of ["ROAD_SOURCE_TFL", "ROAD_SOURCE_WALES", "ROAD_SOURCE_NH"]) delete process.env[f];
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    setRoadSourcesFetch(null);
    setFirstLoadWaitMs(null);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    for (const f of ["ROAD_SOURCE_TFL", "ROAD_SOURCE_WALES", "ROAD_SOURCE_NH"]) delete process.env[f];
  });

  it("6. each Wales feed's last good copy expires on its own", async () => {
    let roadworksUp = true;
    const synthetic = walesEmptyXml.replace(
      "</channel>",
      `<item><title>M4 : Eastbound : J33 to J32 : Accident : Road closed :</title><link>https://traffic.wales/road-traffic-alerts/9</link>
       <description>Start time: 17/10/2026 18:30 , End Date:  20/10/2026 21:00, Severity: Severe</description><georss:point>51.52 -3.27</georss:point></item></channel>`
    );
    setRoadSourcesFetch(async (url) => {
      calls.push(url);
      if (url.includes("roadworks")) {
        if (!roadworksUp) throw new Error("down");
        return okText(walesXml);
      }
      if (url.includes("incidents")) return okText(synthetic);
      return okText(walesEmptyXml);
    });
    const first = await loadWales(NOW);
    expect(first.some((e) => e.id === "tw:9")).toBe(true);
    expect(first.some((e) => e.id.startsWith("tw:595139"))).toBe(true);

    roadworksUp = false;
    // Within two hours, roadworks are kept from the last good copy.
    const soon = await loadWales(new Date(NOW.getTime() + 60 * 60000));
    expect(soon.some((e) => e.id.startsWith("tw:595139"))).toBe(true);
    // After two hours, the roadworks copy is gone; incidents (fresh) stay.
    const later = await loadWales(new Date(NOW.getTime() + 121 * 60000));
    expect(later.some((e) => e.id.startsWith("tw:595139"))).toBe(false);
    expect(later.some((e) => e.id === "tw:9")).toBe(true);
  });

  it("8a. with no copy yet, a caller waits a short while, then gets nothing; the fetch carries on and serves the next caller", async () => {
    process.env.ROAD_SOURCE_TFL = "1";
    setFirstLoadWaitMs(20);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setRoadSourcesFetch(async (url) => {
      calls.push(url);
      await gate;
      return okText(JSON.stringify(tflJson));
    });
    const LONDON = { minLat: 51.4, maxLat: 51.6, minLng: -0.3, maxLng: 0.1 };
    const t = Date.now();
    expect(await sourceEvents("tfl", LONDON, NOW)).toEqual([]);
    expect(Date.now() - t).toBeLessThan(1000);
    release();
    await new Promise((r) => setTimeout(r, 10));
    const next = await sourceEvents("tfl", LONDON, new Date(NOW.getTime() + 60000));
    expect(next.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("8b. responses over the byte cap are refused before parsing", async () => {
    process.env.ROAD_SOURCE_TFL = "1";
    const LONDON = { minLat: 51.4, maxLat: 51.6, minLng: -0.3, maxLng: 0.1 };
    setRoadSourcesFetch(async () => okText("[]", { "content-length": String(MAX_RESPONSE_BYTES + 1) }));
    expect(await sourceEvents("tfl", LONDON, NOW)).toEqual([]);
    expect(String(errorSpy.mock.calls[0]?.[1])).toContain("too big");

    resetRoadSources();
    errorSpy.mockClear();
    setRoadSourcesFetch(async () => okText("x".repeat(MAX_RESPONSE_BYTES + 1)));
    expect(await sourceEvents("tfl", LONDON, NOW)).toEqual([]);
    expect(String(errorSpy.mock.calls[0]?.[1])).toContain("too big");
  });

  it("8d. NH asks the server only for closures not over and starting within 8 days", async () => {
    const where = nhWhere(NOW);
    expect(where).toBe(
      "scheduledplannedenddate > TIMESTAMP '2026-10-17 19:00:00' AND scheduledplannedstartdate < TIMESTAMP '2026-10-25 19:00:00'"
    );
    setRoadSourcesFetch(async (url) => {
      calls.push(url);
      return okText(JSON.stringify({ ...nhJson, properties: {} }));
    });
    await loadNh(NOW);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]).searchParams.get("where")).toBe(where);
  });

  it("8d. NH says so when it stops at the page cap", async () => {
    setRoadSourcesFetch(async (url) => {
      calls.push(url);
      return okText(JSON.stringify({ ...nhJson, properties: { exceededTransferLimit: true } }));
    });
    await loadNh(NOW);
    expect(calls).toHaveLength(10);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("page cap");
  });

  it("8e. an event just outside the corridor box still reaches matching (same margin as matching)", async () => {
    process.env.ROAD_SOURCE_NH = "1";
    setRoadSourcesFetch(async () => okText(JSON.stringify({ ...nhJson, properties: {} })));
    const m25 = parseNhClosures(nhJson, NOW).find((e) => e.id === "nh:9797428")!;
    const lats = m25.lines.flat().map((p) => p[0]);
    const lngs = m25.lines.flat().map((p) => p[1]);
    // A box ending 0.005 degrees south of the closure's southern tip.
    const box = { minLat: Math.min(...lats) - 0.2, maxLat: Math.min(...lats) - 0.005, minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
    const got = await sourceEvents("national_highways", box, NOW);
    expect(got.some((e) => e.id === "nh:9797428")).toBe(true);
  });

  it("9. sourceEvents hands out no minor NH or Wales items", async () => {
    process.env.ROAD_SOURCE_NH = "1";
    process.env.ROAD_SOURCE_WALES = "1";
    setRoadSourcesFetch(async (url) =>
      url.includes("traffic.wales")
        ? okText(url.includes("roadworks") ? walesXml : walesEmptyXml)
        : okText(JSON.stringify({ ...nhJson, properties: {} }))
    );
    const wide = { minLat: 51.2, maxLat: 53.5, minLng: -5, maxLng: 0.5 };
    const nh = await sourceEvents("national_highways", wide, NOW);
    const wales = await sourceEvents("traffic_wales", wide, NOW);
    expect(nh.length).toBeGreaterThan(0);
    expect(wales.length).toBeGreaterThan(0);
    expect([...nh, ...wales].every((e) => e.severity !== "minor")).toBe(true);
  });
});

describe("Street Manager cards are untouched by the 'both ways' labels", () => {
  const sm = (ref: string, street: string, lines: [number, number][][]) =>
    streetWorksToRoadEvent(
      {
        reference: ref, trafficManagement: "road_closure", isTrafficSensitive: true, streetName: street, town: "PLYMOUTH",
        promoter: null, startAt: new Date("2026-10-18T20:00:00Z"), endAt: new Date("2026-10-19T05:00:00Z"), lines, points: [],
      },
      NOW
    );
  it("A38 Northbound and A38 Southbound stay as Street Manager always showed them", () => {
    const nb = sm("SM-N", "A38 NORTHBOUND", [[[50.4, -4.1], [50.401, -4.1]]]);
    const sb = sm("SM-S", "A38 SOUTHBOUND", [[[50.4, -4.1003], [50.401, -4.1003]]]);
    const groups = groupMatches([{ event: nb, days: 6 }, { event: sb, days: 4 }], NOW);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.bothDirections).toBe(false);
    expect(g.multiPlace).toBe(false);
    expect(g.roads).toEqual(["A38 Northbound", "A38 Southbound"]);
    expect(g.headline).not.toContain("both ways");
    // The whole card, snapshot taken with roadAlertGroups.ts as it was before
    // the new sources (5a8278ba), and checked to match that version.
    expect(JSON.stringify({ ...g, members: undefined, lead: undefined })).toMatchSnapshot();
  });
});
