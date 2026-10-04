import { describe, it, expect } from "vitest";
import { mergePlannerSettings, parsePlannerSettings } from "../../services/taxPlanner.js";

describe("parsePlannerSettings", () => {
  it("reads null as nothing entered", () => {
    expect(parsePlannerSettings(null)).toEqual({ firstSelfEmployedTaxYear: null, bills: {} });
  });

  it("drops anything malformed", () => {
    expect(
      parsePlannerSettings({
        firstSelfEmployedTaxYear: "last year",
        bills: { "2025-26": 123_400, "2024-25": -5, nonsense: 1, "2023-24": 1.5 },
      })
    ).toEqual({ firstSelfEmployedTaxYear: null, bills: { "2025-26": 123_400 } });
  });
});

describe("mergePlannerSettings", () => {
  it("adds, replaces and clears bills, keeping only the three planner years", () => {
    const merged = mergePlannerSettings(
      { firstSelfEmployedTaxYear: "earlier", bills: { "2023-24": 1, "2025-26": 100_000 } },
      { bills: { "2025-26": null, "2024-25": 250_000, "2019-20": 9 } },
      "2026-27"
    );
    expect(merged).toEqual({ firstSelfEmployedTaxYear: "earlier", bills: { "2024-25": 250_000 } });
  });

  it("a start year before the year before last becomes earlier", () => {
    expect(mergePlannerSettings({ firstSelfEmployedTaxYear: null, bills: {} }, { firstSelfEmployedTaxYear: "2020-21" }, "2026-27").firstSelfEmployedTaxYear).toBe("earlier");
    expect(mergePlannerSettings({ firstSelfEmployedTaxYear: null, bills: {} }, { firstSelfEmployedTaxYear: "2026-27" }, "2026-27").firstSelfEmployedTaxYear).toBe("2026-27");
  });
});
