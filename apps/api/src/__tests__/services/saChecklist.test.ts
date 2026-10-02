/**
 * "Ready for 31 January?" checklist: which tax year, which rate, and each
 * item's status. Pure functions, no database.
 */
import { describe, it, expect } from "vitest";
import { saReturnTaxYear } from "@mileclear/shared";
import {
  buildSaChecklist,
  buildHeadline,
  mileageByVehicle,
  type SaChecklistInput,
  type ChecklistVehicle,
} from "../../services/saChecklist.js";

const DEC_1 = new Date("2026-12-01T10:00:00Z");
const OCT_2 = new Date("2026-10-02T10:00:00Z");

const CAR: ChecklistVehicle = {
  id: "v-car",
  make: "Toyota",
  model: "Prius",
  vehicleType: "car",
  createdAt: new Date("2024-01-01T00:00:00Z"),
};
const BIKE: ChecklistVehicle = {
  id: "v-bike",
  make: "Honda",
  model: "PCX",
  vehicleType: "motorbike",
  createdAt: new Date("2024-01-01T00:00:00Z"),
};

function input(over: Partial<SaChecklistInput> = {}): SaChecklistInput {
  return {
    taxYear: "2025-26",
    now: DEC_1,
    user: { fullName: "Sam Driver", dashboardMode: "work", workType: "gig" },
    buckets: [{ vehicleId: "v-car", classification: "business", miles: 1000, count: 40 }],
    vehicles: [CAR],
    earnings: { totalPence: 1_234_500, count: 12 },
    expenses: { allowablePence: 5_000, count: 3 },
    walkthroughOpened: true,
    ...over,
  };
}

const item = (c: ReturnType<typeof buildSaChecklist>, id: string) => c.items.find((i) => i.id === id)!;

describe("tax year and rate", () => {
  it("31 January 2027 is for 2025-26, before and after 6 April", () => {
    expect(saReturnTaxYear(new Date("2026-04-05T12:00:00Z"))).toBe("2024-25");
    expect(saReturnTaxYear(new Date("2026-04-06T12:00:00Z"))).toBe("2025-26");
    expect(saReturnTaxYear(DEC_1)).toBe("2025-26");
    expect(saReturnTaxYear(new Date("2027-01-31T12:00:00Z"))).toBe("2025-26");
    expect(saReturnTaxYear(new Date("2027-02-01T12:00:00Z"))).toBe("2025-26");
    expect(saReturnTaxYear(new Date("2027-04-06T12:00:00Z"))).toBe("2026-27");
  });

  it("prices 2025-26 at 45p a mile for a car, 2026-27 at 55p", () => {
    const b = [{ vehicleId: "v-car", classification: "business", miles: 1000, count: 1 }];
    expect(mileageByVehicle(b, [CAR], "2025-26").mileageClaimPence).toBe(45_000);
    expect(mileageByVehicle(b, [CAR], "2026-27").mileageClaimPence).toBe(55_000);
  });

  it("drops to 25p after 10,000 miles", () => {
    const b = [{ vehicleId: "v-car", classification: "business", miles: 12_000, count: 1 }];
    expect(mileageByVehicle(b, [CAR], "2025-26").mileageClaimPence).toBe(450_000 + 50_000);
  });

  it("prices trips with no vehicle as the primary vehicle, and a motorbike at 24p", () => {
    const b = [{ vehicleId: null, classification: "business", miles: 100, count: 5 }];
    expect(mileageByVehicle(b, [BIKE, CAR], "2025-26").mileageClaimPence).toBe(2_400);
    // No vehicles at all: priced as a car.
    expect(mileageByVehicle(b, [], "2025-26").mileageClaimPence).toBe(4_500);
  });

  it("ignores personal and unclassified miles in the claim", () => {
    const b = [
      { vehicleId: "v-car", classification: "business", miles: 100, count: 2 },
      { vehicleId: "v-car", classification: "personal", miles: 500, count: 9 },
      { vehicleId: "v-car", classification: "unclassified", miles: 300, count: 7 },
    ];
    const r = mileageByVehicle(b, [CAR], "2025-26");
    expect(r.businessMiles).toBe(100);
    expect(r.businessTrips).toBe(2);
    expect(r.mileageClaimPence).toBe(4_500);
    expect(r.tripsByVehicle.get("v-car")).toBe(18);
  });
});

