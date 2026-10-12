/**
 * The flight rule, checked against the 12 Oct 2026 Edinburgh to Toronto
 * recording and against everything that must NOT be called a flight.
 */
import { describe, it, expect } from "vitest";
import { findFlights, cutFlights, type FlightFix } from "../flightRule";

const T0 = Date.parse("2026-10-12T10:00:00Z");
const EDI = { lat: 55.95, lng: -3.37 };
const YYZ = { lat: 43.68, lng: -79.63 };

type Pt = { lat: number; lng: number };
const MILES_PER_DEG_LAT = 69.05;

function fix(p: Pt, atMs: number): FlightFix {
  return { lat: p.lat, lng: p.lng, recorded_at: new Date(atMs).toISOString() };
}

/** A straight drive heading north at `mph`, one fix every `everySec`. */
function drive(from: Pt, startMs: number, mph: number, minutes: number, everySec = 10): FlightFix[] {
  const out: FlightFix[] = [];
  const steps = Math.floor((minutes * 60) / everySec);
  const dLat = (mph * (everySec / 3600)) / MILES_PER_DEG_LAT;
  for (let i = 0; i <= steps; i++) {
    out.push(fix({ lat: from.lat + i * dLat, lng: from.lng }, startMs + i * everySec * 1000));
  }
  return out;
}

/** Fixes on the straight line between two points, one every `everySec`. */
function line(a: Pt, b: Pt, startMs: number, durationSec: number, everySec: number): FlightFix[] {
  const out: FlightFix[] = [];
  const steps = Math.round(durationSec / everySec);
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    out.push(fix({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }, startMs + i * everySec * 1000));
  }
  return out;
}

function stepSpeeds(fixes: FlightFix[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < fixes.length; i++) {
    const dt = (Date.parse(fixes[i].recorded_at) - Date.parse(fixes[i - 1].recorded_at)) / 3600000;
    const dLat = (fixes[i].lat - fixes[i - 1].lat) * MILES_PER_DEG_LAT;
    const dLng = (fixes[i].lng - fixes[i - 1].lng) * MILES_PER_DEG_LAT * Math.cos((fixes[i].lat * Math.PI) / 180);
    out.push(Math.hypot(dLat, dLng) / dt);
  }
  return out;
}

describe("a flight with good GPS", () => {
  // Drive to the airport (25 min), wait at the gate, take off, 7 hours in the
  // air, land, drive away in Toronto (15 min).
  const toAirport = drive({ lat: 55.88, lng: -3.37 }, T0, 55, 25);
  const gateStart = Date.parse(toAirport[toAirport.length - 1].recorded_at);
  const gate = [0, 1, 2].map((i) => fix(EDI, gateStart + (i + 1) * 20 * 60 * 1000));
  const takeoffAt = Date.parse(gate[gate.length - 1].recorded_at) + 30 * 60 * 1000;
  // take-off roll and climb: 40, 90, 140, 180 mph, 10 s apart
  const roll: FlightFix[] = [];
  let rollLat = EDI.lat;
  let rollT = takeoffAt;
  for (const mph of [40, 90, 140, 180]) {
    rollT += 10_000;
    rollLat += (mph * (10 / 3600)) / MILES_PER_DEG_LAT;
    roll.push(fix({ lat: rollLat, lng: EDI.lng }, rollT));
  }
  const cruise = line({ lat: rollLat, lng: EDI.lng }, YYZ, rollT, 7 * 3600, 60);
  const landT = rollT + 7 * 3600 * 1000;
  const landing = fix(YYZ, landT);
  const taxi = [fix({ lat: YYZ.lat + 0.004, lng: YYZ.lng }, landT + 5 * 60 * 1000)];
  const away = drive({ lat: YYZ.lat + 0.01, lng: YYZ.lng }, landT + 40 * 60 * 1000, 45, 15);
  const all = [...toAirport, ...gate, ...roll, ...cruise, landing, ...taxi, ...away];

  it("finds exactly one flight, cut from the airport to the landing", () => {
    const spans = findFlights(all);
    expect(spans).toHaveLength(1);
    const s = spans[0];
    expect(s.kind).toBe("dense");
    expect(s.miles).toBeGreaterThan(3000);
    // The kept boundary fixes are on the ground at each end.
    const startFix = all[s.startIdx];
    const endFix = all[s.endIdx];
    expect(Math.abs(startFix.lat - EDI.lat)).toBeLessThan(0.02);
    expect(Math.abs(endFix.lat - YYZ.lat)).toBeLessThan(0.02);
    expect(s.removedCount).toBeGreaterThan(400);
  });

  it("keeps the drive to the airport and the drive away, in two legs", () => {
    const spans = findFlights(all);
    const { kept, legStarts } = cutFlights(all, spans);
    expect(legStarts).toHaveLength(1);
    const pre = kept.slice(0, legStarts[0]);
    const post = kept.slice(legStarts[0]);
    // Every fix of both car legs survived.
    for (const f of [...toAirport, ...gate]) expect(pre).toContainEqual(f);
    for (const f of away) expect(post).toContainEqual(f);
    // And nothing left in either leg moves like an aeroplane.
    expect(Math.max(...stepSpeeds(pre))).toBeLessThan(100);
    expect(Math.max(...stepSpeeds(post))).toBeLessThan(100);
  });
});

