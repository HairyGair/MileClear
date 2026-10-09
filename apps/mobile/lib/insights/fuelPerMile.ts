// The one cost per mile for the Go deeper "Running costs" card. Since 9 Oct
// 2026 /analytics/fuel-cost keeps `fuelCostPerMilePence` for the fill-up
// figure only (null without one) and sends the MPG estimate separately, the
// same rate the Fuel & Running Costs card shows (docs/insights-oct2026/NUMBERS.md).
// Reading only the first field left the card on a blank figure while the card
// above it said 13.5p.

import type { FuelCostBreakdown } from "@mileclear/shared";

export interface FuelPerMile {
  pence: number;
  isEstimate: boolean;
}

export function fuelPerMile(
  fuel: Pick<FuelCostBreakdown, "fuelCostPerMilePence" | "estimatedFuelCostPerMilePence">
): FuelPerMile | null {
  if (fuel.fuelCostPerMilePence != null && fuel.fuelCostPerMilePence > 0) {
    return { pence: fuel.fuelCostPerMilePence, isEstimate: false };
  }
  const est = fuel.estimatedFuelCostPerMilePence;
  if (est != null && est > 0) return { pence: est, isEstimate: true };
  return null;
}
