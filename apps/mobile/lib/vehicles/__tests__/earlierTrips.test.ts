import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDistance } from "@mileclear/shared";

type Button = { text: string; style?: string; onPress?: () => void };
const alert = vi.fn((_title: string, _body?: string, _buttons?: Button[], _opts?: unknown) => {});
vi.mock("react-native", () => ({ Alert: { alert: (...a: Parameters<typeof alert>) => alert(...a) } }));

let unit: "miles" | "km" = "miles";
vi.mock("../../units/distanceUnit", () => ({
  currentDistanceUnit: () => unit,
  distanceUnitApi: (u: "miles" | "km") => ({ fmt: (miles: number) => formatDistance(miles, u) }),
}));

const found = vi.fn(async (_vehicleId: string, _out: unknown) => [] as unknown[]);
// The real carBluetooth (withoutOverlaps, EARLIER_TRIPS_MAX) is used; only the
// look-up is mocked, and the database it imports is never reached.
vi.mock("../../db/index", () => ({
  getDatabase: async () => {
    throw new Error("not in these tests");
  },
}));
vi.mock("../carBluetooth", async (orig) => ({
  ...(await orig<typeof import("../carBluetooth")>()),
  earlierTripsInCar: (...a: [string, unknown]) => found(...a),
}));

const syncUpdateTrip = vi.fn(async (_id: string, _data: unknown) => null);
vi.mock("../../sync/actions", () => ({ syncUpdateTrip: (...a: [string, unknown]) => syncUpdateTrip(...a) }));

const fetchTrips = vi.fn(async (_params: unknown) => ({ data: [] as Array<{ id: string }>, total: 0 }) as unknown);
vi.mock("../../api/trips", () => ({ fetchTrips: (...a: [unknown]) => fetchTrips(...a) }));

const queueAppEvent = vi.fn(async (_type: string, _meta: unknown) => {});
vi.mock("../../tracking/recordingDrops", () => ({ queueAppEvent: (...a: [string, unknown]) => queueAppEvent(...a) }));

import { earlierTripsMessage, keepTripsTheServerHas, offerEarlierTrips, shortPlace, tripLine, whenLabel } from "../earlierTrips";

// Sun 25 Oct 2026 21:00 local.
const NOW = new Date(2026, 9, 25, 21, 0).getTime();
const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
const kaths = {
  id: "kaths",
  startMs: at(25, 19, 33),
  endMs: at(25, 19, 39),
  startAddress: "Home",
  endAddress: "Kaths",
  distanceMiles: 3.79,
  synced: true,
};
const bridges = {
  id: "bridges",
  startMs: at(23, 15, 18),
  endMs: at(23, 15, 31),
  synced: true,
  startAddress: "Home",
  endAddress: "47, The Bridges, Sunderland, SR1 3LE",
  distanceMiles: 2.71,
};

describe("wording", () => {
  beforeEach(() => {
    unit = "miles";
  });

  it("whenLabel: today, yesterday, then the day and date", () => {
    expect(whenLabel(at(25, 19, 33), NOW)).toBe("Today 19:33");
    expect(whenLabel(at(24, 8, 5), NOW)).toBe("Yesterday 08:05");
    expect(whenLabel(at(23, 17, 45), NOW)).toBe("Fri 23 Oct 17:45");
  });

  it("shortPlace: the first part of an address, a house number kept with its street", () => {
    expect(shortPlace("Home")).toBe("Home");
    expect(shortPlace("47, The Bridges, Sunderland, SR1 3LE")).toBe("47 The Bridges");
    expect(shortPlace("Tesco Extra, Sunderland")).toBe("Tesco Extra");
    expect(shortPlace(null)).toBeNull();
    expect(shortPlace("  ")).toBeNull();
  });

  it("tripLine: when, where, how far, in the driver's unit", () => {
    expect(tripLine(kaths, NOW)).toBe(`Today 19:33, Home to Kaths, ${formatDistance(3.79, "miles")}`);
    expect(tripLine({ ...kaths, startAddress: null }, NOW)).toBe(`Today 19:33, to Kaths, ${formatDistance(3.79, "miles")}`);
    expect(tripLine({ ...kaths, startAddress: null, endAddress: null }, NOW)).toBe(
      `Today 19:33, ${formatDistance(3.79, "miles")}`
    );
    unit = "km";
    expect(tripLine(kaths, NOW)).toContain("km");
  });

  it("earlierTripsMessage: one drive, several, and more than are listed", () => {
    const one = earlierTripsMessage([kaths], "Toyota Yaris X", NOW);
    expect(one.title).toBe("Was this drive in your Toyota Yaris X?");
    expect(one.body).toContain("Today 19:33, Home to Kaths");
    expect(one.body).toContain("Move it to your Toyota Yaris X?");
    expect([one.move, one.keep]).toEqual(["Move it", "Leave it"]);

    const two = earlierTripsMessage([kaths, bridges], "Toyota Yaris X", NOW);
    expect(two.title).toBe("Were these 2 drives in your Toyota Yaris X?");
    expect(two.body).toContain("Fri 23 Oct 15:18, Home to 47 The Bridges");
    expect([two.move, two.keep]).toEqual(["Move them", "Leave them"]);

    const many = earlierTripsMessage(Array.from({ length: 7 }, (_, i) => ({ ...kaths, id: `t${i}` })), "Yaris", NOW);
    expect(many.body).toContain("and 3 more");
    // No dashes in driver-facing text.
    for (const m of [one, two, many]) expect(`${m.title}${m.body}`).not.toMatch(/[–—]/);
  });
});