describe("a flight with sparse GPS", () => {
  it("catches a single jump from the gate to the far end", () => {
    // Phone lost its fix at the gate and found one on landing 6.9 hours later.
    const before = drive({ lat: 55.88, lng: -3.37 }, T0, 55, 25);
    const lastMs = Date.parse(before[before.length - 1].recorded_at);
    const landing = fix(YYZ, lastMs + 6.9 * 3600 * 1000);
    const after = drive({ lat: YYZ.lat + 0.01, lng: YYZ.lng }, Date.parse(landing.recorded_at) + 600_000, 40, 10);
    const all = [...before, landing, ...after];
    const spans = findFlights(all);
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe("sparse");
    expect(spans[0].removedCount).toBe(0);
    const { kept, legStarts } = cutFlights(all, spans);
    expect(kept).toHaveLength(all.length);
    expect(legStarts).toEqual([before.length]);
  });

  it("catches a few in-flight fixes hours apart", () => {
    const mid = { lat: 52, lng: -40 };
    const all = [
      ...drive({ lat: 55.88, lng: -3.37 }, T0, 55, 25),
      fix(EDI, T0 + 40 * 60_000),
      fix(mid, T0 + 4 * 3600_000),
      fix(YYZ, T0 + 8 * 3600_000),
    ];
    const spans = findFlights(all);
    expect(spans).toHaveLength(1);
    expect(spans[0].endIdx).toBe(all.length - 1);
  });

  it("catches a flight whose ground leg after it is too short to matter", () => {
    const all = [fix(EDI, T0), fix(YYZ, T0 + 7 * 3600_000)];
    expect(findFlights(all)).toHaveLength(1);
  });
});

describe("a flight with a bad fix in mid-air", () => {
  it("is still one flight", () => {
    const a = fix(EDI, T0);
    const air = line(EDI, YYZ, T0, 7 * 3600, 60);
    // One mid-air fix sent 40 miles sideways.
    air[200] = { ...air[200], lat: air[200].lat + 0.6 };
    const all = [a, ...air, fix(YYZ, T0 + 7 * 3600_000)];
    const spans = findFlights(all);
    expect(spans).toHaveLength(1);
    expect(spans[0].miles).toBeGreaterThan(3000);
  });
});

