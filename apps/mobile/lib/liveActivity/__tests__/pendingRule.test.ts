import { describe, it, expect } from "vitest";
import {
  decidePendingDecision,
  parsePendingDecision,
  PENDING_DECISION_MAX_AGE_MS,
} from "../pendingRule";

const NOW = 1_800_000_000_000;
const trip = { id: "t1", classification: "unclassified", endedAtMs: NOW - 60_000 };

describe("parsePendingDecision", () => {
  it("reads what the widget wrote", () => {
    expect(parsePendingDecision({ kind: "classified", classification: "business", atMs: NOW })).toEqual({
      kind: "classified",
      classification: "business",
      atMs: NOW,
    });
    expect(parsePendingDecision({ kind: "not_driving", atMs: NOW })).toEqual({ kind: "not_driving", atMs: NOW });
  });

  it("rejects anything malformed rather than guessing", () => {
    expect(parsePendingDecision(null)).toBeNull();
    expect(parsePendingDecision({ kind: "classified", atMs: NOW })).toBeNull();
    expect(parsePendingDecision({ kind: "classified", classification: "work", atMs: NOW })).toBeNull();
    expect(parsePendingDecision({ kind: "not_driving" })).toBeNull();
  });
});

describe("decidePendingDecision", () => {
  it("does nothing when nothing is pending", () => {
    expect(decidePendingDecision({ decision: null, nowMs: NOW, recordingActive: true, newestTrip: trip })).toEqual({
      action: "none",
    });
  });

  it("classifies the newest unclassified trip", () => {
    expect(
      decidePendingDecision({
        decision: { kind: "classified", classification: "personal", atMs: NOW },
        nowMs: NOW + 5_000,
        recordingActive: false,
        newestTrip: trip,
      })
    ).toEqual({ action: "classify", tripId: "t1", classification: "personal" });
  });

  it("never overwrites a classification made in the app", () => {
    expect(
      decidePendingDecision({
        decision: { kind: "classified", classification: "personal", atMs: NOW },
        nowMs: NOW,
        recordingActive: false,
        newestTrip: { ...trip, classification: "business" },
      })
    ).toEqual({ action: "clear", reason: "already_classified" });
  });

  it("drops a tap once a newer trip has finished after it", () => {
    expect(
      decidePendingDecision({
        decision: { kind: "classified", classification: "business", atMs: NOW },
        nowMs: NOW + 3_600_000,
        recordingActive: false,
        newestTrip: { ...trip, endedAtMs: NOW + 1_800_000 },
      })
    ).toEqual({ action: "clear", reason: "superseded" });
  });

  it("drops a tap with no trip to apply it to", () => {
    expect(
      decidePendingDecision({
        decision: { kind: "classified", classification: "business", atMs: NOW },
        nowMs: NOW,
        recordingActive: false,
        newestTrip: null,
      })
    ).toEqual({ action: "clear", reason: "no_trip" });
  });

  it("ignores a tap that is half a day old", () => {
    expect(
      decidePendingDecision({
        decision: { kind: "classified", classification: "business", atMs: NOW - PENDING_DECISION_MAX_AGE_MS - 1 },
        nowMs: NOW,
        recordingActive: false,
        newestTrip: trip,
      })
    ).toEqual({ action: "clear", reason: "stale" });
  });

  it("cancels the recording on Not Driving while one is open", () => {
    expect(
      decidePendingDecision({
        decision: { kind: "not_driving", atMs: NOW },
        nowMs: NOW + 10_000,
        recordingActive: true,
        newestTrip: trip,
      })
    ).toEqual({ action: "cancel_recording" });
  });

  it("clears Not Driving when the recorder has already finished", () => {
    expect(
      decidePendingDecision({
        decision: { kind: "not_driving", atMs: NOW },
        nowMs: NOW + 10_000,
        recordingActive: false,
        newestTrip: trip,
      })
    ).toEqual({ action: "clear", reason: "no_recording" });
  });
});