describe("offerEarlierTrips", () => {
  const out = { name: "Toyota Touch", id: "XX:XX:XX:XX:4C:62" };
  const buttons = () => alert.mock.calls[alert.mock.calls.length - 1][2] as Button[];
  const tap = (text: string) => buttons().find((b) => b.text === text)!.onPress!();

  beforeEach(() => {
    alert.mockClear();
    found.mockReset();
    syncUpdateTrip.mockReset();
    syncUpdateTrip.mockImplementation(async () => null);
    queueAppEvent.mockClear();
    fetchTrips.mockReset();
    fetchTrips.mockImplementation(async () => ({ data: [{ id: "kaths" }, { id: "bridges" }], total: 2 }));
  });

  it("nothing found: no question, resolves at once", async () => {
    found.mockResolvedValue([]);
    await offerEarlierTrips("yaris", "Toyota Yaris", out);
    expect(alert).not.toHaveBeenCalled();
    expect(found).toHaveBeenCalledWith("yaris", out);
  });

  it("a look-up that throws is treated as nothing found", async () => {
    found.mockRejectedValue(new Error("boom"));
    await expect(offerEarlierTrips("yaris", "Toyota Yaris", out)).resolves.toBeUndefined();
    expect(alert).not.toHaveBeenCalled();
  });

  it("Move: each trip goes on the car, offline-first, then it resolves", async () => {
    found.mockResolvedValue([kaths, bridges]);
    const done = offerEarlierTrips("yaris", "Toyota Yaris", out);
    await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    tap("Move them");
    await done;
    await vi.waitFor(() => expect(syncUpdateTrip).toHaveBeenCalledTimes(2));
    expect(syncUpdateTrip.mock.calls).toEqual([
      ["kaths", { vehicleId: "yaris" }],
      ["bridges", { vehicleId: "yaris" }],
    ]);
    await vi.waitFor(() =>
      expect(queueAppEvent).toHaveBeenCalledWith("trip.car_bluetooth", {
        decision: "look_back",
        vehicleId: "yaris",
        offered: 2,
        moved: 2,
        failed: 0,
      })
    );
  });

  it("Leave: nothing moves", async () => {
    found.mockResolvedValue([kaths]);
    const done = offerEarlierTrips("yaris", "Toyota Yaris", out);
    await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    tap("Leave it");
    await done;
    expect(syncUpdateTrip).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(queueAppEvent).toHaveBeenCalledWith("trip.car_bluetooth", expect.objectContaining({ offered: 1, moved: 0 }))
    );
  });

  it("a server error moving one trip is logged, not shown (the queue retries it)", async () => {
    found.mockResolvedValue([kaths, bridges]);
    syncUpdateTrip.mockImplementation(async (id: string) => {
      if (id === "kaths") throw new Error("500");
      return null;
    });
    const done = offerEarlierTrips("yaris", "Toyota Yaris", out);
    await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    tap("Move them");
    await done;
    await vi.waitFor(() =>
      expect(queueAppEvent).toHaveBeenCalledWith("trip.car_bluetooth", expect.objectContaining({ moved: 1, failed: 1 }))
    );
    expect(syncUpdateTrip).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("Move resolves straight away; the moves run on after", async () => {
    found.mockResolvedValue([kaths]);
    let release!: () => void;
    syncUpdateTrip.mockImplementation(() => new Promise((r) => (release = () => r(null))));
    const done = offerEarlierTrips("yaris", "Toyota Yaris", out);
    await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    tap("Move it");
    await done; // would hang here if the car screen waited on the network
    await vi.waitFor(() => expect(syncUpdateTrip).toHaveBeenCalledTimes(1));
    release();
  });

  it("a deleted copy never hides the real drive (server check before copies are merged)", async () => {
    const ghost = { ...kaths, id: "ghost", startMs: kaths.startMs + 30 * 1000 };
    found.mockResolvedValue([ghost, kaths]);
    fetchTrips.mockImplementation(async () => ({ data: [{ id: "kaths" }], total: 1 }));
    const done = offerEarlierTrips("yaris", "Toyota Yaris", out);
    await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    tap("Move it");
    await done;
    await vi.waitFor(() => expect(syncUpdateTrip.mock.calls).toEqual([["kaths", { vehicleId: "yaris" }]]));
  });

  it("copies the server can't vouch for (offline): offered once; at most 20 offered", async () => {
    fetchTrips.mockRejectedValue(new Error("offline"));
    const copies = [kaths, { ...kaths, id: "copy", startMs: kaths.startMs + 30 * 1000 }];
    const many = Array.from({ length: 25 }, (_, i) => ({ ...bridges, id: `b${i}`, startMs: bridges.startMs - (i + 1) * 3600_000, endMs: bridges.startMs - (i + 1) * 3600_000 + 600_000 }));
    found.mockResolvedValue([...copies, ...many]);
    const done = offerEarlierTrips("yaris", "Toyota Yaris", out);
    await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0][0]).toBe("Were these 20 drives in your Toyota Yaris?");
    tap("Leave them");
    await done;
  });

  it("a trip the server no longer has is not offered", async () => {
    found.mockResolvedValue([kaths, bridges]);
    fetchTrips.mockImplementation(async () => ({ data: [{ id: "bridges" }], total: 1 }));
    const done = offerEarlierTrips("yaris", "Toyota Yaris", out);
    await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0][0]).toBe("Was this drive in your Toyota Yaris?");
    tap("Leave it");
    await done;
  });
});

