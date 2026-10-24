import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory tracking_state + car_sightings, enough for the store paths.
const state = new Map<string, string>();
let sightingsTable: Array<{
  at_ms: number;
  name: string;
  device_id: string | null;
  kind: string | null;
  source?: string | null;
}> = [];
let failDb = false;
let hangDb = false;
vi.mock("../../db/index", () => ({
  getDatabase: async () => {
    if (failDb) throw new Error("db unavailable");
    if (hangDb) await new Promise(() => {});
    return {
      getFirstAsync: async (_sql: string, params: string[]) =>
        state.has(params[0]) ? { value: state.get(params[0]) } : null,
      getAllAsync: async (_sql: string, params: number[]) =>
        sightingsTable.filter((r) => r.at_ms >= params[0] && r.at_ms <= params[1]),
      runAsync: async (sql: string, params: unknown[] = []) => {
        if (sql.startsWith("INSERT INTO car_sightings")) {
          const [at_ms, name, device_id, kind, source] = params as [number, string, string | null, string | null, string];
          sightingsTable.push({ at_ms, name, device_id, kind, source });
        } else if (sql.startsWith("DELETE FROM car_sightings WHERE")) {
          sightingsTable = sightingsTable.filter((r) => r.at_ms >= (params[0] as number));
        } else if (sql.startsWith("DELETE FROM car_sightings")) {
          sightingsTable = [];
        } else if (sql.startsWith("DELETE FROM tracking_state")) {
          state.delete(params[0] as string);
        } else {
          state.set(params[0] as string, params[1] as string);
        }
      },
    };
  },
}));

const updateVehicle = vi.fn(async (_id: string, _body: unknown) => ({ data: {} }));
vi.mock("../../api/vehicles", () => ({ updateVehicle }));

import {
  answerCarQuestion,
  bluetoothCarForTrip,
  bluetoothIdFor,
  cacheCarLinks,
  carSeenDuring,
  chooseRecordedTripCar,
  forgetCarBluetooth,
  maybeAskCarQuestion,
  mergeBlockedByCar,
  mergeOutcome,
  noteCarOnFix,
  rememberCarBluetoothFlag,
  linkedElsewhere,
  linksFromCars,
  looksLikeACar,
  LOOKUP_TIMEOUT_MS,
  pendingCarQuestion,
  recordCarSighting,
  SIGHTING_LEAD_MS,
  snoozeCarQuestion,
  tripWindowMs,
  unlinkedCarDuring,
  type CarLink,
  type CarSighting,
} from "../carBluetooth";

const MIN = 60 * 1000;
const START = 1_800_000_000_000;
// A short trip (one sighting is enough); the long-trip rules have their own tests.
const END = START + 3 * MIN;
const LONG_END = START + 30 * MIN;

const ford: CarLink = { vehicleId: "ford", name: "MY FORD", id: "AA:01" };
const kia: CarLink = { vehicleId: "kia", name: "Kia Picanto", id: null };

function seen(
  atMs: number,
  name: string,
  id: string | null = null,
  kind = "bluetooth",
  source = "fix"
): CarSighting {
  return { atMs, name, id, kind, source };
}

