import { describe, it, expect } from "vitest";
import { missedPlaceLabel, placeKey, UNNAMED_PLACE } from "../placeLabel";

describe("missedPlaceLabel", () => {
  const home = [{ name: "Home", lat: 50.492, lng: -4.086, radiusMeters: 150 }];

  it("prefers a saved place", () => {
    expect(missedPlaceLabel(null, 50.492, -4.086, home, "1, Other Rd")).toBe("Home");
  });
  it("uses the server address, dropping the house number", () => {
    expect(missedPlaceLabel("12, Fore Street, Liskeard", 50.5, -4.3)).toBe("Fore Street");
  });
  it("uses a phone lookup when the server sent nothing", () => {
    expect(missedPlaceLabel(null, 50.5, -4.3, [], "9, Church Lane, Callington, PL17 7AA")).toBe("Church Lane");
  });
  it("never returns coordinates", () => {
    expect(missedPlaceLabel(null, 50.503, -4.319)).toBe(UNNAMED_PLACE);
    expect(missedPlaceLabel("  ", 50.503, -4.319, [], "")).toBe(UNNAMED_PLACE);
    expect(missedPlaceLabel("PL14 3AA", 50.5, -4.3)).toBe("PL14 3AA");
  });
  it("keys nearby points the same", () => {
    expect(placeKey(50.4921, -4.0861)).toBe(placeKey(50.4924, -4.0864));
  });
});
