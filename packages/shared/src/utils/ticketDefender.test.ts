import { describe, it, expect } from "vitest";
import {
  accuracyStats,
  addDays,
  buildLookupSummary,
  cazChargeStatus,
  cazChargesOnDay,
  cazDeadlineIsTomorrow,
  cazPayDeadline,
  CAZ_PAY_RULES,
  chooseScaleBar,
  describeDistance,
  describeOffset,
  findRecordingGaps,
  metresBetween,
  nearestInTime,
  nearestToLocation,
  projectTrack,
  sampleIndices,
  speedMphAt,
  tableRows,
  TICKET_DEFENDER_CAVEATS,
  toView,
  ukDayOf,
  ukWallClockToDate,
  windowPoints,
  type TdPoint,
} from "./ticketDefender";
import { CLEAN_AIR_ZONES } from "./cleanAirZone";

const pt = (tripId: string, iso: string, lat: number, lng: number, speed: number | null = null, accuracy: number | null = 8): TdPoint => ({
  tripId,
  recordedAt: iso,
  lat,
  lng,
  speed,
  accuracy,
});

// A drive north along a line in Gateshead, one point a minute, 13:50 to 14:20 UTC.
const BASE = Date.parse("2026-09-15T13:50:00Z");
const drive: TdPoint[] = Array.from({ length: 31 }, (_, i) =>
  pt("t1", new Date(BASE + i * 60_000).toISOString(), 54.94 + i * 0.002, -1.6, 10)
);

describe("geometry", () => {
  it("measures a degree of latitude as about 111 km", () => {
    expect(metresBetween(54, -1.6, 55, -1.6)).toBeGreaterThan(110_000);
    expect(metresBetween(54, -1.6, 55, -1.6)).toBeLessThan(112_000);
  });

  it("keeps only points inside the window, sorted", () => {
    const shuffled = [...drive].reverse();
    const w = windowPoints(shuffled, BASE + 15 * 60_000, 5);
    expect(w).toHaveLength(11);
    expect(w[0].recordedAt < w[10].recordedAt).toBe(true);
  });

  it("finds the point nearest in time, with the offset in seconds", () => {
    const at = BASE + 10 * 60_000 + 20_000; // 14:00:20
    const n = nearestInTime(drive, at)!;
    expect(n.index).toBe(10);
    expect(n.offsetSeconds).toBe(-20);
    expect(nearestInTime([], at)).toBeNull();
  });

  it("finds the point nearest a location", () => {
    const n = nearestToLocation(drive, 54.94 + 20 * 0.002 + 0.0001, -1.6)!;
    expect(n.index).toBe(20);
    expect(n.distanceMetres).toBeLessThan(20);
  });
});

describe("speed", () => {
  it("uses the phone's speed when it gave one (m/s to mph)", () => {
    expect(Math.round(speedMphAt(drive, 5)!)).toBe(22);
  });

  it("works out speed from neighbours when the phone gave none", () => {
    const noSpeed = drive.map((p) => ({ ...p, speed: null }));
    // 0.002 deg lat (~222 m) a minute = about 8.3 mph
    expect(Math.round(speedMphAt(noSpeed, 5)!)).toBe(8);
  });

  it("does not borrow a neighbour from another trip or far away in time", () => {
    const pts = [pt("a", "2026-09-15T13:00:00Z", 54, -1.6), pt("b", "2026-09-15T13:00:30Z", 54.01, -1.6)];
    expect(speedMphAt(pts, 0)).toBeNull();
    const far = [pt("a", "2026-09-15T13:00:00Z", 54, -1.6), pt("a", "2026-09-15T13:05:00Z", 54.01, -1.6)];
    expect(speedMphAt(far, 0)).toBeNull();
  });

  it("ignores a negative speed (iOS sends -1 for unknown)", () => {
    const pts = [pt("a", "2026-09-15T13:00:00Z", 54, -1.6, -1)];
    expect(speedMphAt(pts, 0)).toBeNull();
  });
});