describe("carSeenDuring: which linked car the phone was on", () => {
  it("picks the linked car seen during the trip", () => {
    expect(carSeenDuring(START, END, [ford, kia], [seen(START + MIN, "MY FORD", "AA:01")])).toBe("ford");
  });

  it("matches names ignoring case and spaces", () => {
    expect(carSeenDuring(START, END, [kia], [seen(START + MIN, "  kia picanto ")])).toBe("kia");
  });

  it("counts sightings at the first and last fix", () => {
    expect(carSeenDuring(START, END, [ford], [seen(START, "MY FORD")])).toBe("ford");
    expect(carSeenDuring(START, END, [ford], [seen(END, "MY FORD")])).toBe("ford");
  });

  it("ignores sightings after the trip", () => {
    expect(carSeenDuring(START, END, [ford], [seen(END + 1, "MY FORD")])).toBeNull();
  });

  describe("the two minutes before the first fix", () => {
    const connectBefore = seen(START - SIGHTING_LEAD_MS, "Kia Picanto", null, "bluetooth", "connect");

    it("a connect event there counts towards a car also seen during the trip", () => {
      const s = [connectBefore, seen(START + 2 * MIN, "Kia Picanto"), seen(START + 2.5 * MIN, "MY FORD")];
      expect(carSeenDuring(START, END, [ford, kia], s)).toBe("kia");
    });

    it("a connect event there alone is not enough", () => {
      expect(carSeenDuring(START, END, [kia], [connectBefore])).toBeNull();
    });

    it("a connect event earlier than two minutes doesn't count", () => {
      const early = seen(START - SIGHTING_LEAD_MS - 1, "Kia Picanto", null, "bluetooth", "connect");
      const s = [early, seen(START + 2 * MIN, "Kia Picanto"), seen(START + 2.5 * MIN, "MY FORD")];
      expect(carSeenDuring(START, END, [ford, kia], s)).toBeNull();
    });

    it("a once-a-minute read from the previous car never wins (car swap)", () => {
      const s = [seen(START - MIN, "MY FORD"), seen(START - 30_000, "MY FORD"), seen(START + MIN, "Kia Picanto")];
      expect(carSeenDuring(START, END, [ford, kia], s)).toBe("kia");
      expect(carSeenDuring(START, END, [ford], [seen(START - MIN, "MY FORD")])).toBeNull();
    });
  });

  it("goes with the car seen most", () => {
    const s = [seen(START, "MY FORD"), seen(START + MIN, "Kia Picanto"), seen(START + 2 * MIN, "Kia Picanto")];
    expect(carSeenDuring(START, END, [ford, kia], s)).toBe("kia");
  });

  it("gives no answer on a tie", () => {
    const s = [seen(START + 2 * MIN, "MY FORD"), seen(START + 2.5 * MIN, "Kia Picanto")];
    expect(carSeenDuring(START, END, [ford, kia], s)).toBeNull();
  });

  it("gives no answer with no sightings, no links, or a backwards window", () => {
    expect(carSeenDuring(START, END, [ford], [])).toBeNull();
    expect(carSeenDuring(START, END, [], [seen(START, "MY FORD")])).toBeNull();
    expect(carSeenDuring(END, START, [ford], [seen(START, "MY FORD")])).toBeNull();
    expect(carSeenDuring(NaN, END, [ford], [seen(START, "MY FORD")])).toBeNull();
  });

  it("ignores outputs no car is linked to (headphones, a speaker)", () => {
    expect(carSeenDuring(START, END, [ford], [seen(START, "AirPods Pro"), seen(START + MIN, "JBL Flip")])).toBeNull();
  });

  it("does not match when both ids are real and differ", () => {
    expect(carSeenDuring(START, END, [ford], [seen(START, "MY FORD", "BB:02")])).toBeNull();
  });

  it("matches on the name when either side has no id", () => {
    expect(carSeenDuring(START, END, [ford], [seen(START, "MY FORD", null)])).toBe("ford");
    expect(carSeenDuring(START, END, [kia], [seen(START, "Kia Picanto", "CC:03")])).toBe("kia");
  });

  describe("masked addresses (both phones show only the last two bytes)", () => {
    const masked: CarLink = { vehicleId: "ford", name: "MY FORD", id: "XX:XX:XX:XX:EE:FF" };

    it("match on the last two bytes", () => {
      expect(carSeenDuring(START, END, [masked], [seen(START, "MY FORD", "XX:XX:XX:XX:EE:FF")])).toBe("ford");
      expect(carSeenDuring(START, END, [masked], [seen(START, "MY FORD", "XX:XX:XX:XX:AA:BB")])).toBeNull();
    });

    it("an old full address from a dev build matches its masked form", () => {
      const full: CarLink = { vehicleId: "ford", name: "MY FORD", id: "12:34:56:78:ee:ff" };
      expect(carSeenDuring(START, END, [full], [seen(START, "MY FORD", "XX:XX:XX:XX:EE:FF")])).toBe("ford");
      expect(carSeenDuring(START, END, [masked], [seen(START, "MY FORD", "12:34:56:78:EE:FF")])).toBe("ford");
    });

    it("two full addresses must match in full", () => {
      const full: CarLink = { vehicleId: "ford", name: "MY FORD", id: "12:34:56:78:EE:FF" };
      expect(carSeenDuring(START, END, [full], [seen(START, "MY FORD", "99:99:99:99:EE:FF")])).toBeNull();
    });
  });

  it("treats a name-only id as no id", () => {
    const nameOnly: CarLink = { vehicleId: "kia", name: "Kia Picanto", id: "name:Kia Picanto" };
    expect(carSeenDuring(START, END, [nameOnly], [seen(START, "Kia Picanto", "CC:03")])).toBe("kia");
  });

  describe("two links with the same name (two VWs both 'VW BT')", () => {
    const vw1: CarLink = { vehicleId: "vw1", name: "VW BT", id: "11" };
    const vw2: CarLink = { vehicleId: "vw2", name: "VW BT", id: "22" };

    it("the ids tell them apart", () => {
      expect(carSeenDuring(START, END, [vw1, vw2], [seen(START, "VW BT", "22")])).toBe("vw2");
    });

    it("no answer when the sighting has no id", () => {
      expect(carSeenDuring(START, END, [vw1, vw2], [seen(START, "VW BT", null)])).toBeNull();
    });

    it("no answer when one link has no id, even if the other matches", () => {
      const vwNoId: CarLink = { vehicleId: "vw1", name: "VW BT", id: null };
      expect(carSeenDuring(START, END, [vwNoId, vw2], [seen(START, "VW BT", "22")])).toBeNull();
    });

    it("an ambiguous sighting blocks an answer even when another car was seen more", () => {
      const s = [seen(START, "MY FORD"), seen(START + MIN, "MY FORD"), seen(START + 2 * MIN, "VW BT", null)];
      expect(carSeenDuring(START, END, [ford, vw1, vw2], s)).toBeNull();
    });
  });

  describe("a car swap and a trip in an unlinked car", () => {
    const seatAllTrip = () => {
      const s: CarSighting[] = [];
      for (let t = 1; t <= 30; t++) s.push(seen(START + t * MIN - 1, "SEAT BT", "S1"));
      return s;
    };

    it("parked the Ford, drove the Seat: one early Ford read never wins", () => {
      const s = [seen(START + 20_000, "MY FORD", "AA:01"), ...seatAllTrip()];
      expect(carSeenDuring(START, LONG_END, [ford], s)).toBeNull();
    });

    it("even a Ford read later in the trip loses to thirty of the Seat", () => {
      const s = [seen(START + 10 * MIN, "MY FORD", "AA:01"), ...seatAllTrip()];
      expect(carSeenDuring(START, LONG_END, [ford], s)).toBeNull();
    });

    it("the Ford the whole trip with one Seat blip is the Ford", () => {
      const s: CarSighting[] = [];
      for (let t = 1; t <= 30; t++) s.push(seen(START + t * MIN - 1, "MY FORD", "AA:01"));
      s.push(seen(START + 12 * MIN + 5, "SEAT BT"));
      expect(carSeenDuring(START, LONG_END, [ford], s)).toBe("ford");
    });

    it("a short trip with one sighting is that car", () => {
      expect(carSeenDuring(START, START + 2 * MIN, [ford], [seen(START + MIN, "MY FORD")])).toBe("ford");
    });

    it("a longer trip needs two sightings of the car", () => {
      expect(carSeenDuring(START, LONG_END, [ford], [seen(START + 5 * MIN, "MY FORD")])).toBeNull();
      expect(
        carSeenDuring(START, LONG_END, [ford], [seen(START + 5 * MIN, "MY FORD"), seen(START + 6 * MIN, "MY FORD")])
      ).toBe("ford");
    });

    it("Android listing the Ford and a Seat all trip gives no answer", () => {
      const s: CarSighting[] = [];
      for (let t = 0; t <= 30; t++) s.push(seen(START + t * MIN, "MY FORD"), seen(START + t * MIN, "SEAT BT"));
      expect(carSeenDuring(START, LONG_END, [ford], s)).toBeNull();
    });

    it("an early read that agrees with the rest of the trip is kept", () => {
      expect(
        carSeenDuring(START, START + 2 * MIN, [ford], [seen(START + 10_000, "MY FORD"), seen(START + MIN, "MY FORD")])
      ).toBe("ford");
    });
  });

  it("a CarPlay uid matches a link made from the masked Bluetooth address, by name", () => {
    const masked: CarLink = { vehicleId: "ford", name: "MY FORD", id: "XX:XX:XX:XX:EE:FF" };
    expect(carSeenDuring(START, END, [masked], [seen(START, "MY FORD", "6F2A1B3C-CARPLAY-UID", "carplay")])).toBe("ford");
  });

  it("skips sightings with an empty name", () => {
    expect(carSeenDuring(START, END, [ford], [seen(START, "  "), seen(START, "MY FORD")])).toBe("ford");
  });
});

