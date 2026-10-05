/**
 * Project / client in the trip exports (5 Oct 2026): a CSV column, and a
 * "Business miles by project" table at the end of the PDF trip report when at
 * least one business trip has a project. Synthetic data only.
 */
import { describe, it, expect, vi } from "vitest";
import type { ExportTripRow } from "@mileclear/shared";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../services/export-data.js", () => ({
  fetchExportTrips: vi.fn(),
  fetchExportSummary: vi.fn(),
}));

import { tripsToCsv, projectSummaryFromRows, generateTripsPdf } from "../../services/export.js";
import { fetchExportTrips } from "../../services/export-data.js";

function row(over: Partial<ExportTripRow>): ExportTripRow {
  return {
    date: "01/05/2026",
    startTime: "09:00",
    endTime: "09:30",
    startAddress: "Somewhere",
    endAddress: "Elsewhere",
    distanceMiles: 10,
    classification: "business",
    platform: null,
    businessPurpose: null,
    projectLabel: null,
    vehicleType: "car",
    vehicleName: "Test Car",
    hmrcRatePence: 55,
    deductionPence: 550,
    ...over,
  };
}

describe("tripsToCsv", () => {
  it("adds a Project / client column after Business Purpose", () => {
    const csv = tripsToCsv([row({ projectLabel: "Client A", businessPurpose: "Visit" })]);
    const [header, line] = csv.split("\r\n");
    const cols = header.split(",");
    const i = cols.indexOf("Project / client");
    expect(i).toBe(cols.indexOf("Business Purpose") + 1);
    expect(line.split(",")[i]).toBe("Client A");
    expect(cols).toHaveLength(line.split(",").length);
  });

  it("keeps a project label injection-safe", () => {
    const csv = tripsToCsv([row({ projectLabel: "=HYPERLINK(1)" })]);
    expect(csv).toContain("'=HYPERLINK(1)");
  });

  it("leaves the cell empty when there is no project", () => {
    const csv = tripsToCsv([row({})]);
    expect(csv.split("\r\n")[1]).toContain(",Test Car,");
  });
});

describe("projectSummaryFromRows", () => {
  it("is empty when no business trip has a project", () => {
    expect(projectSummaryFromRows([row({}), row({ classification: "personal", projectLabel: "X" })])).toEqual([]);
  });

  it("groups case-insensitively, sums the Deduction column, No project last", () => {
    const out = projectSummaryFromRows([
      row({ projectLabel: "Client A", deductionPence: 550 }),
      row({ projectLabel: "client a ", deductionPence: 550 }),
      row({ projectLabel: "Client A", deductionPence: 250 }),
      row({ projectLabel: null, distanceMiles: 50, deductionPence: 2750 }),
      row({ projectLabel: "Client B", distanceMiles: 2, deductionPence: 110 }),
      row({ classification: "personal", projectLabel: "Client A", deductionPence: 0 }),
    ]);
    expect(out).toEqual([
      { label: "Client A", trips: 3, miles: 30, deductionPence: 1350 },
      { label: "Client B", trips: 1, miles: 2, deductionPence: 110 },
      { label: "No project", trips: 1, miles: 50, deductionPence: 2750 },
    ]);
  });
});

describe("generateTripsPdf", () => {
  it("renders with and without projects", async () => {
    vi.mocked(fetchExportTrips).mockResolvedValueOnce([row({ projectLabel: "Client A" }), row({})]);
    const withProjects = await generateTripsPdf("00000000-0000-0000-0000-000000000088", { taxYear: "2026-27" });
    expect(withProjects.subarray(0, 4).toString()).toBe("%PDF");

    vi.mocked(fetchExportTrips).mockResolvedValueOnce([row({})]);
    const without = await generateTripsPdf("00000000-0000-0000-0000-000000000088", { taxYear: "2026-27" });
    expect(without.subarray(0, 4).toString()).toBe("%PDF");
    expect(withProjects.length).toBeGreaterThan(without.length);
  });

  it("puts the project table on a new page when the trip table fills the page", async () => {
    const many = Array.from({ length: 27 }, (_, i) => row({ projectLabel: i % 2 ? "Client A" : "Client B" }));
    vi.mocked(fetchExportTrips).mockResolvedValueOnce(many);
    const pdf = await generateTripsPdf("00000000-0000-0000-0000-000000000088", { taxYear: "2026-27" });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
