/**
 * "Charges to pay": one charge per zone per day, the zone's pay-by deadline,
 * and the "I've paid" tick. Prisma is mocked; zone detection runs for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  vehicles: [] as unknown[],
  trips: [] as unknown[],
  coords: [] as unknown[],
  events: [] as { id: string; metadata: unknown; createdAt: Date }[],
  trip: null as unknown,
};
const create = vi.fn(async () => ({}));
const deleteMany = vi.fn(async () => ({ count: 1 }));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    vehicle: { findMany: vi.fn(async () => db.vehicles) },
    trip: { findMany: vi.fn(async () => db.trips), findFirst: vi.fn(async () => db.trip) },
    tripCoordinate: { findMany: vi.fn(async () => db.coords) },
    appEvent: { findMany: vi.fn(async () => db.events), create, deleteMany },
  },
}));

const { listCazCharges, setCazPaid, chargeableVehicles, CazPaidError } = await import("../../services/cazCharges.js");
const { chargesDueTomorrow, buildCazPayBody, buildCazPayTitle, cazPayPushEnabled, CAZ_PAY_ACTION } = await import(
  "../../jobs/cazPayReminders.js"
);

// Birmingham New Street, inside the A4540 ring.
const NEW_STREET = { lat: 52.4778, lng: -1.899 };
const oldDiesel = { id: "v1", euroStatus: "EURO 4", fuelType: "DIESEL", firstRegistration: "2008-03", vehicleType: "car" };
const newPetrol = { id: "v2", euroStatus: "EURO 6", fuelType: "PETROL", firstRegistration: "2019-03", vehicleType: "car" };

function trip(id: string, iso: string, vehicleId = "v1") {
  return { id, vehicleId, startedAt: new Date(iso), startLat: 52.5, startLng: -1.95, endLat: 52.5, endLng: -1.8 };
}

beforeEach(() => {
  db.vehicles = [oldDiesel];
  db.trips = [];
  db.coords = [];
  db.events = [];
  db.trip = null;
  create.mockClear();
  deleteMany.mockClear();
});

describe("chargeableVehicles", () => {
  it("drops compliant vehicles", () => {
    expect(chargeableVehicles([oldDiesel, newPetrol]).map((v) => v.id)).toEqual(["v1"]);
  });
});

describe("listCazCharges", () => {
  it("makes one charge per zone per day, with the GOV.UK six-day deadline", async () => {
    db.trips = [trip("a", "2026-09-29T08:00:00Z"), trip("b", "2026-09-29T15:00:00Z"), trip("c", "2026-09-30T09:00:00Z")];
    db.coords = ["a", "b", "c"].map((tripId) => ({ tripId, ...NEW_STREET }));
    const items = await listCazCharges("u1", new Date("2026-10-04T12:00:00Z"));
    expect(items).toHaveLength(2);
    const first = items.find((i) => i.travelDay === "2026-09-29")!;
    expect(first.zoneId).toBe("birmingham");
    expect(first.chargePence).toBe(800);
    expect(first.tripIds.sort()).toEqual(["a", "b"]);
    expect(first.deadline?.deadlineDay).toBe("2026-10-05");
    expect(first.deadline?.payUrl).toBe("https://www.gov.uk/clean-air-zones");
    expect(first.status).toBe("due");
    // Due soonest first.
    expect(items[0].travelDay).toBe("2026-09-29");
  });

  it("marks a ticked charge as paid and a missed one as overdue", async () => {
    db.trips = [trip("a", "2026-09-20T08:00:00Z"), trip("c", "2026-09-29T09:00:00Z")];
    db.coords = ["a", "c"].map((tripId) => ({ tripId, ...NEW_STREET }));
    db.events = [{ id: "e1", metadata: { key: "birmingham:2026-09-29" }, createdAt: new Date("2026-09-30T10:00:00Z") }];
    const items = await listCazCharges("u1", new Date("2026-10-04T12:00:00Z"));
    expect(items.find((i) => i.travelDay === "2026-09-29")?.status).toBe("paid");
    expect(items.find((i) => i.travelDay === "2026-09-20")?.status).toBe("overdue");
  });

  it("returns nothing for a compliant vehicle or a route outside every zone", async () => {
    db.vehicles = [newPetrol];
    expect(await listCazCharges("u1")).toEqual([]);
    db.vehicles = [oldDiesel];
    db.trips = [trip("a", "2026-09-29T08:00:00Z")];
    db.coords = [{ tripId: "a", lat: 54.97, lng: -1.6 }];
    expect(await listCazCharges("u1", new Date("2026-10-04T12:00:00Z"))).toEqual([]);
  });
});

describe("setCazPaid", () => {
  it("records a tick once, and removes it on untick", async () => {
    db.trip = { startedAt: new Date("2026-09-29T08:00:00Z") };
    expect(await setCazPaid("u1", "a", "birmingham", true)).toEqual({ key: "birmingham:2026-09-29", paid: true });
    expect(create).toHaveBeenCalledTimes(1);

    db.events = [{ id: "e1", metadata: { key: "birmingham:2026-09-29" }, createdAt: new Date() }];
    await setCazPaid("u1", "a", "birmingham", true);
    expect(create).toHaveBeenCalledTimes(1);
    await setCazPaid("u1", "a", "birmingham", false);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["e1"] } } });
  });

  it("rejects unknown zones and other people's trips", async () => {
    await expect(setCazPaid("u1", "a", "atlantis", true)).rejects.toBeInstanceOf(CazPaidError);
    await expect(setCazPaid("u1", "a", "birmingham", true)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("pay-by-tomorrow reminder", () => {
  it("only picks unpaid charges whose deadline is tomorrow", async () => {
    db.trips = [trip("a", "2026-09-29T08:00:00Z"), trip("c", "2026-09-30T09:00:00Z")];
    db.coords = ["a", "c"].map((tripId) => ({ tripId, ...NEW_STREET }));
    const now = new Date("2026-10-04T17:15:00Z"); // 18:15 UK
    const due = chargesDueTomorrow(await listCazCharges("u1", now), now);
    expect(due.map((d) => d.travelDay)).toEqual(["2026-09-29"]);
    expect(buildCazPayTitle(1)).toBe("Clean Air Zone charge due tomorrow");
    expect(buildCazPayBody(due)).toBe(
      "Your trip on Tue 29 Sep went into the Birmingham Clean Air Zone. If you need to pay the £8.00 daily charge, pay by 11:59pm tomorrow."
    );
    expect(buildCazPayBody(due)).not.toContain("—");
    expect(CAZ_PAY_ACTION).toBe("open_ticket_defender");
  });

  it("is dormant unless CAZ_PAY_PUSH is exactly 1", () => {
    expect(cazPayPushEnabled({})).toBe(false);
    expect(cazPayPushEnabled({ CAZ_PAY_PUSH: "true" })).toBe(false);
    expect(cazPayPushEnabled({ CAZ_PAY_PUSH: "1" })).toBe(true);
  });
});
