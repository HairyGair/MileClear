import { describe, it, expect } from "vitest";
import {
  describeReportNote,
  placeLabel,
  canSendReport,
  endTimeFor,
  parseMilesInput,
  findOverlappingTrip,
  pauseIntervals,
  pauseCovering,
  pauseNotice,
  MAX_PAUSE_MS,
  type LocalTripRow,
} from "../missingReportRule";
import { describePause } from "../../tracking/pauseRule";

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe("describeReportNote", () => {
  it("reads like the notes support already gets", () => {
    expect(
      describeReportNote({
        from: "Fleetwood FY7 7LP",
        to: "L9 0NB",
        departAt: at(2026, 9, 24, 13, 40),
        extra: "",
      })
    ).toBe("Fleetwood FY7 7LP to L9 0NB, set off around 13:40 on Thu 24 Sep.");
  });

  it("adds the optional note after the route", () => {
    expect(
      describeReportNote({ from: "Home", to: "Tesco", departAt: at(2026, 9, 24, 9), extra: " came back too " })
    ).toBe("Home to Tesco, set off around 09:00 on Thu 24 Sep. came back too");
  });

  it("copes with only a note and a time", () => {
    expect(describeReportNote({ from: null, to: null, departAt: at(2026, 9, 24, 9), extra: "the school run" })).toBe(
      "Set off around 09:00 on Thu 24 Sep. the school run"
    );
  });
});

describe("placeLabel / canSendReport", () => {
  it("names a map pin with no address", () => {
    expect(placeLabel(null)).toBe("a point picked on the map");
    expect(placeLabel(" Leeds ")).toBe("Leeds");
  });

  it("needs a time and either both places or a note", () => {
    const t = new Date();
    expect(canSendReport({ hasFrom: true, hasTo: true, departAt: null, extra: "" })).toBe(false);
    expect(canSendReport({ hasFrom: true, hasTo: true, departAt: t, extra: "" })).toBe(true);
    expect(canSendReport({ hasFrom: true, hasTo: false, departAt: t, extra: "" })).toBe(false);
    expect(canSendReport({ hasFrom: false, hasTo: false, departAt: t, extra: "home to work" })).toBe(true);
  });
});

describe("endTimeFor", () => {
  const depart = at(2026, 9, 24, 13, 40);
  const later = at(2026, 9, 26, 12).getTime();

  it("adds the routed duration, rounded up to the minute", () => {
    expect(endTimeFor({ departAt: depart, routedSecs: 1810, typedMiles: null, now: later })).toEqual(
      at(2026, 9, 24, 14, 11)
    );
  });

  it("estimates at 30 mph from typed miles when routing failed", () => {
    expect(endTimeFor({ departAt: depart, routedSecs: null, typedMiles: 15, now: later })).toEqual(
      at(2026, 9, 24, 14, 10)
    );
  });

  it("never ends in the future, and never before a minute after the start", () => {
    const now = at(2026, 9, 24, 13, 50).getTime();
    expect(endTimeFor({ departAt: depart, routedSecs: 3600, typedMiles: null, now }).getTime()).toBe(now);
    const justNow = at(2026, 9, 24, 13, 40).getTime();
    expect(endTimeFor({ departAt: depart, routedSecs: 3600, typedMiles: null, now: justNow })).toEqual(
      at(2026, 9, 24, 13, 41)
    );
  });
});

describe("parseMilesInput", () => {
  it("accepts plain numbers, commas and a unit", () => {
    expect(parseMilesInput("12.4")).toBe(12.4);
    expect(parseMilesInput("12,4")).toBe(12.4);
    expect(parseMilesInput("8 miles")).toBe(8);
    expect(parseMilesInput("3.14159")).toBe(3.1);
  });
  it("refuses nonsense", () => {
    expect(parseMilesInput("")).toBeNull();
    expect(parseMilesInput("abc")).toBeNull();
    expect(parseMilesInput("0")).toBeNull();
    expect(parseMilesInput("-3")).toBeNull();
    expect(parseMilesInput("5000")).toBeNull();
  });
});

