import { test, expect } from "@playwright/test";
import { presetRange, recentTaxYears, taxYearRange } from "../src/lib/dashboard/periods";
import { formatDay } from "../src/lib/dashboard/dates";
import { proReasonTitle, planHref } from "../src/lib/dashboard/proReasons";
import { activeNavKey } from "../src/components/dashboard/shell/nav";

// Pure logic, no browser needed.
test("tax years run 6 April to 5 April and list the current plus 3 before", () => {
  expect(taxYearRange("2026-27")).toEqual({ from: "2026-04-06", to: "2027-04-05" });
  expect(recentTaxYears(new Date(2026, 9, 9))).toEqual(["2026-27", "2025-26", "2024-25", "2023-24"]);
  expect(recentTaxYears(new Date(2026, 2, 1))[0]).toBe("2025-26");
});

test("period presets", () => {
  const now = new Date(2026, 9, 9); // Fri 9 Oct 2026
  expect(presetRange("thisWeek", now)).toEqual({ from: "2026-10-05", to: "2026-10-09" });
  expect(presetRange("thisMonth", now)).toEqual({ from: "2026-10-01", to: "2026-10-09" });
  expect(presetRange("lastMonth", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  expect(presetRange("thisTaxYear", now)).toEqual({ from: "2026-04-06", to: "2026-10-09" });
  expect(presetRange("lastTaxYear", now)).toEqual({ from: "2025-04-06", to: "2026-04-05" });
});

test("day format is 'Thu 9 Oct' this year and carries the year otherwise", () => {
  const now = new Date(2026, 9, 9);
  expect(formatDay(new Date(2026, 9, 8), now)).toBe("Thu 8 Oct");
  expect(formatDay(new Date(2025, 9, 9), now)).toBe("Thu 9 Oct 2025");
});

test("pro reasons fall back to MileClear Pro", () => {
  expect(proReasonTitle("exports")).toBe("Download your records");
  expect(proReasonTitle("nope")).toBe("MileClear Pro");
  expect(planHref("sa_pdf")).toBe("/dashboard/settings/plan?reason=sa_pdf");
});

test("More is highlighted for pages reached from it", () => {
  expect(activeNavKey("/dashboard", "work")).toBe("home");
  expect(activeNavKey("/dashboard/trips/abc/edit", "work")).toBe("trips");
  expect(activeNavKey("/dashboard/tax/exports", "work")).toBe("slot3");
  expect(activeNavKey("/dashboard/insights", "work")).toBe("more");
  expect(activeNavKey("/dashboard/tax", "personal")).toBe("more");
  expect(activeNavKey("/dashboard/insights", "personal")).toBe("slot3");
  expect(activeNavKey("/dashboard/vehicles", "work")).toBe("more");
});
