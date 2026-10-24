import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory tracking_state table, plus the newest local trip's car.
const store = new Map<string, string>();
let lastTripCar: string | null = null;
vi.mock("../../db/index", () => ({
  getDatabase: async () => ({
    getFirstAsync: async (sql: string, params?: string[]) => {
      if (sql.includes("FROM trips")) return lastTripCar ? { vehicle_id: lastTripCar } : null;
      const key = params?.[0] ?? "";
      return store.has(key) ? { value: store.get(key) } : null;
    },
    runAsync: async (sql: string, params: string[]) => {
      if (sql.startsWith("DELETE")) store.delete(params[0]);
      else store.set(params[0], params[1]);
    },
  }),
}));

import { carForRecordedTrip, forgetCars, pickDefaultCar, rememberCars } from "../defaultCar";

const dromore = { id: "dromore", isPrimary: true };
const aughnacloy = { id: "aughnacloy", isPrimary: false };

describe("the car a recorded trip goes on", () => {
  beforeEach(() => {
    store.clear();
    lastTripCar = null;
  });

  it("picks the primary car, else the only car, else none", () => {
    expect(pickDefaultCar([aughnacloy, dromore])).toBe("dromore");
    expect(pickDefaultCar([{ id: "only" }])).toBe("only");
    expect(pickDefaultCar([{ id: "a" }, { id: "b" }])).toBeNull();
    expect(pickDefaultCar([])).toBeNull();
  });

  it("uses the primary car even when the last trip was moved to the other car (Colin, 24 Oct)", async () => {
    await rememberCars([dromore, aughnacloy]);
    lastTripCar = "aughnacloy";
    expect(await carForRecordedTrip()).toBe("dromore");
  });

  it("falls back to the last trip's car when the phone hasn't loaded the car list", async () => {
    lastTripCar = "aughnacloy";
    expect(await carForRecordedTrip()).toBe("aughnacloy");
  });

  it("falls back to the last trip's car with two cars and no primary", async () => {
    await rememberCars([{ id: "a" }, { id: "b" }]);
    lastTripCar = "b";
    expect(await carForRecordedTrip()).toBe("b");
  });

  it("gives no car when there is nothing to go on", async () => {
    expect(await carForRecordedTrip()).toBeUndefined();
  });

  it("forgets the car on sign out", async () => {
    await rememberCars([dromore]);
    await forgetCars();
    expect(await carForRecordedTrip()).toBeUndefined();
  });
});