describe("gaps and accuracy", () => {
  it("reports gaps inside a trip, not between trips", () => {
    const pts = [
      pt("a", "2026-09-15T13:00:00Z", 54, -1.6),
      pt("a", "2026-09-15T13:01:00Z", 54, -1.6),
      pt("a", "2026-09-15T13:09:00Z", 54, -1.6), // 8 min gap
      pt("b", "2026-09-15T14:00:00Z", 54, -1.6), // next trip: not a gap
    ];
    const gaps = findRecordingGaps(pts);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].minutes).toBe(8);
  });

  it("gives the median and worst accuracy, ignoring missing values", () => {
    const pts = [5, 10, 40, null].map((a, i) => pt("a", `2026-09-15T13:0${i}:00Z`, 54, -1.6, null, a));
    expect(accuracyStats(pts)).toEqual({ medianMetres: 10, worstMetres: 40 });
    expect(accuracyStats([])).toEqual({ medianMetres: null, worstMetres: null });
  });
});

describe("table rows", () => {
  it("samples evenly and always keeps the must-include indices", () => {
    const idx = sampleIndices(100, 10, [37]);
    expect(idx).toContain(37);
    expect(idx).toContain(0);
    expect(idx).toContain(99);
    expect(idx.length).toBeLessThanOrEqual(11);
    expect(sampleIndices(5, 10)).toEqual([0, 1, 2, 3, 4]);
  });

  it("builds rows around the time with distance from the notice", () => {
    const at = BASE + 15 * 60_000;
    const rows = tableRows(drive, at, { rowMinutes: 5, max: 30, noticeLat: 54.97, noticeLng: -1.6 });
    expect(rows).toHaveLength(11);
    expect(rows[5].distanceFromNoticeMetres).toBeLessThan(10);
    expect(rows[0].speedMph).toBe(22);
  });
});

describe("plain-word summary", () => {
  const view = (i: number) => toView(drive, i, 54.97, -1.6);
  const at = new Date(BASE + 12 * 60_000).toISOString(); // 14:02 UTC = 15:02 UK (BST)

  it("says when, where, how far from the notice and how fast", () => {
    const lines = buildLookupSummary({
      at,
      status: "recorded",
      vehicleLabel: "Vauxhall Astra",
      nearestInTime: { ...view(12), offsetSeconds: 0, address: "Durham Road, Gateshead" },
      nearestToLocation: { ...view(15), offsetSeconds: 180, address: null },
      hasLocation: true,
      gaps: [],
      accuracy: { medianMetres: 8, worstMetres: 12 },
      before: null,
      after: null,
      manualTrips: 0,
    });
    expect(lines[0]).toBe(
      "At 15:02 on Tue 15 Sep MileClear recorded your Vauxhall Astra near Durham Road, Gateshead, 0.4 miles from the location on the notice, moving at about 22 mph."
    );
    expect(lines[1]).toContain("3 minutes after the time on the notice");
    expect(lines[2]).toBe("GPS accuracy around that time was about 8 metres.");
  });

  it("is honest when nothing was recorded", () => {
    const lines = buildLookupSummary({
      at,
      status: "nothing_recorded",
      vehicleLabel: null,
      nearestInTime: null,
      nearestToLocation: null,
      hasLocation: false,
      gaps: [],
      accuracy: { medianMetres: null, worstMetres: null },
      before: "2026-09-15T10:00:00Z",
      after: null,
      manualTrips: 0,
    });
    expect(lines[0]).toContain("no recorded journey");
    expect(lines.join(" ")).toContain("No recording does not show where the vehicle was");
  });

  it("never claims proof and has no em dashes", () => {
    const all = [...TICKET_DEFENDER_CAVEATS].join(" ");
    expect(all).not.toMatch(/prove|win|guarantee/i);
    expect(all).not.toContain("—");
  });

  it("words distances and offsets plainly", () => {
    expect(describeDistance(42)).toBe("about 40 metres");
    expect(describeDistance(1931)).toBe("1.2 miles");
    expect(describeOffset(30)).toBe("at that time");
    expect(describeOffset(-180)).toBe("3 minutes before that");
    expect(describeOffset(3900)).toBe("1 hour 5 minutes after that");
  });
});

