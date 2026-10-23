import { describe, expect, it } from "vitest";
import {
  addLogbookDays,
  defaultLogbookPeriod,
  logbookDayCount,
  logbookRow,
  logbookTotals,
  nzDate,
  nzToday,
  resolveLogbookPeriod,
  type LogbookTripInput,
} from "./logbook.js";

const trip = (over: Partial<LogbookTripInput> = {}): LogbookTripInput => ({
  startedAt: new Date("2026-06-01T20:30:00Z"), // 08:30 on 2 June in Auckland (NZST, UTC+12)
  startAddress: "Queen St, Auckland",
  endAddress: "Ponsonby Rd, Auckland",
  distanceMiles: 10,
  classification: "business",
  platformTag: null,
  projectLabel: null,
  notes: null,
  ...over,
});

describe("logbook period", () => {
  const now = new Date("2026-10-23T03:00:00Z"); // 16:00 on 23 Oct in Auckland

  it("counts both ends", () => {
    expect(logbookDayCount("2026-01-01", "2026-03-31")).toBe(90);
    expect(addLogbookDays("2026-01-01", 89)).toBe("2026-03-31");
  });

  it("today follows New Zealand, not UTC", () => {
    // 11:30 UTC on 22 Oct is 00:30 on 23 Oct in Auckland (NZDT, UTC+13).
    expect(nzToday(new Date("2026-10-22T11:30:00Z"))).toBe("2026-10-23");
  });

  it("defaults to the last 90 complete days", () => {
    const p = defaultLogbookPeriod(now);
    expect(p.to).toBe("2026-10-22");
    expect(logbookDayCount(p.from, p.to)).toBe(90);
  });

  it("a missing end is 90 days from the start", () => {
    expect(resolveLogbookPeriod("2026-06-01", undefined, now)).toEqual({ ok: true, from: "2026-06-01", to: "2026-08-29", days: 90 });
  });

  it("refuses fewer than 90 days, saying how many", () => {
    const r = resolveLogbookPeriod("2026-06-01", "2026-08-28", now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least 90 days.*89 days/);
  });

  it("allows longer, up to a year", () => {
    expect(resolveLogbookPeriod("2025-10-22", "2026-10-22", now).ok).toBe(true);
    expect(resolveLogbookPeriod("2025-01-01", "2026-10-22", now).ok).toBe(false);
  });

  it("refuses an end after today in New Zealand", () => {
    const r = resolveLogbookPeriod("2026-07-26", undefined, now); // ends 23 Oct... today
    expect(r.ok).toBe(true);
    expect(resolveLogbookPeriod("2026-07-27", undefined, now).ok).toBe(false);
  });

  it("refuses dates that don't exist or are badly written", () => {
    expect(resolveLogbookPeriod("2026-02-30", undefined, now).ok).toBe(false);
    expect(resolveLogbookPeriod("1/6/2026", undefined, now).ok).toBe(false);
    expect(resolveLogbookPeriod(undefined, undefined, now).ok).toBe(false);
    expect(resolveLogbookPeriod("2026-06-01", "2026-13-01", now).ok).toBe(false);
  });
});

describe("logbook rows", () => {
  it("dates and times are New Zealand's, distance in km to 1 dp", () => {
    const r = logbookRow(trip());
    expect(r.date).toBe("2026-06-02");
    expect(r.time).toBe("08:30");
    expect(r.km).toBe(16.1);
    expect(r.use).toBe("Business");
    expect(nzDate(r.date)).toBe("02/06/2026");
  });

  it("the reason joins platform, client and notes", () => {
    expect(logbookRow(trip({ platformTag: "uber", projectLabel: " Acme ", notes: "Pick up\n parts" })).reason).toBe(
      "Uber / Uber Eats · Acme · Pick up parts"
    );
    expect(logbookRow(trip()).reason).toBe("");
  });

  it("personal is Private, anything else Not sorted", () => {
    expect(logbookRow(trip({ classification: "personal" })).use).toBe("Private");
    expect(logbookRow(trip({ classification: "unclassified" })).use).toBe("Not sorted");
  });
});

describe("logbook totals", () => {
  it("business share of all km, not sorted counted in the total", () => {
    const t = logbookTotals([
      trip({ distanceMiles: 30, notes: "Client visit" }),
      trip({ distanceMiles: 60, classification: "personal" }),
      trip({ distanceMiles: 10, classification: "unclassified" }),
    ]);
    expect(t.trips).toBe(3);
    expect(t.totalKm).toBe(160.9);
    expect(t.businessKm).toBe(48.3);
    expect(t.privateKm).toBe(96.6);
    expect(t.notSortedKm).toBe(16.1);
    expect(t.notSortedTrips).toBe(1);
    expect(t.businessPercent).toBe(30);
    expect(t.businessWithoutReason).toBe(0);
  });

  it("counts business trips with no reason, and no driving gives no percentage", () => {
    expect(logbookTotals([trip()]).businessWithoutReason).toBe(1);
    expect(logbookTotals([]).businessPercent).toBeNull();
  });
});