describe("buildSaChecklist", () => {
  it("a finished list has no attention items and says so", () => {
    const c = buildSaChecklist(input());
    expect(c.taxYear).toBe("2025-26");
    expect(c.attentionCount).toBe(0);
    expect(c.headline).toBe("Everything on your 2025-26 list is done");
    expect(c.mileageClaimPence).toBe(45_000);
    expect(c.daysToDeadline).toBe(61);
    expect(c.inSeason).toBe(true);
    expect(c.eligible).toBe(true);
    expect(item(c, "mileage_claim").detail).toContain("£450.00");
  });

  it("counts unclassified trips and miles and sends them to the sorting list", () => {
    const c = buildSaChecklist(
      input({
        buckets: [
          { vehicleId: "v-car", classification: "business", miles: 1000, count: 40 },
          { vehicleId: "v-car", classification: "unclassified", miles: 412.4, count: 37 },
        ],
      })
    );
    const t = item(c, "trips_sorted");
    expect(t.status).toBe("attention");
    expect(t.action).toBe("unclassified_trips");
    expect(t.detail).toContain("37 trips (412 miles)");
    expect(c.unclassifiedTrips).toBe(37);
    expect(c.unclassifiedMiles).toBe(412.4);
    expect(c.headline).toBe("1 thing to sort before 31 January");
  });

  it("no trips at all asks for past trips", () => {
    const c = buildSaChecklist(input({ buckets: [] }));
    expect(item(c, "trips_sorted").action).toBe("add_trip");
    expect(item(c, "mileage_claim").status).toBe("attention");
  });

  it("earnings, full name and walkthrough each need attention when missing", () => {
    const c = buildSaChecklist(
      input({
        earnings: { totalPence: 0, count: 0 },
        user: { fullName: "  ", dashboardMode: "both", workType: "gig" },
        walkthroughOpened: false,
      })
    );
    expect(item(c, "earnings").status).toBe("attention");
    expect(item(c, "full_name").status).toBe("attention");
    expect(item(c, "full_name").action).toBe("profile_name");
    expect(item(c, "walkthrough").status).toBe("attention");
    expect(c.attentionCount).toBe(3);
    expect(c.headline).toBe("3 things to sort before 31 January");
  });

  it("expenses are optional, never a gap", () => {
    const c = buildSaChecklist(input({ expenses: { allowablePence: 0, count: 0 } }));
    expect(item(c, "expenses").status).toBe("optional");
    expect(c.attentionCount).toBe(0);
  });

  it("the PDF is always the last, optional step", () => {
    const c = buildSaChecklist(input());
    const last = c.items[c.items.length - 1];
    expect(last.id).toBe("pdf");
    expect(last.status).toBe("optional");
    expect(last.action).toBe("sa_pdf");
  });

  it("flags a second vehicle with no trips, but not one bought after the year ended", () => {
    const later = { ...BIKE, id: "v-new", createdAt: new Date("2026-06-01T00:00:00Z") };
    expect(item(buildSaChecklist(input({ vehicles: [CAR, BIKE] })), "vehicles").status).toBe("optional");
    expect(item(buildSaChecklist(input({ vehicles: [CAR, later] })), "vehicles").status).toBe("done");
  });

  it("no vehicle needs attention", () => {
    expect(item(buildSaChecklist(input({ vehicles: [] })), "vehicles").status).toBe("attention");
  });

  it("is not for employees or personal-only drivers with no business miles", () => {
    expect(buildSaChecklist(input({ user: { fullName: "A", dashboardMode: "work", workType: "employee" } })).ineligibleReason).toBe("employee");
    const personal = buildSaChecklist(
      input({ user: { fullName: "A", dashboardMode: "personal", workType: "gig" }, buckets: [] })
    );
    expect(personal.eligible).toBe(false);
    expect(personal.ineligibleReason).toBe("personal_only");
    // Personal mode but real business miles: still theirs to file.
    expect(buildSaChecklist(input({ user: { fullName: "A", dashboardMode: "personal", workType: "gig" } })).eligible).toBe(true);
  });

  it("is out of season in October unless an admin forces a preview", () => {
    expect(buildSaChecklist(input({ now: OCT_2 })).inSeason).toBe(false);
    expect(buildSaChecklist(input({ now: OCT_2, forceSeason: true })).inSeason).toBe(true);
  });

  it("copy has no em dashes and no endorsement wording next to HMRC", () => {
    const c = buildSaChecklist(
      input({ buckets: [], earnings: { totalPence: 0, count: 0 }, vehicles: [], walkthroughOpened: false })
    );
    for (const i of c.items) {
      const text = `${i.title} ${i.detail} ${i.actionLabel ?? ""}`;
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/HMRC[- ]?(ready|compliant|approved|accepted)/i);
      expect(text).not.toMatch(/\bMTD\b|Making Tax Digital/i);
    }
  });
});

describe("buildHeadline", () => {
  it("changes once the deadline has passed", () => {
    expect(buildHeadline(2, -3, "2025-26")).toBe("2 things still to sort for 2025-26");
  });
});
