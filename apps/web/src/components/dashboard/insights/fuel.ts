import type { FuelLogWithVehicle } from "@mileclear/shared";
import { api } from "@/lib/api";

export interface FuelMonth {
  fuelPence: number;
  fuelFills: number;
  chargePence: number;
  chargeSessions: number;
  chargeKwh: number;
}

/** This month's fill-ups and charges, split by whether the vehicle is electric. */
export async function fetchFuelMonth(now: Date = new Date()): Promise<FuelMonth> {
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const res = await api.get<{ data: FuelLogWithVehicle[] }>(`/fuel/logs?pageSize=100&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const out: FuelMonth = { fuelPence: 0, fuelFills: 0, chargePence: 0, chargeSessions: 0, chargeKwh: 0 };
  for (const l of res.data ?? []) {
    if (l.vehicle?.fuelType === "electric") {
      out.chargePence += l.costPence;
      out.chargeSessions += 1;
      out.chargeKwh += l.litres;
    } else {
      out.fuelPence += l.costPence;
      out.fuelFills += 1;
    }
  }
  return out;
}