describe("track drawing helpers", () => {
  it("picks the longest nice scale bar that fits", () => {
    expect(chooseScaleBar(750)).toEqual({ metres: 500, label: "500 m" });
    expect(chooseScaleBar(2400)).toEqual({ metres: 2000, label: "2 km" });
  });

  it("fits points in the box with north up", () => {
    const proj = projectTrack(drive, 400, 300)!;
    const a = proj.toXY(drive[0].lat, drive[0].lng);
    const b = proj.toXY(drive[30].lat, drive[30].lng);
    expect(b.y).toBeLessThan(a.y); // further north is higher up the page
    for (const p of drive) {
      const xy = proj.toXY(p.lat, p.lng);
      expect(xy.y).toBeGreaterThanOrEqual(15.9);
      expect(xy.y).toBeLessThanOrEqual(284.1);
    }
    expect(projectTrack([], 100, 100)).toBeNull();
  });
});

describe("Clean Air Zone pay-by deadlines", () => {
  it("has a verified rule for every zone the detector knows", () => {
    for (const z of CLEAN_AIR_ZONES) expect(CAZ_PAY_RULES[z.id], z.id).toBeDefined();
  });

  it("London ULEZ: midnight on the third day after travel", () => {
    const d = cazPayDeadline("london-ulez", "2026-09-15")!;
    expect(d.deadlineDay).toBe("2026-09-18");
    expect(d.deadlineAt).toBe("2026-09-18T22:59:59.000Z"); // BST
    expect(d.payUrl).toMatch(/^https:\/\/tfl\.gov\.uk\//);
  });

  it("English CAZs: 11:59pm on the sixth day after, paid on GOV.UK", () => {
    const d = cazPayDeadline("birmingham", "2026-12-28")!;
    expect(d.deadlineDay).toBe("2027-01-03");
    expect(d.deadlineAt).toBe("2027-01-03T23:59:59.000Z"); // GMT
    expect(d.payUrl).toBe("https://www.gov.uk/clean-air-zones");
  });

  it("returns null for a zone without a verified rule", () => {
    expect(cazPayDeadline("glasgow", "2026-09-15")).toBeNull();
  });

  it("ULEZ does not charge on Christmas Day", () => {
    expect(cazChargesOnDay("london-ulez", "2026-12-25")).toBe(false);
    expect(cazChargesOnDay("birmingham", "2026-12-25")).toBe(true);
  });

  it("works out status and the evening-before reminder day", () => {
    const d = cazPayDeadline("bristol", "2026-09-28")!; // deadline 4 Oct
    expect(cazChargeStatus(d, false, new Date("2026-10-04T12:00:00Z"))).toBe("due");
    expect(cazChargeStatus(d, false, new Date("2026-10-05T08:00:00Z"))).toBe("overdue");
    expect(cazChargeStatus(d, true, new Date("2026-10-05T08:00:00Z"))).toBe("paid");
    expect(cazChargeStatus(null, false, new Date())).toBe("unknown_deadline");
    expect(cazDeadlineIsTomorrow(d, new Date("2026-10-03T17:30:00Z"))).toBe(true);
    expect(cazDeadlineIsTomorrow(d, new Date("2026-10-04T17:30:00Z"))).toBe(false);
  });
});

describe("UK dates", () => {
  it("takes the UK calendar day, not the UTC one", () => {
    expect(ukDayOf("2026-09-15T23:30:00Z")).toBe("2026-09-16"); // 00:30 BST
    expect(ukDayOf("2026-12-15T23:30:00Z")).toBe("2026-12-15"); // GMT
  });

  it("converts UK wall-clock time to an instant across the clock change", () => {
    expect(ukWallClockToDate("2026-10-24", 18, 0).toISOString()).toBe("2026-10-24T17:00:00.000Z");
    expect(ukWallClockToDate("2026-10-26", 18, 0).toISOString()).toBe("2026-10-26T18:00:00.000Z");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-29", 6)).toBe("2027-01-04");
  });
});
