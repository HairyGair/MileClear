/**
 * Road alerts trial (2 Oct 2026): a driver's "usual roads" corridor, matching
 * events to it (lines, points, direction of travel), and the usual departure
 * time per weekday.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  bearingBin,
  buildCorridor,
  departurePhase,
  estimateDepartures,
  matchEventToCorridor,
  ukLocalParts,
  type BreadcrumbTrip,
  type LatLng,
} from "../../services/roadCorridor.js";
import { parseTomTomIncidents } from "../../services/roadEvents.js";

const FIX = path.resolve(__dirname, "../fixtures/roadAlerts");
const events = parseTomTomIncidents(JSON.parse(readFileSync(path.join(FIX, "tomtom-incidents.json"), "utf8")));
const closureSB = events.find((e) => e.id === "tt:m6-sb-closure")!;
const accidentNB = events.find((e) => e.id === "tt:m6-nb-accident")!;

/** Breadcrumbs every ~50 m along a polyline. */
function densify(line: LatLng[], stepM = 50): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const dLat = (b[0] - a[0]) * 111320;
    const dLng = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
    const n = Math.max(1, Math.ceil(Math.hypot(dLat, dLng) / stepM));
    for (let s = 0; s < n; s++) out.push({ lat: a[0] + ((b[0] - a[0]) * s) / n, lng: a[1] + ((b[1] - a[1]) * s) / n });
  }
  const last = line[line.length - 1];
  out.push({ lat: last[0], lng: last[1] });
  return out;
}

// The driver's run: the M6 southbound J14 -> J13 stretch, extended a little
// either side along the same heading.
const SB_RUN: LatLng[] = [[52.7835, -2.1219], ...closureSB.lines[0], [52.7658, -2.1111]];
const NB_RUN: LatLng[] = [...SB_RUN].reverse();

function trips(run: LatLng[], days: string[]): BreadcrumbTrip[] {
  return days.map((dayKey) => ({ dayKey, points: densify(run) }));
}

describe("buildCorridor", () => {
  it("keeps only cells used on at least 3 different days", () => {
    const sameDay = buildCorridor(trips(SB_RUN, ["2026-09-28", "2026-09-28", "2026-09-28", "2026-09-28"]));
    expect(sameDay.cells.size).toBe(0);
    expect(sameDay.bbox).toBeNull();

    const twoDays = buildCorridor(trips(SB_RUN, ["2026-09-28", "2026-09-29"]));
    expect(twoDays.cells.size).toBe(0);

    const threeDays = buildCorridor(trips(SB_RUN, ["2026-09-28", "2026-09-29", "2026-09-30"]));
    expect(threeDays.cells.size).toBeGreaterThan(5);
    expect(threeDays.drivingDays).toBe(3);
    for (const c of threeDays.cells.values()) expect(c.days).toBe(3);
  });

  it("records the direction of travel", () => {
    const c = buildCorridor(trips(SB_RUN, ["d1", "d2", "d3"]));
    const southish = (1 << bearingBin(180)) | (1 << bearingBin(135)) | (1 << bearingBin(225));
    const anyNorth = (1 << bearingBin(0)) | (1 << bearingBin(45)) | (1 << bearingBin(315));
    let sawSouth = false;
    for (const cell of c.cells.values()) {
      if (cell.bins & southish) sawSouth = true;
      expect(cell.bins & anyNorth).toBe(0);
    }
    expect(sawSouth).toBe(true);
  });

  it("does not fill in a long gap in the recording", () => {
    const gappy: BreadcrumbTrip[] = ["d1", "d2", "d3"].map((dayKey) => ({
      dayKey,
      points: [{ lat: 52.0, lng: -2.0 }, { lat: 52.5, lng: -2.0 }], // 55 km jump
    }));
    const c = buildCorridor(gappy);
    expect(c.cells.size).toBe(2); // the two ends only
  });

  it("ignores 0,0 fixes", () => {
    const c = buildCorridor([{ dayKey: "d1", points: [{ lat: 0, lng: 0 }] }]);
    expect(c.drivingDays).toBe(0);
  });
});

