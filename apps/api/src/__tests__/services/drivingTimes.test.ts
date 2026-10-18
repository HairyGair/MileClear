import { describe, it, expect } from "vitest";
import {
  buildDrivingDays,
  isDriverToldAboutTimes,
  formatSpan,
  londonDate,
  DRIVING_TIMES_LABEL,
} from "../../services/drivingTimes.js";
import {
  generateTeamDrivingTimesCsv,
  generateTeamMonthCsv,
  generateTeamMonthPdf,
  type TeamExportData,
} from "../../services/teamExport.js";

const iv = (start: string, end: string | null) => ({
  startedAt: new Date(start),
  endedAt: end ? new Date(end) : null,
});

describe("buildDrivingDays", () => {
  it("takes the first trip's start and the last trip's end, in London time (BST)", () => {
    // Rob Lyons' example day: 7 trips from 08:12 to 16:04 UTC in October = 09:12 to 17:04 BST.
    const trips = [
      iv("2026-10-14T08:12:00Z", "2026-10-14T08:40:00Z"),
      iv("2026-10-14T10:00:00Z", "2026-10-14T10:20:00Z"),
      iv("2026-10-14T15:30:00Z", "2026-10-14T16:04:00Z"),
    ];
    const [day] = buildDrivingDays(trips, [], { month: "2026-10" });
    expect(day).toMatchObject({
      date: "2026-10-14",
      startLocal: "09:12",
      endLocal: "17:04",
      endsNextDay: false,
      spanMinutes: 472,
      trips: 3,
      source: "trips",
    });
  });

  it("uses GMT once the clocks go back", () => {
    const [day] = buildDrivingDays([iv("2026-11-03T08:12:00Z", "2026-11-03T16:04:00Z")], [], { month: "2026-11" });
    expect(day.startLocal).toBe("08:12");
    expect(day.endLocal).toBe("16:04");
  });

  it("measures the span in real time across the autumn clock change", () => {
    // 25 Oct 2026: clocks go back at 02:00 BST. 00:30 BST (23:30 UTC on the
    // 24th) to 03:30 GMT is four real hours although the wall clock moved three.
    const [day] = buildDrivingDays([iv("2026-10-24T23:30:00Z", "2026-10-25T03:30:00Z")], [], { month: "2026-10" });
    expect(day.date).toBe("2026-10-25");
    expect(day.startLocal).toBe("00:30");
    expect(day.endLocal).toBe("03:30");
    expect(day.spanMinutes).toBe(240);
  });

  it("puts a drive just after London midnight in BST on the London day, not the UTC day", () => {
    // 23:30 UTC on 31 March 2026 is 00:30 BST on 1 April.
    const days = buildDrivingDays([iv("2026-03-31T23:30:00Z", "2026-03-31T23:50:00Z")], []);
    expect(days[0].date).toBe("2026-04-01");
    expect(buildDrivingDays([iv("2026-03-31T23:30:00Z", "2026-03-31T23:50:00Z")], [], { month: "2026-03" })).toEqual([]);
  });

  it("keeps a trip that crosses midnight on the day it started", () => {
    const days = buildDrivingDays(
      [iv("2026-01-10T18:00:00Z", "2026-01-10T19:00:00Z"), iv("2026-01-10T23:40:00Z", "2026-01-11T00:25:00Z")],
      [],
      { month: "2026-01" }
    );
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "2026-01-10", startLocal: "18:00", endLocal: "00:25", endsNextDay: true, trips: 2 });
    expect(days[0].spanMinutes).toBe(385);
  });

  it("never makes a day from a shift alone (an evening gig shift on a day with no business trips)", () => {
    const days = buildDrivingDays(
      [iv("2026-01-13T09:00:00Z", "2026-01-13T09:30:00Z")],
      [iv("2026-01-12T18:00:00Z", "2026-01-12T22:30:00Z")],
      { month: "2026-01" }
    );
    expect(days.map((d) => d.date)).toEqual(["2026-01-13"]);
    expect(buildDrivingDays([], [iv("2026-01-12T07:00:00Z", "2026-01-12T15:30:00Z")])).toEqual([]);
  });

  it("merges a shift with that day's trips: earliest start, latest end across both", () => {
    // Shift 08:00 to 17:00, trips 08:10 to 17:45: the day runs 08:00 to 17:45.
    const [day] = buildDrivingDays(
      [iv("2026-01-13T08:10:00Z", "2026-01-13T08:30:00Z"), iv("2026-01-13T17:10:00Z", "2026-01-13T17:45:00Z")],
      [iv("2026-01-13T08:00:00Z", "2026-01-13T17:00:00Z")],
      { month: "2026-01" }
    );
    expect(day).toMatchObject({ startLocal: "08:00", endLocal: "17:45", trips: 2, source: "shift", spanMinutes: 585 });
  });

  it("says trips when a shift sits inside the trips' span", () => {
    const [day] = buildDrivingDays(
      [iv("2026-01-13T07:00:00Z", "2026-01-13T07:30:00Z"), iv("2026-01-13T18:00:00Z", "2026-01-13T18:30:00Z")],
      [iv("2026-01-13T09:00:00Z", "2026-01-13T17:00:00Z")]
    );
    expect(day).toMatchObject({ startLocal: "07:00", endLocal: "18:30", source: "trips" });
  });

  it("spans several shifts on one day and ignores a shift still running", () => {
    const days = buildDrivingDays(
      [iv("2026-01-14T09:00:00Z", "2026-01-14T09:30:00Z"), iv("2026-01-15T09:00:00Z", "2026-01-15T09:30:00Z")],
      [
        iv("2026-01-14T07:00:00Z", "2026-01-14T11:00:00Z"),
        iv("2026-01-14T13:00:00Z", "2026-01-14T18:00:00Z"),
        iv("2026-01-15T08:00:00Z", null),
      ],
      { month: "2026-01" }
    );
    expect(days.map((d) => [d.date, d.startLocal, d.endLocal, d.source])).toEqual([
      ["2026-01-14", "07:00", "18:00", "shift"],
      ["2026-01-15", "09:00", "09:30", "trips"],
    ]);
  });

  it("leaves out days before the London day the driver joined the team", () => {
    const days = buildDrivingDays(
      [
        iv("2026-10-10T09:00:00Z", "2026-10-10T10:00:00Z"),
        iv("2026-10-11T23:30:00Z", "2026-10-11T23:45:00Z"), // 00:30 BST on the 12th
        iv("2026-10-13T09:00:00Z", "2026-10-13T10:00:00Z"),
      ],
      [],
      { month: "2026-10", fromDate: "2026-10-12" }
    );
    expect(days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("keeps 25 Oct 2026 (BST to GMT) on the right day with the right times", () => {
    // 07:30 GMT and 16:15 GMT, after the clocks went back at 02:00 BST.
    const days = buildDrivingDays(
      [iv("2026-10-24T22:30:00Z", "2026-10-24T22:50:00Z"), iv("2026-10-25T07:30:00Z", "2026-10-25T16:15:00Z")],
      [],
      { month: "2026-10" }
    );
    expect(days.map((d) => [d.date, d.startLocal, d.endLocal])).toEqual([
      ["2026-10-24", "23:30", "23:50"],
      ["2026-10-25", "07:30", "16:15"],
    ]);
  });

  it("treats a trip with no end as ending when it started, and sorts days", () => {
    const days = buildDrivingDays([iv("2026-01-20T10:00:00Z", null), iv("2026-01-02T10:00:00Z", "2026-01-02T10:05:00Z")], []);
    expect(days.map((d) => d.date)).toEqual(["2026-01-02", "2026-01-20"]);
    expect(days[1].spanMinutes).toBe(0);
  });
});

describe("isDriverToldAboutTimes", () => {
  it("is told only by a notice event for this org", () => {
    expect(isDriverToldAboutTimes([], "org-1")).toBe(false);
    expect(isDriverToldAboutTimes([{ metadata: { orgId: "org-1" } }], "org-1")).toBe(true);
  });

  it("does not let another org's notice unlock this org", () => {
    expect(isDriverToldAboutTimes([{ metadata: { orgId: "org-2" } }], "org-1")).toBe(false);
    expect(isDriverToldAboutTimes([{ metadata: null }], "org-1")).toBe(false);
  });
});

describe("helpers", () => {
  it("formats spans", () => {
    expect(formatSpan(472)).toBe("7h 52m");
    expect(formatSpan(60)).toBe("1h 00m");
    expect(formatSpan(5)).toBe("5m");
  });
  it("reads London dates", () => {
    expect(londonDate(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
});

describe("generateTeamMonthPdf driving times", () => {
  it("renders a per-driver daily table across pages without throwing", async () => {
    const trips = Array.from({ length: 31 }, (_, i) => {
      const d = String(i + 1).padStart(2, "0");
      return iv(`2026-10-${d}T08:00:00Z`, `2026-10-${d}T16:00:00Z`);
    });
    const days = buildDrivingDays(trips, [], { month: "2026-10" });
    const pdf = await generateTeamMonthPdf({
      orgName: "Maids Of Glory",
      month: "2026-10",
      rows: [{ driverName: "Ann", businessMiles: 100, ratePence: 55, amountPence: 5500, approvedAt: new Date(), approvedByName: "Rob" }],
      totalMiles: 100,
      totalAmountPence: 5500,
      drivingTimes: [
        { driverName: "Ann", told: true, days },
        { driverName: "Bea", told: true, days },
        { driverName: "Cal", told: false, days: [] },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(days).toHaveLength(31);
  });
});

describe("payroll CSV and the driving times CSV", () => {
  const base: TeamExportData = {
    orgName: "Maids Of Glory",
    month: "2026-10",
    rows: [
      { driverName: "Ann", businessMiles: 100, ratePence: 55, amountPence: 5500, approvedAt: new Date("2026-11-02T10:00:00Z"), approvedByName: "Rob" },
      { driverName: "=Bob", businessMiles: 10, ratePence: 55, amountPence: 550, approvedAt: new Date("2026-11-02T10:00:00Z"), approvedByName: "Rob" },
    ],
    totalMiles: 110,
    totalAmountPence: 6050,
  };
  const annDays = buildDrivingDays([iv("2026-10-14T08:12:00Z", "2026-10-14T16:04:00Z")], []);

  it("keeps the payroll CSV byte-identical with and without told drivers", () => {
    const expected =
      "Driver,Business Miles,Rate (p/mi),Amount,Approved On,Approved By\r\n" +
      "Ann,100,55,£55.00,2 Nov 2026,Rob\r\n" +
      "'=Bob,10,55,£5.50,2 Nov 2026,Rob\r\n" +
      "TOTAL,110,,£60.50,,\r\n";
    expect(generateTeamMonthCsv(base)).toBe(expected);
    expect(
      generateTeamMonthCsv({
        ...base,
        drivingTimes: [
          { driverName: "Ann", told: true, days: annDays },
          { driverName: "=Bob", told: false, days: [] },
        ],
      })
    ).toBe(expected);
  });

  it("writes the labelled daily rows, guards injection, and names a driver not yet told", () => {
    const csv = generateTeamDrivingTimesCsv([
      { driverName: "Ann", told: true, days: annDays },
      { driverName: "=Cat", told: true, days: buildDrivingDays([iv("2026-10-14T08:12:00Z", "2026-10-14T09:00:00Z")], []) },
      { driverName: "=Bob", told: false, days: [] },
    ]);
    expect(csv).toBe(
      `${DRIVING_TIMES_LABEL}\r\n` +
        "Driver,Date,First drive,Last drive,Span,Trips,Times from\r\n" +
        "Ann,14/10/2026,09:12,17:04,7h 52m,1,Trips\r\n" +
        "'=Cat,14/10/2026,09:12,10:00,48m,1,Trips\r\n" +
        "Times appear once =Bob has been told\r\n"
    );
  });

  it("marks a day that ends after midnight and one widened by a shift", () => {
    const days = buildDrivingDays(
      [iv("2026-01-10T18:00:00Z", "2026-01-11T00:25:00Z")],
      [iv("2026-01-10T17:00:00Z", "2026-01-10T23:00:00Z")]
    );
    expect(generateTeamDrivingTimesCsv([{ driverName: "Ann", told: true, days }]).split("\r\n")).toContain(
      "Ann,10/01/2026,17:00,00:25 (next day),7h 25m,1,Shift"
    );
  });
});
