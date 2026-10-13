import { describe, it, expect, vi } from "vitest";

vi.mock("expo-router", () => ({ useFocusEffect: () => {} }));

import { parseNewestTripFirst } from "../orderPref";

describe("parseNewestTripFirst", () => {
  it("is off unless stored as 1", () => {
    expect(parseNewestTripFirst(undefined)).toBe(false);
    expect(parseNewestTripFirst(null)).toBe(false);
    expect(parseNewestTripFirst("0")).toBe(false);
    expect(parseNewestTripFirst("garbage")).toBe(false);
    expect(parseNewestTripFirst("1")).toBe(true);
  });
});
