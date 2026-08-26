/**
 * How long stopped before a journey counts as over.
 *
 * Rachel Thorndyke (freelance animal care, 13 Aug 2026) had three separate
 * journeys recorded as one long trip. The splitter only broke a recording where
 * a stop exceeded 30 minutes, and she stops for 5 minutes to 3 hours across 1-20
 * visits a day. She asked for it to be settable, and identified the tension
 * herself: it cannot go very low, or a city driver in traffic has their journey
 * ended underneath them.
 *
 * The default is unchanged at 30 minutes, so nobody who never opens the setting
 * sees a behaviour change.
 */
import { describe, it, expect } from "vitest";
import { resolveJourneyEndMinutes, journeyBoundaryMs } from "../journeyBoundary";

describe("resolveJourneyEndMinutes", () => {
  it("defaults to the previous fixed behaviour when unset", () => {
    expect(resolveJourneyEndMinutes(null)).toBe(30);
    expect(resolveJourneyEndMinutes(undefined)).toBe(30);
    expect(resolveJourneyEndMinutes("")).toBe(30);
  });

  it("survives a corrupt stored value rather than producing NaN", () => {
    // A NaN boundary would compare false against every gap and silently stop
    // splitting altogether.
    expect(resolveJourneyEndMinutes("banana")).toBe(30);
    expect(resolveJourneyEndMinutes(NaN)).toBe(30);
  });

  it("accepts what a visiting professional actually needs", () => {
    expect(resolveJourneyEndMinutes(5)).toBe(5);
    expect(resolveJourneyEndMinutes("10")).toBe(10);
    expect(resolveJourneyEndMinutes(45)).toBe(45);
  });

  it("floors at 5 minutes so traffic cannot end a journey", () => {
    expect(resolveJourneyEndMinutes(1)).toBe(5);
    expect(resolveJourneyEndMinutes(0)).toBe(5);
    expect(resolveJourneyEndMinutes(-20)).toBe(5);
  });

  it("caps at 3 hours", () => {
    expect(resolveJourneyEndMinutes(600)).toBe(180);
  });
});

describe("journeyBoundaryMs", () => {
  it("splits on gaps longer than the chosen boundary", () => {
    expect(journeyBoundaryMs(30).splitMs).toBe(30 * 60 * 1000);
    expect(journeyBoundaryMs(5).splitMs).toBe(5 * 60 * 1000);
  });

  it("stops the merge re-gluing what the split just separated", () => {
    // At 5 minutes the 15-minute merge window would swallow a 6-minute stop and
    // undo the split on the way back out.
    expect(journeyBoundaryMs(5).mergeMs).toBe(5 * 60 * 1000);
    expect(journeyBoundaryMs(10).mergeMs).toBe(10 * 60 * 1000);
  });

  it("leaves merging at its own window once the boundary is wider", () => {
    // A longer boundary means "don't split me", not "glue distant trips
    // together", so merging keeps its 15 minutes.
    expect(journeyBoundaryMs(30).mergeMs).toBe(15 * 60 * 1000);
    expect(journeyBoundaryMs(180).mergeMs).toBe(15 * 60 * 1000);
  });

  it("separates Rachel's real day at 10 minutes and not at the old 30", () => {
    const gaps = [37.5, 5, 8, 15, 5, 28].map((m) => m * 60 * 1000);
    const atOldDefault = gaps.filter((g) => g > journeyBoundaryMs(30).splitMs).length;
    const atTen = gaps.filter((g) => g > journeyBoundaryMs(10).splitMs).length;
    expect(atOldDefault).toBe(1); // only the 37.5-minute stop, hence one merged trip
    expect(atTen).toBe(3); // 37.5, 15 and 28 - her three real journeys
  });
});
