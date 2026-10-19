// Which pump price the fuel map colours its pins by (10 Oct 2026). It used to
// be unleaded for everyone, so a diesel driver saw petrol pins. Pure so it can
// be tested without the map.
// 19 Oct 2026: all four grades the price feeds carry (Matt asked for super
// unleaded); the driver picks one on the fuel tab and the list and map follow.

export interface MapFuel {
  /** Key into FuelStation.prices. */
  key: "E10" | "E5" | "B7" | "SDV";
  /** What the chip and the pin's callout call it. */
  label: "Unleaded" | "Super unleaded" | "Diesel" | "Premium diesel";
}

export const UNLEADED: MapFuel = { key: "E10", label: "Unleaded" };
export const SUPER_UNLEADED: MapFuel = { key: "E5", label: "Super unleaded" };
export const DIESEL: MapFuel = { key: "B7", label: "Diesel" };
export const PREMIUM_DIESEL: MapFuel = { key: "SDV", label: "Premium diesel" };

/** The chips on the fuel tab, in this order. */
export const ALL_FUELS: MapFuel[] = [UNLEADED, SUPER_UNLEADED, DIESEL, PREMIUM_DIESEL];

export function fuelByKey(key: string | null | undefined): MapFuel | null {
  return ALL_FUELS.find((f) => f.key === key) ?? null;
}

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