describe("matchEventToCorridor", () => {
  const southboundDriver = buildCorridor(trips(SB_RUN, ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]));

  it("matches a closure on the driver's carriageway and reports the days", () => {
    const m = matchEventToCorridor(southboundDriver, closureSB);
    expect(m.matched).toBe(true);
    expect(m.days).toBe(4);
    expect(m.matchedMetres).toBeGreaterThan(300);
  });

  it("does NOT match the opposite carriageway when the driver only goes the other way", () => {
    expect(matchEventToCorridor(southboundDriver, accidentNB).matched).toBe(false);
  });

  it("matches both carriageways for a driver who uses both", () => {
    const both = buildCorridor([
      ...trips(SB_RUN, ["d1", "d2", "d3"]),
      ...trips(NB_RUN, ["d1", "d2", "d3"]),
    ]);
    expect(matchEventToCorridor(both, closureSB).matched).toBe(true);
    expect(matchEventToCorridor(both, accidentNB).matched).toBe(true);
  });

  it("does not match a road the driver only crosses (a bridge)", () => {
    const crossing = { lines: [[[52.775, -2.13], [52.775, -2.105]] as LatLng[]], points: [], directionMode: "along" as const };
    expect(matchEventToCorridor(southboundDriver, crossing).matched).toBe(false);
  });

  it("an 'axis' (both-ways) line matches whichever way the driver goes", () => {
    const axisNorthward = { lines: [NB_RUN.slice(2, 6)], points: [], directionMode: "axis" as const };
    expect(matchEventToCorridor(southboundDriver, axisNorthward).matched).toBe(true);
    const alongNorthward = { ...axisNorthward, directionMode: "along" as const };
    expect(matchEventToCorridor(southboundDriver, alongNorthward).matched).toBe(false);
  });

  it("points match on location only, with a little tolerance for GPS offset", () => {
    const onRoad = { lines: [], points: [[52.7745, -2.11645] as LatLng], directionMode: "none" as const };
    expect(matchEventToCorridor(southboundDriver, onRoad).matched).toBe(true);
    const farAway = { lines: [], points: [[52.9, -2.3] as LatLng], directionMode: "none" as const };
    expect(matchEventToCorridor(southboundDriver, farAway)).toEqual({ matched: false, days: 0, matchedMetres: 0 });
  });

  it("an empty corridor never matches", () => {
    expect(matchEventToCorridor(buildCorridor([]), closureSB).matched).toBe(false);
  });
});

describe("estimateDepartures", () => {
  // BST in Sep/Oct 2026: 06:30 UK = 05:30 UTC.
  const mondays = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];

  it("takes the median FIRST start of each Monday", () => {
    const starts = mondays.flatMap((d, i) => [
      new Date(`${d}T05:${20 + i * 5}:00Z`), // 06:20, 06:25, 06:30, 06:35 UK
      new Date(`${d}T09:00:00Z`), // a later trip that day is not the first start
    ]);
    const p = estimateDepartures(starts);
    expect(p.byWeekday[1]).toBe(6 * 60 + 28); // median of 06:20..06:35 rounds to 06:28
    expect(p.byWeekday[2]).toBeNull();
  });

  it("ignores starts before 04:00 (late-night work, not setting off)", () => {
    const starts = mondays.flatMap((d) => [new Date(`${d}T01:00:00Z`), new Date(`${d}T06:00:00Z`)]);
    expect(estimateDepartures(starts).byWeekday[1]).toBe(7 * 60);
  });

  it("needs at least 3 of that weekday", () => {
    const starts = mondays.slice(0, 2).map((d) => new Date(`${d}T06:00:00Z`));
    expect(estimateDepartures(starts).byWeekday[1]).toBeNull();
  });

  it("no usual time when the starts are all over the place", () => {
    const starts = [
      new Date("2026-09-07T05:00:00Z"),
      new Date("2026-09-14T09:00:00Z"),
      new Date("2026-09-21T13:00:00Z"),
      new Date("2026-09-28T16:00:00Z"),
    ];
    expect(estimateDepartures(starts).byWeekday[1]).toBeNull();
  });

  it("reads UK local time on both sides of the clocks changing", () => {
    // 25 Oct 2026: clocks go back. 06:00 UK is 05:00Z before, 06:00Z after.
    expect(ukLocalParts(new Date("2026-10-19T05:00:00Z")).minutes).toBe(360);
    expect(ukLocalParts(new Date("2026-10-26T06:00:00Z")).minutes).toBe(360);
    expect(ukLocalParts(new Date("2026-10-26T06:00:00Z")).weekday).toBe(1);
  });
});

describe("departurePhase", () => {
  const dep = 6 * 60 + 30; // 06:30
  it("sends 25-45 minutes before, prefetches 45-60 minutes before", () => {
    expect(departurePhase(5 * 60 + 29, dep)).toBe("outside"); // 61 min before
    expect(departurePhase(5 * 60 + 30, dep)).toBe("prefetch"); // 60
    expect(departurePhase(5 * 60 + 44, dep)).toBe("prefetch"); // 46
    expect(departurePhase(5 * 60 + 45, dep)).toBe("send"); // 45
    expect(departurePhase(6 * 60 + 5, dep)).toBe("send"); // 25
    expect(departurePhase(6 * 60 + 6, dep)).toBe("outside"); // 24
    expect(departurePhase(6 * 60, null)).toBe("outside");
  });
});
