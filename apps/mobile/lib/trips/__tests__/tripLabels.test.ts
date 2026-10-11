import { describe, expect, it } from "vitest";
import {
  createdInBatchIds,
  dayMilesText,
  distanceWarning,
  isSavedLater,
  isSplitLeg,
  suggestionLine,
  tripMadeLine,
  tripTag,
  type LabelTrip,
} from "../tripLabels";

const NOW = new Date("2026-10-11T12:00:00Z").getTime();

function trip(over: Partial<LabelTrip> = {}): LabelTrip {
  return {
    isManualEntry: false,
    classification: "business",
    startedAt: "2026-10-11T08:00:00Z",
    endedAt: "2026-10-11T08:30:00Z",
    createdAt: "2026-10-11T08:31:00Z",
    autoClassifiedAt: null,
    ...over,
  };
}

describe("tripTag", () => {
  it("says nothing for an ordinary recorded trip", () => {
    expect(tripTag(trip(), { now: NOW })).toBeNull();
  });

  it("names a trip added by hand", () => {
    expect(tripTag(trip({ isManualEntry: true, createdAt: "2026-10-11T20:00:00Z" }), { now: NOW })?.text).toBe("Added by you");
  });

  it("reads a save over 30 min after the drive as saved later, but doesn't show it yet (T-F)", () => {
    expect(isSavedLater(trip({ createdAt: "2026-10-11T09:01:00Z" }))).toBe(true);
    expect(isSavedLater(trip({ createdAt: "2026-10-11T08:59:00Z" }))).toBe(false);
    expect(isSavedLater(trip({ createdAt: "2026-10-11T15:00:00Z" }), true)).toBe(false);
    expect(tripTag(trip({ createdAt: "2026-10-11T09:01:00Z" }), { now: NOW })).toBeNull();
  });

  it("does not say saved later for a trip saved with others (a split)", () => {
    expect(tripTag(trip({ createdAt: "2026-10-11T15:00:00Z" }), { now: NOW, createdInBatch: true })).toBeNull();
  });

  it("puts upload trouble first", () => {
    expect(tripTag(trip({ isManualEntry: true }), { local: true, uploadFailed: true, now: NOW })?.kind).toBe("upload_failed");
    expect(tripTag(trip({ isManualEntry: true }), { local: true, now: NOW })?.text).toBe("Waiting to upload");
  });

  it("shows Sorted for you for a week after a quiet sort", () => {
    const sorted = trip({ autoClassifiedAt: "2026-10-08T08:31:00Z" });
    expect(tripTag(sorted, { now: NOW })?.kind).toBe("auto_sorted");
    expect(tripTag(trip({ autoClassifiedAt: "2026-09-30T08:31:00Z" }), { now: NOW })).toBeNull();
    expect(tripTag({ ...sorted, classification: "unclassified" }, { now: NOW })).toBeNull();
  });

  it("never says saved later without the server's save time", () => {
    expect(isSavedLater(trip({ createdAt: undefined }))).toBe(false);
    expect(isSavedLater(trip({ createdAt: "not a date" }))).toBe(false);
  });
});