describe("findOverlappingTrip", () => {
  const trip = (id: string, s: Date, e: Date | null): LocalTripRow => ({
    id,
    started_at: s.toISOString(),
    ended_at: e ? e.toISOString() : null,
    start_address: null,
    end_address: null,
    distance_miles: 1,
  });

  it("finds a trip that overlaps the new one", () => {
    const rows = [trip("a", at(2026, 9, 24, 13, 30), at(2026, 9, 24, 14))];
    expect(findOverlappingTrip(rows, at(2026, 9, 24, 13, 40), at(2026, 9, 24, 14, 10))?.id).toBe("a");
  });

  it("lets back-to-back trips through", () => {
    const rows = [trip("a", at(2026, 9, 24, 13), at(2026, 9, 24, 13, 40))];
    expect(findOverlappingTrip(rows, at(2026, 9, 24, 13, 40), at(2026, 9, 24, 14))).toBeNull();
  });

  it("treats a trip with no end as a minute long", () => {
    const rows = [trip("a", at(2026, 9, 24, 13, 45), null)];
    expect(findOverlappingTrip(rows, at(2026, 9, 24, 13, 40), at(2026, 9, 24, 14))?.id).toBe("a");
    expect(findOverlappingTrip(rows, at(2026, 9, 24, 14), at(2026, 9, 24, 14, 30))).toBeNull();
  });
});

describe("pause intervals", () => {
  const ev = (d: Date, event: string, data?: Record<string, unknown>) => ({
    recorded_at: d.toISOString(),
    event,
    data: data ? JSON.stringify(data) : null,
  });

  it("ends a pause at its until, or at an earlier resume", () => {
    const until = at(2026, 9, 25, 6).getTime();
    const rows = [
      ev(at(2026, 9, 24, 20), "drive_paused", { until }),
      ev(at(2026, 9, 24, 22), "drive_resumed", { reason: "manual" }),
      ev(at(2026, 9, 26, 8), "drive_paused", { until: at(2026, 10, 3, 8).getTime() }),
    ];
    const iv = pauseIntervals(rows, null);
    expect(iv).toEqual([
      { start: at(2026, 9, 24, 20).getTime(), end: at(2026, 9, 24, 22).getTime() },
      { start: at(2026, 9, 26, 8).getTime(), end: at(2026, 10, 3, 8).getTime() },
    ]);
    expect(pauseCovering(iv, at(2026, 9, 24, 21).getTime())).not.toBeNull();
    expect(pauseCovering(iv, at(2026, 9, 24, 23).getTime())).toBeNull();
  });

  it("adds a running pause whose start rolled out of the log", () => {
    const until = at(2026, 10, 1, 6).getTime();
    const iv = pauseIntervals([], until);
    expect(iv).toEqual([{ start: null, end: until }]);
    expect(pauseCovering(iv, until - 60_000)).not.toBeNull();
    expect(pauseCovering(iv, until - MAX_PAUSE_MS - 60_000)).toBeNull();
  });

  it("skips unreadable pause events", () => {
    expect(pauseIntervals([{ recorded_at: "x", event: "drive_paused", data: "{" }], null)).toEqual([]);
  });
});

describe("pauseNotice", () => {
  const now = at(2026, 9, 26, 12).getTime();

  it("says a running pause is on, whatever the time picked", () => {
    const until = at(2026, 10, 1, 6).getTime();
    const n = pauseNotice({
      intervals: [{ start: at(2026, 9, 26, 8).getTime(), end: until }],
      activeUntil: until,
      departAt: null,
      now,
      describeActive: describePause,
    });
    expect(n?.kind).toBe("active");
    expect(n?.text).toBe("Recording is paused until Thu 1 Oct, so drives in that time aren't being recorded.");
  });

  it("names a finished pause that covered the drive", () => {
    const n = pauseNotice({
      intervals: [{ start: at(2026, 9, 24, 20).getTime(), end: at(2026, 9, 25, 6).getTime() }],
      activeUntil: null,
      departAt: at(2026, 9, 24, 22),
      now,
      describeActive: describePause,
    });
    expect(n).toMatchObject({ kind: "covered" });
    expect(n?.text).toBe("Recording was paused until 06:00 on Fri 25 Sep, so drives in that time weren't recorded.");
  });

  it("stays quiet when no pause touched the drive", () => {
    expect(
      pauseNotice({
        intervals: [{ start: at(2026, 9, 24, 20).getTime(), end: at(2026, 9, 25, 6).getTime() }],
        activeUntil: null,
        departAt: at(2026, 9, 25, 9),
        now,
        describeActive: describePause,
      })
    ).toBeNull();
  });
});
