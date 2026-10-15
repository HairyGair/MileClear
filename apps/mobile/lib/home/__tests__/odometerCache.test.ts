import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory tracking_state table.
const store = new Map<string, string>();
vi.mock("../../db/index", () => ({
  getDatabase: async () => ({
    getFirstAsync: async (_sql: string, [key]: [string]) => (store.has(key) ? { value: store.get(key) } : null),
    runAsync: async (sql: string, params: string[]) => {
      if (sql.startsWith("DELETE")) store.delete(params[0]);
      else store.set(params[0], params[1]);
    },
  }),
}));

import {
  HOME_ODOMETER_CACHE_KEY,
  clearHomeOdometerCache,
  readHomeOdometerCache,
  writeHomeOdometerCache,
} from "../odometerCache";
import type { HomeOdometerRow } from "../odometerCard";

const rows: HomeOdometerRow[] = [{ vehicleId: "v1", name: "Ford Transit", miles: 41872, isEstimated: true, basis: null }];

describe("Home odometer saved figure and sign out", () => {
  beforeEach(() => store.clear());

  it("gives the saved figure back to the same driver", async () => {
    await writeHomeOdometerCache("u1", rows);
    expect(await readHomeOdometerCache("u1")).toEqual(rows);
  });

  it("never gives one driver's vehicles to the next account on the phone", async () => {
    await writeHomeOdometerCache("u1", rows);
    expect(await readHomeOdometerCache("u2")).toBeNull();
  });

  it("forgets it on sign out", async () => {
    await writeHomeOdometerCache("u1", rows);
    await clearHomeOdometerCache();
    expect(store.has(HOME_ODOMETER_CACHE_KEY)).toBe(false);
    expect(await readHomeOdometerCache("u1")).toBeNull();
  });

  it("saves nothing and reads nothing with no account", async () => {
    await writeHomeOdometerCache("", rows);
    expect(store.size).toBe(0);
    expect(await readHomeOdometerCache("")).toBeNull();
  });
});
