import { describe, it, expect } from "vitest";
import {
  UK_POSTCODE_AREAS,
  UK_REGIONS,
  areaInfo,
  assignHomeArea,
  growthPct,
  ipAgreement,
  nearestArea,
  parsePostcode,
  parseSignupLocation,
  rollupGeography,
  type GeoUser,
  type HomeArea,
  type TripLite,
} from "../../services/geography.js";
import { platformOf } from "../../services/geographyLoader.js";

const NOW = new Date("2026-10-02T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

describe("parsePostcode", () => {
  it("reads a full postcode at the end of an address", () => {
    expect(parsePostcode("33, Saxilby Road, Sturton by Stow, LN1 2AA")).toEqual({
      area: "LN",
      district: "LN1",
      outward: "LN1",
      full: "LN1 2AA",
    });
  });

  it("handles two-digit districts, lowercase, missing and extra spaces", () => {
    expect(parsePostcode("High St, Gainsborough, dn21 2ab")?.district).toBe("DN21");
    expect(parsePostcode("Somewhere, DN212AB")?.full).toBe("DN21 2AB");
    expect(parsePostcode("  Somewhere ,   gl56    0aa  ")?.full).toBe("GL56 0AA");
    expect(parsePostcode("Leeds LS1 4AP, UK")?.district).toBe("LS1");
  });

  it("reads single-letter areas and sub-districts", () => {
    expect(parsePostcode("New St, Birmingham B2 4QA")).toMatchObject({ area: "B", district: "B2" });
    expect(parsePostcode("Westminster, SW1A 1AA")).toMatchObject({ area: "SW", district: "SW1", outward: "SW1A" });
    expect(parsePostcode("EC1A 1BB")).toMatchObject({ area: "EC", district: "EC1" });
    expect(parsePostcode("W1A 0AX")).toMatchObject({ area: "W", district: "W1" });
  });

  it("reads a bare district as the final segment or word", () => {
    expect(parsePostcode("Moreton-In-Marsh, GL56")).toEqual({ area: "GL", district: "GL56", outward: "GL56", full: null });
    expect(parsePostcode("Gainsborough DN21")?.district).toBe("DN21");
    expect(parsePostcode("Exeter, ex4, United Kingdom")?.district).toBe("EX4");
  });

  it("prefers the last full postcode", () => {
    expect(parsePostcode("Flat 2, LN1 2AA, forwarded to DN21 2AB")?.district).toBe("DN21");
  });

  it("rejects garbage, non-UK and road numbers", () => {
    expect(parsePostcode(null)).toBeNull();
    expect(parsePostcode("")).toBeNull();
    expect(parsePostcode("Home")).toBeNull();
    expect(parsePostcode("75001 Paris, France")).toBeNull();
    expect(parsePostcode("Dublin D02 X285")).toBeNull();
    expect(parsePostcode("A1, Newark")).toBeNull();
    expect(parsePostcode("Somewhere, A1")).toBeNull();
    expect(parsePostcode("Junction 10, M6")).toBeNull(); // motorway, not Manchester
    expect(parsePostcode("Salford, M6")?.district).toBe("M6");
    expect(parsePostcode("12 Main Street")).toBeNull();
    expect(parsePostcode("QQ1 1AA")).toBeNull(); // not an area
  });
});

describe("postcode area table", () => {
  const areas = Object.values(UK_POSTCODE_AREAS);

  it("covers the 121 UK areas plus GY/JE/IM", () => {
    expect(areas.length).toBe(124);
  });

  it("gives every area a valid region, nation and UK-ish centroid", () => {
    const valid = new Set<string>([...UK_REGIONS, "Crown Dependencies"]);
    for (const a of areas) {
      expect(valid.has(a.region), a.code).toBe(true);
      expect(a.name.length, a.code).toBeGreaterThan(0);
      expect(a.lat, a.code).toBeGreaterThan(49);
      expect(a.lat, a.code).toBeLessThan(61);
      expect(a.lng, a.code).toBeGreaterThan(-8.5);
      expect(a.lng, a.code).toBeLessThan(2);
    }
    // Every UK region has at least one area.
    for (const r of UK_REGIONS) expect(areas.some((a) => a.region === r), r).toBe(true);
  });

  it.each([
    ["L", "Liverpool", "North West"],
    ["M", "Manchester", "North West"],
    ["B", "Birmingham", "West Midlands"],
    ["EX", "Exeter", "South West"],
    ["GL", "Gloucester", "South West"],
    ["OX", "Oxford", "South East"],
    ["LN", "Lincoln", "East Midlands"],
    ["DN", "Doncaster", "Yorkshire and the Humber"],
    ["RH", "Redhill", "South East"],
    ["DY", "Dudley", "West Midlands"],
    ["FY", "Blackpool", "North West"],
    ["EH", "Edinburgh", "Scotland"],
    ["CF", "Cardiff", "Wales"],
    ["BT", "Belfast", "Northern Ireland"],
  ])("%s is %s in %s", (code, name, region) => {
    expect(areaInfo(code)).toMatchObject({ name, region });
  });

  it.each(["E", "EC", "N", "NW", "SE", "SW", "W", "WC"])("%s is London", (code) => {
    expect(areaInfo(code)).toMatchObject({ region: "London", nation: "England" });
  });

  it("assigns nations from regions", () => {
    expect(areaInfo("EH")?.nation).toBe("Scotland");
    expect(areaInfo("CF")?.nation).toBe("Wales");
    expect(areaInfo("BT")?.nation).toBe("Northern Ireland");
    expect(areaInfo("LN")?.nation).toBe("England");
    expect(areaInfo("JE")?.nation).toBe("Crown Dependencies");
  });

  it("snaps points to the nearest area, not abroad", () => {
    expect(nearestArea(53.234, -0.539)).toBe("LN"); // Lincoln
    expect(nearestArea(55.953, -3.188)).toBe("EH"); // Edinburgh
    expect(nearestArea(48.85, 2.35)).toBeNull(); // Paris
  });
});

describe("parseSignupLocation", () => {
  it("maps a city to its area", () => {
    expect(parseSignupLocation("Leeds, ENG, GB")).toEqual({ city: "Leeds", area: "LS", region: "Yorkshire and the Humber", nation: "England" });
    expect(parseSignupLocation("Middlesbrough, ENG, GB")?.area).toBe("TS");
  });

  it("uses the nation to pick between same-named towns", () => {
    expect(parseSignupLocation("Newport, WLS, GB")?.area).toBe("NP");
    expect(parseSignupLocation("Newport, ENG, GB")?.area).toBe("PO");
  });

  it("maps London to the region, not an area", () => {
    expect(parseSignupLocation("London, ENG, GB")).toEqual({ city: "London", area: null, region: "London", nation: "England" });
  });

  it("keeps the nation when the city is unknown, and flags non-UK", () => {
    expect(parseSignupLocation("Tinyvillage, SCT, GB")).toEqual({ city: "Tinyvillage", area: null, region: null, nation: "Scotland" });
    expect(parseSignupLocation("ENG, GB")?.nation).toBe("England");
    expect(parseSignupLocation("Paris, IDF, FR")?.nation).toBe("Outside UK");
    expect(parseSignupLocation(null)).toBeNull();
  });
});

const trip = (startAddress: string | null, iso: string, lat: number | null = 53.2, lng: number | null = -0.5): TripLite => ({
  startAddress,
  startLat: lat,
  startLng: lng,
  startedAt: new Date(iso),
});

describe("assignHomeArea", () => {
  it("picks the most frequent trip-start district", () => {
    const h = assignHomeArea({
      trips: [
        trip("Lincoln, LN1 2AA", "2026-09-01T08:00:00Z", 53.23, -0.54),
        trip("Lincoln, LN1 3BB", "2026-09-02T08:00:00Z", 53.25, -0.56),
        trip("Gainsborough, DN21 2AB", "2026-09-03T08:00:00Z", 53.4, -0.77),
        trip(null, "2026-09-04T08:00:00Z"),
      ],
      savedHome: { lat: 51.5, lng: -0.1 },
      signupLocation: "London, ENG, GB",
    });
    expect(h).toMatchObject({ confidence: "trip_postcode", area: "LN", district: "LN1", region: "East Midlands", nation: "England" });
    expect(h.point!.lat).toBeCloseTo(53.24, 6);
    expect(h.point!.lng).toBeCloseTo(-0.55, 6);
  });

  it("breaks a tie by the district seen earliest", () => {
    const h = assignHomeArea({
      trips: [
        trip("x, GL56 0AA", "2026-09-05T08:00:00Z"),
        trip("y, OX7 1AA", "2026-09-01T08:00:00Z"),
        trip("z, GL56 0AB", "2026-09-06T08:00:00Z"),
        trip("w, OX7 1AB", "2026-09-07T08:00:00Z"),
      ],
      savedHome: null,
      signupLocation: null,
    });
    expect(h.district).toBe("OX7");
  });

  it("falls back to a saved home, then trip coordinates, then the signup IP", () => {
    expect(assignHomeArea({ trips: [], savedHome: { lat: 50.72, lng: -3.53 }, signupLocation: null })).toMatchObject({
      confidence: "saved_home",
      area: "EX",
      district: null,
    });
    expect(
      assignHomeArea({ trips: [trip("Home", "2026-09-01T08:00:00Z", 55.86, -4.25)], savedHome: null, signupLocation: null })
    ).toMatchObject({ confidence: "trip_location", area: "G", region: "Scotland" });
    expect(assignHomeArea({ trips: [], savedHome: null, signupLocation: "Cardiff, WLS, GB" })).toMatchObject({
      confidence: "signup_ip",
      area: "CF",
      point: null,
    });
    expect(assignHomeArea({ trips: [], savedHome: null, signupLocation: null }).confidence).toBe("unknown");
  });

  it("ignores 0,0 coordinates", () => {
    expect(assignHomeArea({ trips: [trip(null, "2026-09-01T08:00:00Z", 0, 0)], savedHome: null, signupLocation: null }).confidence).toBe(
      "unknown"
    );
  });
});

const home = (area: string | null, district: string | null = null, confidence: HomeArea["confidence"] = "trip_postcode", point: { lat: number; lng: number } | null = null): HomeArea => {
  const info = areaInfo(area);
  return { confidence, area, district, region: info?.region ?? null, nation: info?.nation ?? null, point };
};

let seq = 0;
const user = (over: Partial<GeoUser> & { createdAt: Date }): GeoUser => ({
  id: `u${++seq}`,
  platform: "ios",
  source: null,
  home: home(null, null, "unknown"),
  ip: null,
  lastAutoTripAt: null,
  paying: false,
  pro: false,
  ...over,
});

describe("growthPct", () => {
  it("is null without a previous base", () => {
    expect(growthPct(5, 0)).toBeNull();
    expect(growthPct(5, null)).toBeNull();
    expect(growthPct(6, 4)).toBe(50);
    expect(growthPct(3, 4)).toBe(-25);
  });
});

describe("rollupGeography", () => {
  const opts = { window: 30 as const, platform: "all" as const, source: "all", includeIp: true, now: NOW };

  it("counts window sign-ups, previous window and growth", () => {
    const users = [
      user({ createdAt: daysAgo(1), home: home("LN", "LN1") }),
      user({ createdAt: daysAgo(10), home: home("LN", "LN1") }),
      user({ createdAt: daysAgo(20), home: home("DN", "DN21") }),
      user({ createdAt: daysAgo(40), home: home("LN", "LN1") }),
      user({ createdAt: daysAgo(200), home: home("GL", "GL56") }),
    ];
    const r = rollupGeography(users, opts);
    expect(r.summary).toMatchObject({ signups: 3, prevSignups: 1, growthPct: 200, allTimeUsers: 5, withArea: 3, withAreaPct: 100 });
    const ln = r.byArea.find((a) => a.area === "LN")!;
    expect(ln).toMatchObject({ signups: 2, prevSignups: 1, growthPct: 100, allTimeUsers: 3, name: "Lincoln" });
    const em = r.byRegion.find((x) => x.region === "East Midlands")!;
    expect(em.signups).toBe(2);
    expect(r.byRegion.filter((x) => x.region !== "Unknown").length).toBe(12);
    expect(r.byNation.find((n) => n.nation === "England")?.allTimeUsers).toBe(5);
    expect(r.byArea.find((a) => a.area === "DN")?.newInWindow).toBe(true);
    expect(r.byArea.find((a) => a.area === "LN")?.newInWindow).toBe(false);
    expect(r.summary.newAreas.map((a) => a.area)).toEqual(["DN"]);
  });

  it("computes activation and active drivers", () => {
    const users = [
      user({ createdAt: daysAgo(2), home: home("EX"), lastAutoTripAt: daysAgo(1) }),
      user({ createdAt: daysAgo(3), home: home("EX"), lastAutoTripAt: daysAgo(2.5) }),
      user({ createdAt: daysAgo(4), home: home("EX") }),
      user({ createdAt: daysAgo(100), home: home("EX"), lastAutoTripAt: daysAgo(50), paying: true, pro: true }),
    ];
    const ex = rollupGeography(users, opts).byArea[0];
    expect(ex).toMatchObject({ signups: 3, activatedSignups: 2, activationRatePct: 66.7, activeDrivers: 2, paying: 1, pro: 1 });
  });

  it("applies the district privacy floor everywhere", () => {
    const p = { lat: 53.23, lng: -0.54 };
    const users = [
      user({ createdAt: daysAgo(1), home: home("LN", "LN1", "trip_postcode", p) }),
      user({ createdAt: daysAgo(2), home: home("LN", "LN1", "trip_postcode", { lat: 53.24, lng: -0.55 }) }),
      user({ createdAt: daysAgo(3), home: home("LN", "LN1", "trip_postcode", { lat: 53.25, lng: -0.56 }) }),
      user({ createdAt: daysAgo(4), home: home("DN", "DN21", "trip_postcode", { lat: 53.4, lng: -0.77 }) }),
      user({ createdAt: daysAgo(5), home: home("DN", "DN21", "trip_postcode", { lat: 53.41, lng: -0.78 }) }),
    ];
    const r = rollupGeography(users, opts);
    expect(r.topDistricts.map((d) => d.district)).toEqual(["LN1"]);
    expect(r.topDistricts[0]).toMatchObject({ lat: 53.24, lng: -0.55, allTimeUsers: 3 });
    expect(r.suppressedDistricts).toEqual({ districts: 1, users: 2 });
    const districtPoints = r.mapPoints.filter((m) => m.level === "district");
    expect(districtPoints.map((m) => m.code)).toEqual(["LN1"]);
    // Areas show any count, at their static centroid.
    const dnPoint = r.mapPoints.find((m) => m.level === "area" && m.code === "DN")!;
    expect(dnPoint).toMatchObject({ allTimeUsers: 2, lat: areaInfo("DN")!.lat, lng: areaInfo("DN")!.lng });
    // Newest sign-ups blur the small district.
    const newest = r.newestSignups;
    expect(newest[0].district).toBe("LN1");
    expect(newest.find((n) => n.area === "DN")?.district).toBeNull();
    expect(JSON.stringify(r)).not.toContain("53.41");
  });

  it("filters by platform and source", () => {
    const users = [
      user({ createdAt: daysAgo(1), platform: "ios", source: "facebook", home: home("B") }),
      user({ createdAt: daysAgo(1), platform: "android", source: "friend", home: home("B") }),
      user({ createdAt: daysAgo(1), platform: "both", source: "facebook", home: home("M") }),
    ];
    expect(rollupGeography(users, { ...opts, platform: "android" }).summary.signups).toBe(2);
    expect(rollupGeography(users, { ...opts, source: "facebook" }).summary.signups).toBe(2);
    expect(rollupGeography(users, { ...opts, source: "unanswered" }).summary.signups).toBe(0);
    const b = rollupGeography(users, opts).byArea.find((a) => a.area === "B")!;
    expect(b.platform).toEqual({ ios: 1, android: 1, both: 0, other: 0 });
    expect(b.topSources.map((s) => s.value).sort()).toEqual(["facebook", "friend"]);
  });

  it("can drop IP-only locations", () => {
    const users = [user({ createdAt: daysAgo(1), home: home("LS", null, "signup_ip") })];
    expect(rollupGeography(users, opts).byArea.map((a) => a.area)).toEqual(["LS"]);
    const off = rollupGeography(users, { ...opts, includeIp: false });
    expect(off.byArea).toEqual([]);
    expect(off.summary.byConfidence.signup_ip).toBe(1);
    expect(off.byRegion.find((r) => r.region === "Unknown")?.signups).toBe(1);
  });

  it("builds a daily timeline for short windows and weekly for long", () => {
    const users = [
      user({ createdAt: daysAgo(0.1), home: home("CF") }),
      user({ createdAt: daysAgo(0.2), home: home("EH") }),
      user({ createdAt: daysAgo(5), home: home("CF") }),
    ];
    const r = rollupGeography(users, { ...opts, window: 7 });
    expect(r.timeline.bucket).toBe("day");
    expect(r.timeline.series.length).toBe(8);
    const today = r.timeline.series[r.timeline.series.length - 1];
    expect(today).toMatchObject({ date: "2026-10-02", total: 2, byRegion: { Wales: 1, Scotland: 1 } });
    expect(r.timeline.series.reduce((s, b) => s + b.total, 0)).toBe(3);
    const all = rollupGeography(users, { ...opts, window: "all" });
    expect(all.timeline.bucket).toBe("week");
    expect(all.summary.prevSignups).toBeNull();
    expect(all.summary.growthPct).toBeNull();
  });
});

describe("ipAgreement", () => {
  it("measures how often the signup IP matches the trip postcode", () => {
    const users = [
      user({ createdAt: daysAgo(1), home: home("LS", "LS1"), ip: parseSignupLocation("Leeds, ENG, GB") }),
      user({ createdAt: daysAgo(1), home: home("LN", "LN1"), ip: parseSignupLocation("London, ENG, GB") }),
      user({ createdAt: daysAgo(1), home: home("LN", "LN2"), ip: parseSignupLocation("London, ENG, GB") }),
      user({ createdAt: daysAgo(1), home: home("SW", "SW1"), ip: parseSignupLocation("London, ENG, GB") }),
      user({ createdAt: daysAgo(1), home: home("EH", "EH1"), ip: parseSignupLocation("Manchester, ENG, GB") }),
      user({ createdAt: daysAgo(1), home: home("DN", "DN1"), ip: null }),
      user({ createdAt: daysAgo(1), home: home("DN", null, "saved_home"), ip: parseSignupLocation("Leeds, ENG, GB") }),
    ];
    const r = ipAgreement(users);
    expect(r).toMatchObject({ compared: 5, sameArea: 1, sameRegion: 1, sameNation: 2, differentNation: 1, ipUnknown: 1, ipCityMapped: 2 });
    expect(r.sameAreaPct).toBe(20);
    expect(r.sameRegionOrBetterPct).toBe(40);
    expect(r.topMismatches[0]).toEqual({ ipCity: "London", tripArea: "LN", tripAreaName: "Lincoln", count: 2 });
  });
});

describe("platformOf", () => {
  it("prefers platformsSeen and falls back to signupPlatform", () => {
    expect(platformOf("android,ios", null)).toBe("both");
    expect(platformOf("ios", "android")).toBe("ios");
    expect(platformOf(null, "android")).toBe("android");
    expect(platformOf(null, null)).toBeNull();
  });
});