describe("what is not a flight", () => {
  it("a fast motorway drive", () => {
    // 3 hours at 90 mph with 10 mph bursts to 115.
    const out = drive({ lat: 51, lng: -1 }, T0, 90, 180);
    expect(findFlights(out)).toEqual([]);
    const burst = drive({ lat: 51, lng: -1 }, T0, 115, 60);
    expect(findFlights(burst)).toEqual([]);
  });

  it("a long drive with a GPS hole in it", () => {
    // 80 miles across a 60-minute silence (80 mph average).
    const before = drive({ lat: 51, lng: -1 }, T0, 60, 20);
    const last = before[before.length - 1];
    const after = [fix({ lat: last.lat + 80 / MILES_PER_DEG_LAT, lng: last.lng }, Date.parse(last.recorded_at) + 3600_000)];
    expect(findFlights([...before, ...after])).toEqual([]);
    // 150 miles across 3 hours.
    const longHole = [fix({ lat: 51, lng: -1 }, T0), fix({ lat: 51 + 150 / MILES_PER_DEG_LAT, lng: -1 }, T0 + 3 * 3600_000)];
    expect(findFlights(longHole)).toEqual([]);
  });

  it("a single 500 mph GPS spike", () => {
    const d = drive({ lat: 51, lng: -1 }, T0, 60, 30);
    // One fix 3 miles away, 20 seconds from its neighbours.
    d[60] = { ...d[60], lat: d[60].lat + 3 / MILES_PER_DEG_LAT };
    expect(findFlights(d)).toEqual([]);
  });

  it("a teleport 200 miles away and straight back", () => {
    const d = drive({ lat: 51, lng: -1 }, T0, 60, 30);
    d[60] = { ...d[60], lat: d[60].lat + 200 / MILES_PER_DEG_LAT };
    expect(findFlights(d)).toEqual([]);
  });

  it("a wrong position held for twelve minutes, then back", () => {
    const d = drive({ lat: 51, lng: -1 }, T0, 60, 40);
    for (let i = 60; i < 130; i++) d[i] = { ...d[i], lat: d[i].lat + 150 / MILES_PER_DEG_LAT };
    expect(findFlights(d)).toEqual([]);
  });

  it("a wrong position held for an hour: too brief a stretch of speed to be a flight", () => {
    const d = drive({ lat: 51, lng: -1 }, T0, 60, 120);
    for (let i = 60; i < d.length; i++) d[i] = { ...d[i], lat: d[i].lat + 150 / MILES_PER_DEG_LAT };
    expect(findFlights(d)).toEqual([]);
  });

  it("a high-speed train at 186 mph for two hours", () => {
    expect(findFlights(drive({ lat: 51, lng: -1 }, T0, 186, 140, 30))).toEqual([]);
    // Sparse, as in a tunnel: London to Paris, 306 miles in 2h16m (135 mph).
    const sparse = [fix({ lat: 51.5, lng: -0.1 }, T0), fix({ lat: 51.5 + 306 / MILES_PER_DEG_LAT, lng: -0.1 }, T0 + 136 * 60_000)];
    expect(findFlights(sparse)).toEqual([]);
  });

  it("a short 270 mph maglev run", () => {
    // 19 miles in 4 minutes at the peak: fast, but short and nowhere near 60 miles.
    expect(findFlights(drive({ lat: 31, lng: 121 }, T0, 270, 4, 10))).toEqual([]);
  });

  it("nothing, one fix, bad data, no time passing", () => {
    expect(findFlights([])).toEqual([]);
    expect(findFlights([fix(EDI, T0)])).toEqual([]);
    expect(findFlights([fix(EDI, T0), { lat: NaN, lng: 0, recorded_at: new Date(T0 + 1000).toISOString() }])).toEqual([]);
    expect(findFlights([fix(EDI, T0), fix(YYZ, T0)])).toEqual([]);
    expect(findFlights([fix(EDI, T0), { lat: 1, lng: 1, recorded_at: "garbage" }])).toEqual([]);
  });
});

describe("cutFlights", () => {
  it("passes a recording with no flight straight through", () => {
    const d = drive({ lat: 51, lng: -1 }, T0, 50, 10);
    const { kept, legStarts } = cutFlights(d, []);
    expect(kept).toEqual(d);
    expect(legStarts).toEqual([]);
  });

  it("cuts two flights and starts a leg after each", () => {
    const leg1 = drive({ lat: 55.88, lng: -3.37 }, T0, 55, 10);
    const f1 = [...line(EDI, { lat: 40.6, lng: -73.8 }, T0 + 3600_000, 7 * 3600, 60), fix({ lat: 40.6, lng: -73.8 }, T0 + 8 * 3600_000)];
    const mid = [fix({ lat: 40.6, lng: -73.8 }, T0 + 9 * 3600_000), fix({ lat: 40.6, lng: -73.8 }, T0 + 10 * 3600_000)];
    const f2 = [...line({ lat: 40.6, lng: -73.8 }, { lat: 34, lng: -118.4 }, T0 + 10 * 3600_000, 5 * 3600, 60), fix({ lat: 34, lng: -118.4 }, T0 + 15 * 3600_000)];
    const all = [
      ...leg1,
      fix(EDI, T0 + 3600_000),
      ...f1,
      ...mid,
      ...f2,
    ];
    const spans = findFlights(all);
    expect(spans).toHaveLength(2);
    const { legStarts } = cutFlights(all, spans);
    expect(legStarts).toHaveLength(2);
    expect(legStarts[1]).toBeGreaterThan(legStarts[0]);
  });
});
