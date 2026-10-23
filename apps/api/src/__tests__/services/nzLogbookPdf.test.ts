/**
 * The NZ logbook PDF and CSV builders on their own (23 Oct 2026): a long
 * logbook runs onto more pages without blank ones, and the odometer lines
 * are left to be written in. Synthetic data only.
 */
import { describe, it, expect } from "vitest";
import { inflateSync } from "zlib";
import { logbookRow, logbookTotals, type LogbookTripInput } from "@mileclear/shared";
import { logbookClaimLine, logbookFonts, nzLogbookCsv, nzLogbookPdf, pdfText, type NzLogbook } from "../../services/nzLogbook.js";

function book(n: number): NzLogbook {
  const trips: LogbookTripInput[] = Array.from({ length: n }, (_, i) => ({
    startedAt: new Date(Date.UTC(2026, 5, 1 + (i % 90), 20, 0)),
    startAddress: `${i} Queen St, Auckland`,
    endAddress: "Ponsonby Rd, Auckland",
    distanceMiles: 5,
    classification: i % 3 === 0 ? "personal" : i % 7 === 0 ? "unclassified" : "business",
    platformTag: null,
    projectLabel: null,
    notes: i % 2 ? "Delivery" : null,
  }));
  return {
    vehicle: { id: "v1", make: "Toyota", model: "Aqua", registrationPlate: null },
    from: "2026-06-02",
    to: "2026-08-30",
    days: 90,
    rows: trips.map(logbookRow),
    totals: logbookTotals(trips),
    claims: [{ taxYear: "2026-27", wholeYear: false, claim: null }],
  };
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

/** Every deflated stream in the PDF, inflated. */
function streams(pdf: Buffer): string[] {
  const s = pdf.toString("latin1");
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    try {
      out.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
    } catch {
      // not deflated
    }
  }
  return out;
}

/** Inflated content streams that draw text (one per page for this document). */
function textStreams(pdf: Buffer): number {
  const s = pdf.toString("latin1");
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    try {
      if (inflateSync(Buffer.from(m[1], "latin1")).toString("latin1").includes("BT")) count++;
    } catch {
      // not a deflated stream (fonts and the like)
    }
  }
  return count;
}

describe("NZ logbook PDF", () => {
  it("a long logbook runs onto more pages, each with content", async () => {
    const pdf = await nzLogbookPdf(book(250));
    const pages = pageCount(pdf);
    expect(pages).toBeGreaterThan(3);
    expect(textStreams(pdf)).toBe(pages);
  });

  it("a short one is a single page", async () => {
    expect(pageCount(await nzLogbookPdf(book(5)))).toBe(1);
  });
});

describe("NZ logbook claim line", () => {
  const claim = (amountMinor: number, tiers: Array<{ label: string; distance: number }>) => ({
    vehicleId: "v1",
    name: "Toyota Aqua",
    fuelType: "hybrid",
    businessDistance: tiers.reduce((s, t) => s + t.distance, 0),
    totalDistance: 900,
    noClaimReason: null,
    claim: {
      amountMinor,
      currency: "NZD",
      ratesYear: "2025-26",
      provisional: true,
      tiers: tiers.map((t) => ({ ...t, rateMinor: 90, amountMinor: t.distance * 90 })),
    },
  });

  it("shows a real figure with the tiers that have km, and says the rates are last year's", () => {
    const line = logbookClaimLine({
      taxYear: "2026-27",
      wholeYear: false,
      claim: claim(4500, [
        { label: "Tier 1", distance: 50 },
        { label: "Tier 2", distance: 0 },
      ]),
    });
    expect(line?.label).toBe("Claim for the 2026-27 tax year (so far)");
    expect(line?.value).toBe("$45.00 (Tier 1 50.0 km), using 2025-26 rates");
    expect(logbookClaimLine({ taxYear: "2025-26", wholeYear: true, claim: claim(100, [{ label: "Tier 1", distance: 1 }]) })?.label).toBe(
      "Claim for the 2025-26 tax year (whole year)"
    );
  });

  it("no $0.00 for a vehicle with no business driving, and nothing without a figure", () => {
    const base = { taxYear: "2026-27", wholeYear: false };
    expect(logbookClaimLine({ ...base, claim: claim(0, [{ label: "Tier 1", distance: 0 }]) })).toBeNull();
    expect(logbookClaimLine({ ...base, claim: { ...claim(0, []), claim: null, noClaimReason: "fuel_unknown" } })).toBeNull();
    expect(logbookClaimLine({ ...base, claim: null })).toBeNull();
  });
});

describe("NZ logbook text", () => {
  it("embeds a font that has the macrons, and the PDF maps them back to the same letters", async () => {
    const fonts = logbookFonts();
    expect(fonts.embedded).toBe(true);
    const places = "Whangārei, Ōtāhuhu, Taupō";
    const b = book(1);
    b.rows[0] = { ...b.rows[0], from: places, to: "Rotorua 🚗", reason: "Delivery 📦" };
    const pdf = await nzLogbookPdf(b);
    const raw = pdf.toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+PlusJakartaSans/);
    // The ToUnicode map of the embedded subset has ā, Ō and ō (and no emoji were drawn).
    const maps = streams(pdf).filter((t) => t.includes("beginbfchar") || t.includes("beginbfrange")).join("\n").toLowerCase();
    for (const cp of ["0101", "014c", "014d"]) expect(maps).toContain(`<${cp}>`);
    expect(maps).not.toContain("<d83d");
  });

  it("strips emoji but keeps macrons", () => {
    expect(pdfText("Taupō 🚗 run 👍🏽 ok")).toBe("Taupō run ok");
    expect(pdfText("Whangārei")).toBe("Whangārei");
  });
});

describe("NZ logbook CSV", () => {
  it("starts with a UTF-8 BOM so spreadsheets keep the macrons", () => {
    const b = book(1);
    b.rows[0] = { ...b.rows[0], from: "Whangārei" };
    const csv = nzLogbookCsv(b);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(Buffer.from(csv, "utf8").subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(csv).toContain("Whangārei");
  });

  it("leaves both odometer lines blank and lists not-sorted trips", () => {
    const csv = nzLogbookCsv(book(30));
    expect(csv).toContain("\r\nOdometer on first day,\r\n");
    expect(csv).toContain("\r\nOdometer on last day,\r\n");
    expect(csv).toMatch(/Trips not sorted,\d+/);
  });
});
