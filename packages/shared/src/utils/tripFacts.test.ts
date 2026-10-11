import { describe, it, expect } from "vitest";
import {
  isSavedLaterTrip,
  isTripRecordedBy,
  joinedCountOf,
  resolveRecordedBy,
  splitLegFacts,
  splitPartText,
  tripSaveLagMs,
} from "./tripFacts.js";

const END = "2026-10-10T08:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(END) + mins * 60_000).toISOString();

describe("recordedBy", () => {
  it("accepts only the known values", () => {
    expect(isTripRecordedBy("automatic")).toBe(true);
    expect(isTripRecordedBy("missing_report")).toBe(true);
    expect(isTripRecordedBy("gps")).toBe(false);
    expect(isTripRecordedBy(null)).toBe(false);
  });

  it("keeps the client's answer", () => {
    expect(resolveRecordedBy("start_trip", false)).toBe("start_trip");
    expect(resolveRecordedBy("missing_report", true)).toBe("missing_report");
  });

  it("infers a typed-in trip from an old app, and nothing else", () => {
    expect(resolveRecordedBy(undefined, true)).toBe("added_by_hand");
    expect(resolveRecordedBy(null, false)).toBeNull();
  });
});

describe("split facts", () => {
  it("numbers legs from 1", () => {
    expect(splitLegFacts("p", 0, 2)).toEqual({ splitFromTripId: "p", splitPart: 1, splitPartCount: 2 });
    expect(splitLegFacts("p", 2, 3)).toEqual({ splitFromTripId: "p", splitPart: 3, splitPartCount: 3 });
  });

  it("says Part n of m only for a numbered leg", () => {
    expect(splitPartText({ splitFromTripId: "p", splitPart: 1, splitPartCount: 2 })).toBe("Part 1 of 2");
    expect(splitPartText({ splitFromTripId: "p" })).toBeNull();
    expect(splitPartText({ splitPart: 1, splitPartCount: 2 })).toBeNull();
    expect(splitPartText({ splitFromTripId: "p", splitPart: 3, splitPartCount: 2 })).toBeNull();
    expect(splitPartText({})).toBeNull();
  });
});

describe("joinedCountOf", () => {
  it("counts plain trips as one each", () => {
    expect(joinedCountOf([{}, { joinedCount: null }])).toBe(2);
  });
  it("counts the trips inside an earlier join", () => {
    expect(joinedCountOf([{ joinedCount: 2 }, {}])).toBe(3);
    expect(joinedCountOf([{ joinedCount: 3 }, { joinedCount: 2 }])).toBe(5);
  });
});

describe("saved later", () => {
  it("measures the gap between the end and the server's save", () => {
    expect(tripSaveLagMs({ endedAt: END, createdAt: at(45) })).toBe(45 * 60_000);
    expect(tripSaveLagMs({ endedAt: null, createdAt: at(45) })).toBeNull();
    expect(tripSaveLagMs({ endedAt: END })).toBeNull();
  });

  it("ignores split legs and joins, whose save time is the split's or the join's", () => {
    expect(tripSaveLagMs({ endedAt: END, createdAt: at(300), splitFromTripId: "p", splitPart: 1, splitPartCount: 2 })).toBeNull();
    expect(tripSaveLagMs({ endedAt: END, createdAt: at(300), joinedCount: 2 })).toBeNull();
  });

  it("is true only for a late automatic recording", () => {
    expect(isSavedLaterTrip({ recordedBy: "automatic", endedAt: END, createdAt: at(31) })).toBe(true);
    expect(isSavedLaterTrip({ recordedBy: "automatic", endedAt: END, createdAt: at(30) })).toBe(false);
    expect(isSavedLaterTrip({ recordedBy: "start_trip", endedAt: END, createdAt: at(90) })).toBe(false);
    expect(isSavedLaterTrip({ recordedBy: null, endedAt: END, createdAt: at(90) })).toBe(false);
    expect(isSavedLaterTrip({ endedAt: END, createdAt: at(90) })).toBe(false);
    expect(isSavedLaterTrip({ recordedBy: "automatic", endedAt: END, createdAt: at(90), joinedCount: 2 })).toBe(false);
  });

  it("reads Date values the server holds", () => {
    expect(isSavedLaterTrip({ recordedBy: "automatic", endedAt: new Date(END), createdAt: new Date(at(60)) })).toBe(true);
  });
});
