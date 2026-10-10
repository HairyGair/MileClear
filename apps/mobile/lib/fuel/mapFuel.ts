// Which pump price the fuel map colours its pins by (10 Oct 2026). It used to
// be unleaded for everyone, so a diesel driver saw petrol pins. Pure so it can
// be tested without the map.

export interface MapFuel {
  /** Key into FuelStation.prices. */
  key: "E10" | "B7";
  /** What the pin's callout calls it. */
  label: "Unleaded" | "Diesel";
}

export const UNLEADED: MapFuel = { key: "E10", label: "Unleaded" };
export const DIESEL: MapFuel = { key: "B7", label: "Diesel" };

/**
 * The primary vehicle decides (else the newest, the same rule as the server's
 * cheapest-fuel line). Diesel gets diesel; petrol, hybrid, electric, unknown
 * or no vehicle keep unleaded, the map's old behaviour.
 */
export function mapFuelFor(
  vehicles: { fuelType?: string | null; isPrimary?: boolean; createdAt?: string }[]
): MapFuel {
  if (vehicles.length === 0) return UNLEADED;
  const v =
    vehicles.find((x) => x.isPrimary) ??
    [...vehicles].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  return (v.fuelType ?? "").toLowerCase() === "diesel" ? DIESEL : UNLEADED;
}
