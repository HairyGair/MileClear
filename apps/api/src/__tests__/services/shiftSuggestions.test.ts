/**
 * Shift suggestion clustering: which runs of trips look like a work session
 * worth offering as a shift (15 Sep 2026: 152 of 626 active drivers ever
 * pressed Start Shift, so the scorecard went unused by the rest).
 */
import { describe, it, expect } from "vitest";
import {
  clusterTripsIntoSessions,
  SHIFT_SUGGESTION_MAX_GAP_MINUTES,
  SHIFT_SUGGESTION_MIN_TRIPS,
  SHIFT_SUGGESTION_MIN_SPAN_MINUTES,
  type ShiftSuggestionTripInput,
} from "../../services/shiftSuggestions.js";

const T0 = Date.UTC(2026, 8, 14, 16, 0, 0); // 14 Sep 2026, 16:00 UTC

function trip(
  id: string,
  startMin: number,
  endMin: number,
  opts: Partial<Omit<ShiftSuggestionTripInput, "id" | "startedAt" | "endedAt">> = {}
): ShiftSuggestionTripInput {
  return {
    id,
    startedAt: new Date(T0 + startMin * 60000),
    endedAt: new Date(T0 + endMin * 60000),
    distanceMiles: opts.distanceMiles ?? 5,
    classification: opts.classification ?? "business",
    platformTag: opts.platformTag ?? null,
    shiftId: opts.shiftId ?? null,
    isManualEntry: opts.isManualEntry ?? false,
  };
}

/** Six 15-minute trips with 20-minute gaps: 16:00 to 19:10. */
function evening(overrides: Partial<ShiftSuggestionTripInput>[] = []): ShiftSuggestionTripInput[] {
  return Array.from({ length: 6 }, (_, i) => {
    const start = i * 35;
    return { ...trip(`t${i + 1}`, start, start + 15), ...(overrides[i] ?? {}) };
  });
}

describe("clusterTripsIntoSessions", () => {
  it("exports the thresholds the route and copy rely on", () => {
    expect(SHIFT_SUGGESTION_MAX_GAP_MINUTES).toBe(45);
    expect(SHIFT_SUGGESTION_MIN_TRIPS).toBe(3);
    expect(SHIFT_SUGGESTION_MIN_SPAN_MINUTES).toBe(90);
  });

  it("turns a 6-trip evening with 20-minute gaps into one session", () => {
    const trips = evening([
      { platformTag: "uber" },
      { platformTag: "deliveroo" },
      { platformTag: "uber" },
      {},
      {},
      { platformTag: "uber" },
    ]);
    const sessions = clusterTripsIntoSessions(trips);
    expect(sessions).toHaveLength(1);
    const s = sessions[0];
    expect(s.key).toBe("t1:t6");
    expect(s.tripIds).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(s.tripCount).toBe(6);
    expect(s.totalMiles).toBe(30);
    expect(s.startedAt.getTime()).toBe(T0);
    expect(s.endedAt.getTime()).toBe(T0 + (5 * 35 + 15) * 60000);
    expect(s.platformTag).toBe("uber");
  });

  it("splits the evening at a 2-hour gap and drops the half that is too short", () => {
    // t1..t3 (16:00 to 17:25) then a 2-hour break, then t4..t6.
    const trips = evening().map((t, i) =>
      i >= 3
        ? {
            ...t,
            startedAt: new Date(t.startedAt.getTime() + 120 * 60000),
            endedAt: new Date(t.endedAt!.getTime() + 120 * 60000),
          }
        : t
    );
    const sessions = clusterTripsIntoSessions(trips);
    // Each half is 3 trips over 85 minutes: enough trips, not enough span.
    expect(sessions).toEqual([]);

    // Pad each half to clear the 90-minute span and both come back separately.
    const longer = trips.map((t, i) =>
      i === 2 || i === 5 ? { ...t, endedAt: new Date(t.endedAt!.getTime() + 10 * 60000) } : t
    );
    const two = clusterTripsIntoSessions(longer);
    expect(two.map((s) => s.key)).toEqual(["t1:t3", "t4:t6"]);
  });

  it("does not offer two trips as a session, however long they span", () => {
    const trips = [trip("a", 0, 60), trip("b", 90, 200)];
    expect(clusterTripsIntoSessions(trips)).toEqual([]);
  });

  it("skips personal trips: they are neither counted nor offered", () => {
    // A personal hop squeezed between t2 and t3 is left out of the session.
    const trips = [...evening(), trip("p", 52, 60, { classification: "personal", distanceMiles: 9 })];
    const sessions = clusterTripsIntoSessions(trips);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tripIds).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(sessions[0].tripCount).toBe(6);
    expect(sessions[0].totalMiles).toBe(30);

    // Six personal trips on their own are not a shift at all.
    const allPersonal = evening().map((t) => ({ ...t, classification: "personal" }));
    expect(clusterTripsIntoSessions(allPersonal)).toEqual([]);
  });

  it("excludes a trip already in a shift and breaks the run at it", () => {
    const trips = evening([{}, {}, {}, { shiftId: "shift-1" }, {}, {}]);
    const sessions = clusterTripsIntoSessions(trips);
    // t1..t3 spans 85 minutes (under 90), t5..t6 is two trips: nothing left.
    expect(sessions).toEqual([]);
    for (const s of sessions) expect(s.tripIds).not.toContain("t4");
  });

  it("never includes a shifted trip even when the rest still qualifies", () => {
    const trips = evening([{}, {}, {}, {}, {}, { shiftId: "shift-1" }]);
    const sessions = clusterTripsIntoSessions(trips);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].key).toBe("t1:t5");
    expect(sessions[0].tripIds).not.toContain("t6");
  });

  it("returns null platformTag when no trip in the session is tagged", () => {
    const sessions = clusterTripsIntoSessions(evening());
    expect(sessions[0].platformTag).toBeNull();
  });

  it("measures the gap from a trip with no end time as if it ended at its start", () => {
    const trips = evening().map((t, i) => (i === 1 ? { ...t, endedAt: null } : t));
    const sessions = clusterTripsIntoSessions(trips);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tripCount).toBe(6);
  });
});