describe("createdInBatchIds", () => {
  it("finds trips saved within seconds of each other", () => {
    const ids = createdInBatchIds([
      { id: "a", createdAt: "2026-10-11T10:00:00.100Z" },
      { id: "b", createdAt: "2026-10-11T10:00:00.300Z" },
      { id: "c", createdAt: "2026-10-11T11:00:00Z" },
      { id: "d" },
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});

describe("tripMadeLine", () => {
  it("ticks only a recorded trip that is saved to the account", () => {
    expect(tripMadeLine(trip(), { waitingToUpload: false })).toEqual({
      text: "Recorded by MileClear · saved to your account",
      done: true,
    });
    expect(tripMadeLine(trip(), { waitingToUpload: true }).done).toBe(false);
    expect(tripMadeLine(trip({ isManualEntry: true }), { waitingToUpload: false }).text).toMatch(/^Added by you/);
  });

  it("says a split leg is part of a longer drive, not saved later", () => {
    const leg = trip({ createdAt: "2026-10-11T18:00:00Z" });
    expect(tripMadeLine(leg, { waitingToUpload: false, splitLeg: true }).text).toBe("Part of a longer drive you split");
    expect(tripMadeLine(leg, { waitingToUpload: false }).text).toBe("Recorded by MileClear · saved to your account");
  });
});

describe("isSplitLeg", () => {
  it("reads the split marker the server keeps", () => {
    expect(isSplitLeg({ splitFromTripId: "abc" })).toBe(true);
    expect(isSplitLeg({ rawCoords: 3 })).toBe(false);
    expect(isSplitLeg(null)).toBe(false);
    expect(isSplitLeg(["x"])).toBe(false);
  });
});

describe("distanceWarning", () => {
  it("says nothing unless we are unsure (low)", () => {
    expect(distanceWarning("high", [])).toBeNull();
    expect(distanceWarning("medium", ["No road-network match — using raw GPS trail."])).toBeNull();
    expect(distanceWarning(null)).toBeNull();
  });

  it("turns the server's reasons into plain words", () => {
    expect(distanceWarning("low", ["No GPS samples captured."])?.body).toBe("Your phone sent no route for this drive.");
    expect(distanceWarning("low", ["No end location — distance can't be verified."])?.body).toBe(
      "We don't know where this drive ended."
    );
    expect(distanceWarning("low", ["Only 4 GPS samples — sparse trail."])?.body).toBe(
      "Your phone sent only a few points for this drive."
    );
    expect(distanceWarning("low", ["Average speed 2.1 mph is below driving range."])?.body).toBe(
      "The speed looks wrong for a drive."
    );
    expect(distanceWarning("low", [])?.title).toBe("The distance may be off");
  });

  it("never uses the word confidence", () => {
    const w = distanceWarning("low", ["No GPS samples captured."]);
    expect(`${w?.title} ${w?.body}`).not.toMatch(/confidence|GPS/i);
  });
});

describe("suggestionLine", () => {
  it("says what earlier trips here were", () => {
    expect(suggestionLine({ classification: "business", matchCount: 3 })).toBe(
      "Looks like Business: 3 earlier trips here were"
    );
    expect(suggestionLine({ classification: "personal", matchCount: 1 })).toBe(
      "Looks like Personal: 1 earlier trip here was"
    );
    expect(suggestionLine({ classification: "unclassified", matchCount: 2 })).toBeNull();
    expect(suggestionLine(null)).toBeNull();
  });
});

describe("dayMilesText", () => {
  it("adds the day's miles to one decimal place", () => {
    expect(dayMilesText([{ distanceMiles: 12.44 }, { distanceMiles: 2.9 }])).toBe("15.3\u00a0mi");
    expect(dayMilesText([])).toBe("0.0\u00a0mi");
  });
});

describe("labels from the trip facts (T-F)", () => {
  it("Part 1 of 2 on a numbered split leg", () => {
    const leg = trip({ splitFromTripId: "p", splitPart: 1, splitPartCount: 2, recordedBy: "automatic" });
    expect(tripTag(leg, { now: NOW })).toMatchObject({ kind: "split", text: "Part 1 of 2" });
    expect(tripMadeLine(leg, { waitingToUpload: false })).toEqual({ text: "Part 1 of 2 of a longer drive", done: false });
  });

  it("Joined from N trips on a join", () => {
    const joined = trip({ joinedCount: 3, recordedBy: "automatic" });
    expect(tripTag(joined, { now: NOW })).toMatchObject({ kind: "joined", text: "Joined from 3 trips" });
    expect(tripMadeLine(joined, { waitingToUpload: false }).text).toBe("Joined from 3 trips");
  });

  it("Started with Start Trip", () => {
    const st = trip({ recordedBy: "start_trip" });
    expect(tripTag(st, { now: NOW })).toMatchObject({ kind: "start_trip", text: "Started with Start Trip" });
    expect(tripMadeLine(st, { waitingToUpload: false })).toEqual({
      text: "Recorded with Start Trip · saved to your account",
      done: false,
    });
  });

  it("an automatic trip saved on time says nothing in the list and ticks on the trip screen", () => {
    const auto = trip({ recordedBy: "automatic" });
    expect(tripTag(auto, { now: NOW })).toBeNull();
    expect(tripMadeLine(auto, { waitingToUpload: false })).toEqual({
      text: "Recorded automatically · saved to your account",
      done: true,
    });
  });

  it("Saved later only for a late automatic trip that was neither split nor joined", () => {
    const late = { createdAt: "2026-10-11T09:01:00Z" };
    expect(tripTag(trip({ ...late, recordedBy: "automatic" }), { now: NOW })).toMatchObject({
      kind: "saved_later",
      text: "Saved later, when your phone woke up",
    });
    expect(tripMadeLine(trip({ ...late, recordedBy: "automatic" }), { waitingToUpload: false })).toEqual({
      text: "Saved later, when your phone woke up",
      done: false,
    });
    // Exactly 30 minutes is not later.
    expect(tripTag(trip({ createdAt: "2026-10-11T09:00:00Z", recordedBy: "automatic" }), { now: NOW })).toBeNull();
    // Not for Start Trip, a shift or a trip without the facts.
    expect(tripTag(trip({ ...late, recordedBy: "start_trip" }), { now: NOW })?.kind).toBe("start_trip");
    expect(tripTag(trip({ ...late, recordedBy: "shift" }), { now: NOW })).toBeNull();
    expect(tripTag(trip({ ...late, recordedBy: null }), { now: NOW })).toBeNull();
    // A split leg or a join is saved when it was split or joined.
    expect(tripTag(trip({ ...late, recordedBy: "automatic", splitFromTripId: "p", splitPart: 2, splitPartCount: 2 }), { now: NOW })?.kind).toBe("split");
    expect(tripTag(trip({ ...late, recordedBy: "automatic", joinedCount: 2 }), { now: NOW })?.kind).toBe("joined");
    // Still never for a trip saved alongside others on screen.
    expect(tripTag(trip({ ...late, recordedBy: "automatic" }), { now: NOW, createdInBatch: true })).toBeNull();
  });

  it("keeps the existing order: upload trouble, sorted for you and added by you come first", () => {
    const leg = trip({ splitFromTripId: "p", splitPart: 1, splitPartCount: 2, autoClassifiedAt: "2026-10-10T08:31:00Z" });
    expect(tripTag(leg, { now: NOW })?.kind).toBe("auto_sorted");
    expect(tripTag(leg, { now: NOW, local: true })?.kind).toBe("waiting");
    const missing = trip({ isManualEntry: true, recordedBy: "missing_report" });
    expect(tripTag(missing, { now: NOW })?.text).toBe("Added by you");
  });

  it("an older leg the server didn't number still says it was split", () => {
    expect(tripMadeLine(trip({ splitFromTripId: "p" }), { waitingToUpload: false }).text).toBe("Part of a longer drive you split");
    expect(tripTag(trip({ splitFromTripId: "p" }), { now: NOW })).toBeNull();
  });
});