describe("linksFromCars: only cars linked with the button count", () => {
  it("ignores the old typed-in names (bluetoothName, no bluetoothId)", () => {
    expect(linksFromCars([{ id: "old", bluetoothName: "MY FORD", bluetoothId: null }])).toEqual([]);
    expect(linksFromCars([{ id: "old2", bluetoothName: "MY FORD" }])).toEqual([]);
    expect(linksFromCars([{ id: "blank", bluetoothName: "MY FORD", bluetoothId: "  " }])).toEqual([]);
  });

  it("ignores an id with no name", () => {
    expect(linksFromCars([{ id: "x", bluetoothName: null, bluetoothId: "AA:01" }])).toEqual([]);
  });

  it("keeps real ids and turns name-only ids into null", () => {
    expect(
      linksFromCars([
        { id: "ford", bluetoothName: " MY FORD ", bluetoothId: "AA:01" },
        { id: "kia", bluetoothName: "Kia Picanto", bluetoothId: "name:Kia Picanto" },
      ])
    ).toEqual([ford, kia]);
  });

  it("an old typed-in name never chooses the car", () => {
    const links = linksFromCars([{ id: "old", bluetoothName: "MY FORD", bluetoothId: null }]);
    expect(carSeenDuring(START, END, links, [seen(START, "MY FORD")])).toBeNull();
  });
});

