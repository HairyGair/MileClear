import { afterEach, describe, expect, it } from "vitest";
import {
  calendarDayOf,
  dateForCalendarDay,
  nzLogbookEnd,
  nzLogbookFilename,
  nzLogbookPath,
  showsNzLogbook,
} from "../nzLogbook";

const savedTz = process.env.TZ;
afterEach(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe("NZ logbook download", () => {
  it("only New Zealand drivers see it", () => {
    expect(showsNzLogbook("NZ")).toBe(true);
    for (const c of ["GB", "JE", "AU", "IE", "", "XX"]) expect(showsNzLogbook(c)).toBe(false);
  });

  it("a UK phone during NZ daylight saving asks for the day it picked, not the next day in Auckland", () => {
    process.env.TZ = "Europe/London";
    // 23:30 on 5 Oct in London (BST) is already 11:30 on 6 Oct in Auckland (NZDT).
    const picked = new Date(2026, 9, 5, 23, 30);
    expect(picked.toISOString()).toBe("2026-10-05T22:30:00.000Z");
    expect(calendarDayOf(picked)).toBe("2026-10-05");
    // And the picker shows the same day it was given.
    expect(calendarDayOf(dateForCalendarDay("2026-10-05"))).toBe("2026-10-05");
    expect(dateForCalendarDay("2026-10-05").getDate()).toBe(5);
  });

  it("the same in New Zealand and on a phone far west of it", () => {
    for (const tz of ["Pacific/Auckland", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      expect(calendarDayOf(new Date(2026, 2, 31, 0, 5))).toBe("2026-03-31");
      expect(calendarDayOf(dateForCalendarDay("2026-04-01"))).toBe("2026-04-01");
    }
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
