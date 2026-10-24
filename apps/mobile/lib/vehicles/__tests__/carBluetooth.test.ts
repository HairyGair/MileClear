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
  forgetCarBluetooth,
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
const END = START + 30 * MIN;

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
      const s = [connectBefore, seen(START + MIN, "Kia Picanto"), seen(START + 2 * MIN, "MY FORD")];
      expect(carSeenDuring(START, END, [ford, kia], s)).toBe("kia");
    });

    it("a connect event there alone is not enough", () => {
      expect(carSeenDuring(START, END, [kia], [connectBefore])).toBeNull();
    });

    it("a connect event earlier than two minutes doesn't count", () => {
      const early = seen(START - SIGHTING_LEAD_MS - 1, "Kia Picanto", null, "bluetooth", "connect");
      const s = [early, seen(START + MIN, "Kia Picanto"), seen(START + 2 * MIN, "MY FORD")];
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
    const s = [seen(START, "MY FORD"), seen(START + MIN, "Kia Picanto")];
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

  it("not when a linked car was seen", () => {
    const s = [seen(START, "MY FORD"), seen(START, "SEAT BT"), seen(START + MIN, "SEAT BT")];
    expect(unlinkedCarDuring(START, END, [ford], s, [])).toBeNull();
  });

  it("never again for a name already answered", () => {
    const s = [seen(START, "SEAT BT"), seen(START + MIN, "SEAT BT")];
    expect(unlinkedCarDuring(START, END, [], s, ["seat bt"])).toBeNull();
  });
});

describe("the phone's store", () => {
  beforeEach(() => {
    state.clear();
    sightingsTable = [];
    failDb = false;
    hangDb = false;
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
    await new Promise((r) => setTimeout(r, 0));
    const q = await pendingCarQuestion();
    expect(q).toEqual({ name: "SEAT BT", id: "S1" });
    await answerCarQuestion(q!, null);
    expect(await pendingCarQuestion()).toBeNull();
    await bluetoothCarForTrip(START, END);
    await new Promise((r) => setTimeout(r, 0));
    expect(await pendingCarQuestion()).toBeNull();
    expect(updateVehicle).not.toHaveBeenCalled();
  });

  it("never asks a one-car driver", async () => {
    await cacheCarLinks([{ id: "ford" }]);
    sightingsTable.push(
      { at_ms: START, name: "SEAT BT", device_id: null, kind: "bluetooth" },
      { at_ms: START + MIN, name: "SEAT BT", device_id: null, kind: "bluetooth" }
    );
    await bluetoothCarForTrip(START, END);
    await new Promise((r) => setTimeout(r, 0));
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
    await cacheCarLinks([{ id: "ford" }, { id: "kia" }]);
    sightingsTable.push(
      { at_ms: START, name: "SEAT BT", device_id: null, kind: "bluetooth" },
      { at_ms: START + MIN, name: "SEAT BT", device_id: null, kind: "bluetooth" }
    );
    await bluetoothCarForTrip(START, END);
    await new Promise((r) => setTimeout(r, 0));
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

  it("answering with a car unlinks another car holding the same link first", async () => {
    await cacheCarLinks([
      { id: "ford", bluetoothName: "SEAT BT", bluetoothId: "name:SEAT BT" },
      { id: "kia" },
    ]);
    await answerCarQuestion({ name: "SEAT BT", id: null }, "kia");
    expect(updateVehicle.mock.calls).toEqual([
      ["ford", { bluetoothName: null, bluetoothId: null }],
      ["kia", { bluetoothName: "SEAT BT", bluetoothId: "name:SEAT BT" }],
    ]);
    sightingsTable.push({ at_ms: START, name: "SEAT BT", device_id: null, kind: "bluetooth" });
    expect(await bluetoothCarForTrip(START, END)).toEqual({ vehicleId: "kia", seen: 1 });
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
