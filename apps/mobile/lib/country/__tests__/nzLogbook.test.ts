import { describe, expect, it } from "vitest";
import {
  dateForNzDay,
  nzDayOf,
  nzLogbookEnd,
  nzLogbookFilename,
  nzLogbookPath,
  showsNzLogbook,
} from "../nzLogbook";

describe("NZ logbook download", () => {
  it("only New Zealand drivers see it", () => {
    expect(showsNzLogbook("NZ")).toBe(true);
    for (const c of ["GB", "JE", "AU", "IE", "", "XX"]) expect(showsNzLogbook(c)).toBe(false);
  });

  it("days are New Zealand's, whatever the instant", () => {
    // 11:30 UTC on 22 Oct is 00:30 on 23 Oct in Auckland.
    expect(nzDayOf(new Date("2026-10-22T11:30:00Z"))).toBe("2026-10-23");
    expect(nzDayOf(dateForNzDay("2026-06-01"))).toBe("2026-06-01");
    expect(nzDayOf(dateForNzDay("2026-12-31"))).toBe("2026-12-31");
  });

  it("asks for exactly 90 days from the start", () => {
    expect(nzLogbookEnd("2026-06-01")).toBe("2026-08-29");
    expect(nzLogbookPath("pdf", { from: "2026-06-01", vehicleId: "v 1" })).toBe(
      "/exports/logbook-pdf?from=2026-06-01&to=2026-08-29&vehicleId=v+1"
    );
    expect(nzLogbookPath("csv", { from: "2026-06-01" })).toBe("/exports/logbook-csv?from=2026-06-01&to=2026-08-29");
    expect(nzLogbookFilename("csv", "2026-06-01")).toBe("mileclear-logbook-2026-06-01-to-2026-08-29.csv");
  });
});
