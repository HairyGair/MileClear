import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_META } from "@mileclear/shared";
import { badgeSpokenLabel } from "../badges";

describe("badgeSpokenLabel", () => {
  it("keeps a description's own ! or ? ending", () => {
    expect(badgeSpokenLabel("Ignition", "You turned the key. First trip logged!", true)).toBe(
      "Ignition: You turned the key. First trip logged! Earned"
    );
    expect(badgeSpokenLabel("Year-Round Legend", "365 days straight?! You absolute machine", false)).toBe(
      "Year-Round Legend: 365 days straight?! You absolute machine. Not yet earned"
    );
  });
  it("never says '!.' for any badge", () => {
    for (const meta of Object.values(ACHIEVEMENT_META)) {
      expect(badgeSpokenLabel(meta.label, meta.description, false)).not.toMatch(/[!?]\./);
    }
  });
});

describe("badge descriptions", () => {
  it("have no em or en dashes", () => {
    for (const meta of Object.values(ACHIEVEMENT_META)) {
      expect(meta.description).not.toMatch(/[—–]/);
    }
  });
  it("Hundred Grand does not claim 100,000 miles reaches the Moon", () => {
    // The Moon is about 239,000 miles away; 100,000 miles is about four laps of the Earth.
    expect(ACHIEVEMENT_META.miles_100000.description).not.toMatch(/Moon/);
  });
});
