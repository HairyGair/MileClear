import { describe, it, expect } from "vitest";
import { insightsVisibility, tripsToSort } from "../visibility";

describe("insights visibility", () => {
  it("no trips ever shows only the empty state", () => {
    const v = insightsVisibility(0);
    expect(v.onlyEmptyState).toBe(true);
    expect(v.showGoDeeper).toBe(false);
  });
  it("under 10 trips hides Drivers near you, Go deeper and records", () => {
    const v = insightsVisibility(9);
    expect(v).toMatchObject({ onlyEmptyState: false, showDriversNearYou: false, showGoDeeper: false, showRecords: false });
  });
  it("10 trips shows everything", () => {
    const v = insightsVisibility(10);
    expect(v).toMatchObject({ showDriversNearYou: true, showGoDeeper: true, showRecords: true });
  });
  it("unknown count never shows the empty state", () => {
    expect(insightsVisibility(null).onlyEmptyState).toBe(false);
  });
});

describe("trips to sort", () => {
  it("shows in Work mode for any driver with unsorted trips", () => {
    expect(tripsToSort(true, 4)).toBe(4);
  });
  it("is hidden in Personal mode or with none", () => {
    expect(tripsToSort(false, 4)).toBe(0);
    expect(tripsToSort(true, 0)).toBe(0);
    expect(tripsToSort(true, undefined)).toBe(0);
  });
});