describe("at finalize", () => {
  it("chooseRecordedTripCar: the linked car, else the default car on null or a throw", async () => {
    const fallback = vi.fn(async () => "primary");
    expect(await chooseRecordedTripCar(async () => ({ vehicleId: "kia", seen: 3 }), fallback)).toEqual({
      vehicleId: "kia",
      fromBluetooth: { vehicleId: "kia", seen: 3 },
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(await chooseRecordedTripCar(async () => null, fallback)).toEqual({ vehicleId: "primary", fromBluetooth: null });
    expect(
      await chooseRecordedTripCar(async () => {
        throw new Error("boom");
      }, fallback)
    ).toEqual({ vehicleId: "primary", fromBluetooth: null });
    expect(await chooseRecordedTripCar(async () => null, async () => undefined)).toEqual({
      vehicleId: undefined,
      fromBluetooth: null,
    });
  });

  it("mergeBlockedByCar: only a definite answer on both legs, in different cars, splits", () => {
    // Leg 1 had no answer, leg 2 the Kia: merge (a false split is worse).
    expect(mergeBlockedByCar("kia", null, "ford", false)).toBe(false);
    // Both definite and different: split.
    expect(mergeBlockedByCar("kia", "ford", "ford", false)).toBe(true);
    // "Still on a job": merge.
    expect(mergeBlockedByCar("kia", "ford", "ford", true)).toBe(false);
    // Recent leg definite, segment the same car: merge.
    expect(mergeBlockedByCar("ford", "ford", "ford", false)).toBe(false);
    // The recent trip's Bluetooth car isn't the car it is on (moved by hand): merge.
    expect(mergeBlockedByCar("kia", "seat", "ford", false)).toBe(false);
    // No answer for the segment, or a recent trip with no car: merge.
    expect(mergeBlockedByCar(null, "ford", "ford", false)).toBe(false);
    expect(mergeBlockedByCar("kia", "ford", null, false)).toBe(false);
  });

  it("mergeOutcome: the decision finalize acts on", () => {
    const base = { closeEnough: true, keepGoingApplies: false, recentTripVehicleId: "ford" };
    expect(mergeOutcome({ ...base, segmentCar: null, recentLegCar: null })).toBe("merge");
    expect(mergeOutcome({ ...base, segmentCar: "kia", recentLegCar: null })).toBe("merge");
    expect(mergeOutcome({ ...base, segmentCar: "kia", recentLegCar: "ford" })).toBe("split");
    expect(mergeOutcome({ ...base, keepGoingApplies: true, segmentCar: "kia", recentLegCar: "ford" })).toBe("merge");
    expect(mergeOutcome({ ...base, segmentCar: "ford", recentLegCar: "ford" })).toBe("merge");
    expect(mergeOutcome({ ...base, closeEnough: false, segmentCar: "ford", recentLegCar: "ford" })).toBe("apart");
    expect(mergeOutcome({ ...base, closeEnough: false, segmentCar: "kia", recentLegCar: "ford" })).toBe("apart");
  });
});

describe("looksLikeACar", () => {
  it("turns away headphones, speakers, watches and TVs", () => {
    for (const name of [
      "AirPods Pro",
      "Galaxy Buds2",
      "Jabra Elite 75t",
      "Shokz OpenRun",
      "Nothing Ear (2)",
      "Echo Dot",
      "Sonos Roam",
      "Soundcore Life Q30",
      "Anker A3951",
      "Samsung TV",
      "Galaxy Watch5",
      "JBL Flip 5",
      "  ",
    ]) {
      expect(looksLikeACar({ name }), name).toBe(false);
    }
  });

  it("keeps car names", () => {
    for (const name of ["MY FORD", "VW BT", "Kia Picanto", "SYNC", "Audi MMI 1234", "TOYOTA Touch", "CAR MULTIMEDIA"]) {
      expect(looksLikeACar({ name }), name).toBe(true);
    }
  });
});

describe("linkedElsewhere", () => {
  it("finds another car with the same link, not this one", () => {
    expect(linkedElsewhere({ name: "my ford", id: "AA:01" }, [ford, kia], "kia")).toEqual(ford);
    expect(linkedElsewhere({ name: "MY FORD", id: "AA:01" }, [ford, kia], "ford")).toBeNull();
    expect(linkedElsewhere({ name: "MY FORD", id: "BB:02" }, [ford, kia], "kia")).toBeNull();
  });
});

describe("tripWindowMs", () => {
  it("reads ISO and raw native epoch times", () => {
    const iso = new Date(START).toISOString();
    expect(tripWindowMs(iso, new Date(END).toISOString())).toEqual({ startMs: START, endMs: END });
    expect(tripWindowMs(String(START), String(END))).toEqual({ startMs: START, endMs: END });
    expect(tripWindowMs(START, END)).toEqual({ startMs: START, endMs: END });
  });

  it("null for missing, bad or backwards times", () => {
    expect(tripWindowMs(null, END)).toBeNull();
    expect(tripWindowMs("not a time", END)).toBeNull();
    expect(tripWindowMs(END, START)).toBeNull();
  });
});

describe("bluetoothIdFor", () => {
  it("uses the OS id, else the name", () => {
    expect(bluetoothIdFor({ name: "MY FORD", id: "AA:01", kind: "bluetooth" })).toBe("AA:01");
    expect(bluetoothIdFor({ name: " MY FORD ", id: null, kind: "bluetooth" })).toBe("name:MY FORD");
  });

  it("fits the server column", () => {
    expect(bluetoothIdFor({ name: "x".repeat(100), id: null, kind: "bluetooth" })).toHaveLength(100);
  });
});

describe("unlinkedCarDuring: what to ask about", () => {
  it("asks about an unlinked name seen twice", () => {
    const s = [seen(START, "SEAT BT", "S1"), seen(START + MIN, "SEAT BT", "S1")];
    expect(unlinkedCarDuring(START, END, [ford], s, [])).toEqual({ name: "SEAT BT", id: "S1" });
  });

  it("not for one passing sighting, unless it is CarPlay or Android Auto", () => {
    expect(unlinkedCarDuring(START, END, [ford], [seen(START, "SEAT BT")], [])).toBeNull();
    expect(unlinkedCarDuring(START, END, [ford], [seen(START, "SEAT", null, "carplay")], [])).toEqual({
      name: "SEAT",
      id: null,
    });
  });

  it("not for headphones or a speaker", () => {
    const s = [seen(START, "AirPods Pro"), seen(START + MIN, "AirPods Pro"), seen(START, "JBL Flip 5"), seen(START + MIN, "JBL Flip 5")];
    expect(unlinkedCarDuring(START, END, [], s, [])).toBeNull();
  });

  it("Android Auto doesn't make headphones a car", () => {
    expect(unlinkedCarDuring(START, END, [], [seen(START, "Jabra Elite", null, "android_auto")], [])).toBeNull();
  });

  it("not for a passing sighting before the trip", () => {
    const s = [seen(START - MIN, "SEAT BT", null, "bluetooth", "connect"), seen(START - 30_000, "SEAT BT")];
    expect(unlinkedCarDuring(START, END, [], s, [])).toBeNull();
  });

  it("not when the trip was mostly in a linked car", () => {
    const s = [seen(START + 2 * MIN, "MY FORD"), seen(START + 2.2 * MIN, "MY FORD"), seen(START + 2.5 * MIN, "SEAT BT"), seen(START + 2.6 * MIN, "SEAT BT")];
    expect(unlinkedCarDuring(START, END, [ford], s, [])).toBeNull();
    s.push(seen(START + 2.8 * MIN, "MY FORD"));
    expect(unlinkedCarDuring(START, END, [ford], s, [])).toBeNull();
  });

  it("asks about the car the trip was really in, even if a linked car showed briefly", () => {
    const s = [seen(START + 10_000, "MY FORD")];
    for (let t = 1; t <= 30; t++) s.push(seen(START + t * MIN, "SEAT BT"));
    expect(unlinkedCarDuring(START, LONG_END, [ford], s, [])).toEqual({ name: "SEAT BT", id: null });
  });

  it("Android Auto alone is not proof: one sighting is not enough", () => {
    expect(unlinkedCarDuring(START, END, [], [seen(START, "SEAT", null, "android_auto")], [])).toBeNull();
  });

  it("never again for a name already answered", () => {
    const s = [seen(START, "SEAT BT"), seen(START + MIN, "SEAT BT")];
    expect(unlinkedCarDuring(START, END, [], s, ["seat bt"])).toBeNull();
  });
});

describe("the phone's store", () => {
  beforeEach(async () => {
    state.clear();
    sightingsTable = [];
    failDb = false;
    hangDb = false;
    await rememberCarBluetoothFlag(true);
    updateVehicle.mockClear();
    updateVehicle.mockImplementation(async () => ({ data: {} }));
  });

  it("finds the linked car from logged sightings", async () => {
    await cacheCarLinks([
      { id: "ford", bluetoothName: "MY FORD", bluetoothId: "AA:01" },
      { id: "kia", bluetoothName: "Kia Picanto", bluetoothId: "name:Kia Picanto" },
    ]);
    sightingsTable.push({ at_ms: START + MIN, name: "Kia Picanto", device_id: null, kind: "bluetooth" });
    expect(await bluetoothCarForTrip(START, END)).toEqual({ vehicleId: "kia", seen: 1 });
  });

  it("gives no answer, without throwing, when the database fails", async () => {
    failDb = true;
    expect(await bluetoothCarForTrip(START, END)).toBeNull();
    await expect(recordCarSighting({ name: "MY FORD", id: null, kind: "bluetooth" }, "connect")).resolves.toBeUndefined();
    expect(await pendingCarQuestion()).toBeNull();
  });

  it("does not log an empty or missing output, and prunes old rows", async () => {
    await recordCarSighting(null, "connect");
    await recordCarSighting({ name: "  ", id: null, kind: "bluetooth" }, "connect");
    expect(sightingsTable).toHaveLength(0);
    sightingsTable.push({ at_ms: Date.now() - 4 * 24 * 60 * MIN, name: "OLD", device_id: null, kind: null });
    await recordCarSighting({ name: "MY FORD", id: "AA:01", kind: "bluetooth" }, "connect");
    expect(sightingsTable.map((r) => r.name)).toEqual(["MY FORD"]);
  });

  it("logs each car in a list, so a speaker alongside the car doesn't hide it", async () => {
    await cacheCarLinks([{ id: "ford", bluetoothName: "MY FORD", bluetoothId: "AA:01" }]);
    await recordCarSighting(
      [
        { name: "JBL Flip", id: "J1", kind: "bluetooth" },
        { name: "MY FORD", id: "AA:01", kind: "bluetooth" },
      ],
      "fix"
    );
    // The speaker is never logged; the car behind it is.
    expect(sightingsTable.map((r) => r.name)).toEqual(["MY FORD"]);
    const at = sightingsTable[0].at_ms;
    expect(await bluetoothCarForTrip(at, at + MIN)).toEqual({ vehicleId: "ford", seen: 1 });
  });

  it("asks once about an unlinked car on a 2-car account, then never again after None of these", async () => {
    await cacheCarLinks([{ id: "ford" }, { id: "kia" }]);
    sightingsTable.push(
      { at_ms: START, name: "SEAT BT", device_id: "S1", kind: "bluetooth" },
      { at_ms: START + MIN, name: "SEAT BT", device_id: "S1", kind: "bluetooth" }
    );
    expect(await bluetoothCarForTrip(START, END)).toBeNull();
    // The lookup itself is read only: a merged or deduped leg never asks.
    expect(await pendingCarQuestion()).toBeNull();
    await maybeAskCarQuestion(START, END);
    const q = await pendingCarQuestion();
    expect(q).toEqual({ name: "SEAT BT", id: "S1" });
    await answerCarQuestion(q!, null);
    expect(await pendingCarQuestion()).toBeNull();
    await maybeAskCarQuestion(START, END);
    expect(await pendingCarQuestion()).toBeNull();
    expect(updateVehicle).not.toHaveBeenCalled();
  });

  it("never asks a one-car driver", async () => {
    await cacheCarLinks([{ id: "ford" }]);
    sightingsTable.push(
      { at_ms: START, name: "SEAT BT", device_id: null, kind: "bluetooth" },
      { at_ms: START + MIN, name: "SEAT BT", device_id: null, kind: "bluetooth" }
    );
    await maybeAskCarQuestion(START, END);
    expect(await pendingCarQuestion()).toBeNull();
  });

  it("answering with a car links it, and the next trip goes on it", async () => {
    await cacheCarLinks([{ id: "ford" }, { id: "kia" }]);
    await answerCarQuestion({ name: "SEAT BT", id: null }, "kia");
    expect(updateVehicle).toHaveBeenCalledWith("kia", { bluetoothName: "SEAT BT", bluetoothId: "name:SEAT BT" });
    sightingsTable.push({ at_ms: START, name: "SEAT BT", device_id: "S1", kind: "bluetooth" });
    expect(await bluetoothCarForTrip(START, END)).toEqual({ vehicleId: "kia", seen: 1 });
  });

  it("reads the trip's stored ISO times (the finalize seam)", async () => {
    await cacheCarLinks([{ id: "ford", bluetoothName: "MY FORD", bluetoothId: "AA:01" }]);
    sightingsTable.push({ at_ms: START + MIN, name: "MY FORD", device_id: "AA:01", kind: "bluetooth" });
    const iso = (ms: number) => new Date(ms).toISOString();
    expect(await bluetoothCarForTrip(iso(START), iso(END))).toEqual({ vehicleId: "ford", seen: 1 });
    expect(await bluetoothCarForTrip("garbage", iso(END))).toBeNull();
  });

  it("gives up after two seconds when the database hangs", async () => {
    vi.useFakeTimers();
    try {
      hangDb = true;
      const p = bluetoothCarForTrip(START, END);
      await vi.advanceTimersByTimeAsync(LOOKUP_TIMEOUT_MS);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  async function pendingSeat(): Promise<void> {
    await rememberCarBluetoothFlag(true);
    await cacheCarLinks([{ id: "ford" }, { id: "kia" }]);
    sightingsTable.push(
      { at_ms: START, name: "SEAT BT", device_id: null, kind: "bluetooth" },
      { at_ms: START + MIN, name: "SEAT BT", device_id: null, kind: "bluetooth" }
    );
    await maybeAskCarQuestion(new Date(START).toISOString(), new Date(END).toISOString());
  }

  it("a failed answer throws and keeps the question; snooze hides it for this app open only", async () => {
    await pendingSeat();
    updateVehicle.mockImplementation(async () => {
      throw new Error("offline");
    });
    await expect(answerCarQuestion({ name: "SEAT BT", id: null }, "kia")).rejects.toThrow("offline");
    snoozeCarQuestion();
    expect(await pendingCarQuestion()).toBeNull();
    // Not answered: the question is still there for the next app open.
    expect(state.get("car_question_answered")).toBeUndefined();
    expect(state.get("car_question")).toBeDefined();
    await forgetCarBluetooth(); // also ends the snooze (as a fresh process would)
    await pendingSeat();
    expect(await pendingCarQuestion()).toEqual({ name: "SEAT BT", id: null });
  });

  it("answering with a car links it, then unlinks another car holding the same link", async () => {
    await cacheCarLinks([
      { id: "ford", bluetoothName: "SEAT BT", bluetoothId: "name:SEAT BT" },
      { id: "kia" },
    ]);
    await answerCarQuestion({ name: "SEAT BT", id: null }, "kia");
    expect(updateVehicle.mock.calls).toEqual([
      ["kia", { bluetoothName: "SEAT BT", bluetoothId: "name:SEAT BT" }],
      ["ford", { bluetoothName: null, bluetoothId: null }],
    ]);
    sightingsTable.push({ at_ms: START, name: "SEAT BT", device_id: null, kind: "bluetooth" });
    expect(await bluetoothCarForTrip(START, END)).toEqual({ vehicleId: "kia", seen: 1 });
  });

  it("an unlink that fails stays in the cache, so finalize gives no answer rather than the wrong car", async () => {
    await cacheCarLinks([
      { id: "ford", bluetoothName: "SEAT BT", bluetoothId: "name:SEAT BT" },
      { id: "kia" },
    ]);
    updateVehicle.mockImplementation(async (id: string) => {
      if (id === "ford") throw new Error("offline");
      return { data: {} };
    });
    await answerCarQuestion({ name: "SEAT BT", id: null }, "kia");
    sightingsTable.push({ at_ms: START, name: "SEAT BT", device_id: null, kind: "bluetooth" });
    expect(await bluetoothCarForTrip(START, END)).toBeNull();
    // Answered all the same: the chosen car was linked.
    expect(await pendingCarQuestion()).toBeNull();
  });

  it("a failed link leaves the cache alone and snoozes the question", async () => {
    await pendingSeat();
    updateVehicle.mockImplementation(async () => {
      throw new Error("offline");
    });
    await expect(answerCarQuestion({ name: "SEAT BT", id: null }, "kia")).rejects.toThrow();
    expect(updateVehicle).toHaveBeenCalledTimes(1);
    expect(await pendingCarQuestion()).toBeNull(); // snoozed without being asked to
    expect(JSON.parse(state.get("car_links")!).links).toEqual([]);
    await forgetCarBluetooth();
  });

  it("a car linked by hand to a headphone-looking name still counts", async () => {
    await cacheCarLinks([{ id: "van", bluetoothName: "JBL Car", bluetoothId: "XX:XX:XX:XX:EE:FF" }]);
    await recordCarSighting(
      [
        { name: "JBL Car", id: "XX:XX:XX:XX:EE:FF", kind: "bluetooth" },
        { name: "AirPods Pro", id: "XX:XX:XX:XX:11:22", kind: "bluetooth" },
      ],
      "connect"
    );
    expect(sightingsTable.map((r) => r.name)).toEqual(["JBL Car"]);
    const at = sightingsTable[0].at_ms;
    expect(await bluetoothCarForTrip(at, at + MIN)).toEqual({ vehicleId: "van", seen: 1 });
  });

  it("real masked ids: a link from a full address matches the masked form, another car's doesn't", async () => {
    await cacheCarLinks([
      { id: "ford", bluetoothName: "MY FORD", bluetoothId: "AA:BB:CC:DD:EE:FF" },
      { id: "ford2", bluetoothName: "MY FORD", bluetoothId: "XX:XX:XX:XX:12:34" },
    ]);
    sightingsTable.push(
      { at_ms: START + MIN, name: "MY FORD", device_id: "XX:XX:XX:XX:EE:FF", kind: "bluetooth" },
      { at_ms: START + 2 * MIN, name: "MY FORD", device_id: "XX:XX:XX:XX:EE:FF", kind: "bluetooth" }
    );
    expect(await bluetoothCarForTrip(START, END)).toEqual({ vehicleId: "ford", seen: 2 });
    sightingsTable = [{ at_ms: START + MIN, name: "MY FORD", device_id: "XX:XX:XX:XX:12:34", kind: "bluetooth" }];
    expect(await bluetoothCarForTrip(START, END)).toEqual({ vehicleId: "ford2", seen: 1 });
  });

  it("a snooze lasts 24 hours across app opens, and sign out clears it", async () => {
    await pendingSeat();
    await snoozeCarQuestion();
    expect(Number(state.get("car_question_snooze_until"))).toBeGreaterThan(Date.now() + 23 * 60 * MIN);
    await forgetCarBluetooth();
    expect(state.has("car_question_snooze_until")).toBe(false);
    await pendingSeat();
    // A fresh process (no in-memory flag) still honours a stored snooze.
    state.set("car_question_snooze_until", String(Date.now() + MIN));
    expect(await pendingCarQuestion()).toBeNull();
    state.set("car_question_snooze_until", String(Date.now() - 1));
    expect(await pendingCarQuestion()).toEqual({ name: "SEAT BT", id: null });
    // More than 24 h ahead means the clock was set back: treated as expired.
    state.set("car_question_snooze_until", String(Date.now() + 48 * 60 * MIN));
    expect(await pendingCarQuestion()).toEqual({ name: "SEAT BT", id: null });
  });

  it("replacing a car's link marks the old name answered too, so it is never asked back", async () => {
    await cacheCarLinks([{ id: "kia", bluetoothName: "Kia CarPlay", bluetoothId: "UID-1" }, { id: "ford" }]);
    await answerCarQuestion({ name: "KIA BT", id: "XX:XX:XX:XX:EE:FF" }, "kia");
    const answered = JSON.parse(state.get("car_question_answered")!);
    expect(answered).toEqual(["KIA BT", "Kia CarPlay"]);
  });

  it("does not log headphones", async () => {
    await recordCarSighting([{ name: "AirPods Pro", id: "A1", kind: "bluetooth" }], "connect");
    expect(sightingsTable).toHaveLength(0);
  });

  it("forgets links, sightings and the question on sign out", async () => {
    await cacheCarLinks([{ id: "ford", bluetoothName: "MY FORD", bluetoothId: "AA:01" }]);
    sightingsTable.push({ at_ms: START, name: "MY FORD", device_id: "AA:01", kind: "bluetooth" });
    await forgetCarBluetooth();
    expect(sightingsTable).toHaveLength(0);
    expect(state.size).toBe(0);
    expect(await bluetoothCarForTrip(START, END)).toBeNull();
  });
});

describe("switched off (CAR_BLUETOOTH_ROLLOUT): completely inert", () => {
  beforeEach(async () => {
    state.clear();
    sightingsTable = [];
    failDb = false;
    hangDb = false;
    await cacheCarLinks([
      { id: "ford", bluetoothName: "MY FORD", bluetoothId: "AA:01" },
      { id: "kia" },
    ]);
  });

  it("is off when the phone has never been told", async () => {
    vi.resetModules();
    const fresh = await import("../carBluetooth");
    expect(await fresh.isCarBluetoothOn()).toBe(false);
    await fresh.recordCarSighting({ name: "MY FORD", id: "AA:01", kind: "bluetooth" }, "connect");
    expect(sightingsTable).toHaveLength(0);
  });

  it("records nothing, finds nothing and asks nothing", async () => {
    await rememberCarBluetoothFlag(false);
    await recordCarSighting({ name: "MY FORD", id: "AA:01", kind: "bluetooth" }, "connect");
    noteCarOnFix(Date.now() + 10 * MIN);
    await new Promise((r) => setTimeout(r, 0));
    expect(sightingsTable).toHaveLength(0);
    // Even with sightings and a question already on the phone.
    sightingsTable.push(
      { at_ms: START + MIN, name: "MY FORD", device_id: "AA:01", kind: "bluetooth" },
      { at_ms: START + 2 * MIN, name: "SEAT BT", device_id: null, kind: "bluetooth" }
    );
    state.set("car_question", JSON.stringify({ name: "SEAT BT", id: null }));
    expect(await bluetoothCarForTrip(START, END)).toBeNull();
    expect(await pendingCarQuestion()).toBeNull();
    await maybeAskCarQuestion(START, END);
    expect(JSON.parse(state.get("car_question")!)).toEqual({ name: "SEAT BT", id: null });
  });

  it("turning it off clears the sightings and the question; on again works", async () => {
    await rememberCarBluetoothFlag(true);
    await recordCarSighting({ name: "MY FORD", id: "AA:01", kind: "bluetooth" }, "connect");
    state.set("car_question", JSON.stringify({ name: "SEAT BT", id: null }));
    expect(sightingsTable).toHaveLength(1);
    await rememberCarBluetoothFlag(false);
    expect(sightingsTable).toHaveLength(0);
    expect(state.has("car_question")).toBe(false);
    expect(state.has("car_bluetooth_enabled")).toBe(false);
    await rememberCarBluetoothFlag(true);
    expect(state.get("car_bluetooth_enabled")).toBe("1");
    sightingsTable.push({ at_ms: START + MIN, name: "MY FORD", device_id: "AA:01", kind: "bluetooth" });
    expect(await bluetoothCarForTrip(START, END)).toEqual({ vehicleId: "ford", seen: 1 });
  });

  it("anything but true from the server is off; sign out forgets it", async () => {
    for (const raw of [undefined, null, "1", 1, "true"]) {
      await rememberCarBluetoothFlag(true);
      await rememberCarBluetoothFlag(raw);
      expect(await bluetoothCarForTrip(START, END)).toBeNull();
    }
    await rememberCarBluetoothFlag(true);
    await forgetCarBluetooth();
    expect(state.has("car_bluetooth_enabled")).toBe(false);
    sightingsTable.push({ at_ms: START + MIN, name: "MY FORD", device_id: "AA:01", kind: "bluetooth" });
    expect(await bluetoothCarForTrip(START, END)).toBeNull();
  });
});
