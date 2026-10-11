import { describe, it, expect } from "vitest";
import { describeKnownTrip, howRecorded, routeWords } from "../overlapText";

const base = {
  startedAt: new Date(2026, 9, 3, 8, 40).toISOString(),
  endedAt: new Date(2026, 9, 3, 9, 5).toISOString(),
  startAddress: "Home",
  endAddress: "Tesco Extra, Kingston Park, Newcastle upon Tyne NE3 2FP",
  distanceMiles: 9.34,
  isManualEntry: false,
  recordedBy: "automatic",
  createdAt: new Date(2026, 9, 3, 9, 6).toISOString(),
};

describe("describeKnownTrip", () => {
  it("says where, when, how far and how it was recorded", () => {
    expect(describeKnownTrip(base)).toEqual({
      route: "Home to Tesco Extra",
      times: "08:40 to 09:05",
      miles: "9.3 mi",
      how: "Recorded by your phone",
      day: "Sat 3 Oct",
    });
  });

  it("says saved later for a recording that reached the server late", () => {
    const late = { ...base, createdAt: new Date(2026, 9, 3, 14, 0).toISOString() };
    expect(describeKnownTrip(late).how).toBe("Recorded by your phone, saved later");
  });

  it("handles a trip with no end", () => {
    expect(describeKnownTrip({ ...base, endedAt: null }).times).toBe("from 08:40");
  });
});

describe("howRecorded", () => {
  it("falls back on the phone's hand-added flag when the server's fact is missing", () => {
    expect(howRecorded({ isManualEntry: true, recordedBy: null, createdAt: null, endedAt: null })).toBe("Added by hand");
    expect(howRecorded({ isManualEntry: false, recordedBy: null, createdAt: null, endedAt: null })).toBe("Recorded by your phone");
    expect(howRecorded({ isManualEntry: true, recordedBy: "missing_report", createdAt: null, endedAt: null })).toBe(
      "Added from a missing-trip report"
    );
  });
});

describe("routeWords", () => {
  it("uses one end, or says a trip", () => {
    expect(routeWords("Home", null)).toBe("From Home");
    expect(routeWords(null, "Depot")).toBe("To Depot");
    expect(routeWords(null, null)).toBe("A trip");
  });
});