describe("keepTripsTheServerHas", () => {
  const pending = { ...kaths, id: "pending", synced: false };

  beforeEach(() => fetchTrips.mockReset());

  it("drops synced trips missing from the server, keeps ones not yet sent", async () => {
    fetchTrips.mockImplementation(async () => ({ data: [{ id: "bridges" }], total: 1 }));
    expect((await keepTripsTheServerHas([kaths, bridges, pending])).map((t) => t.id)).toEqual(["bridges", "pending"]);
    expect(fetchTrips).toHaveBeenCalledWith({ from: new Date(bridges.startMs - 60 * 60 * 1000).toISOString(), pageSize: 200 });
    // An hour early, for a start the server moved back.
    expect(new Date((fetchTrips.mock.calls[0][0] as { from: string }).from).getTime()).toBe(bridges.startMs - 60 * 60 * 1000);
  });

  it("offline, failing, or more trips than one page: keeps everything", async () => {
    fetchTrips.mockRejectedValue(new Error("offline"));
    expect(await keepTripsTheServerHas([kaths])).toEqual([kaths]);
    fetchTrips.mockImplementation(async () => ({ data: [{ id: "x" }], total: 500 }));
    expect(await keepTripsTheServerHas([kaths])).toEqual([kaths]);
    fetchTrips.mockImplementation(async () => null);
    expect(await keepTripsTheServerHas([kaths])).toEqual([kaths]);
  });

  it("nothing synced: no server call", async () => {
    expect(await keepTripsTheServerHas([pending])).toEqual([pending]);
    expect(fetchTrips).not.toHaveBeenCalled();
  });

  it("a slow server: asks anyway after 3 seconds", async () => {
    // Answers after the 3 s limit (a promise that never settles keeps the test worker open).
    fetchTrips.mockImplementation(() => new Promise((r) => setTimeout(() => r({ data: [], total: 0 }), 3500)));
    const t0 = Date.now();
    expect(await keepTripsTheServerHas([kaths])).toEqual([kaths]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2900);
  }, 15000);
});
