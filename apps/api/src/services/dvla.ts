// Thin wrapper around the DVLA Vehicle Enquiry Service (VES) API.
// Used by both the lookup route (when a user adds a vehicle) and the
// vehicle-reminders cron (weekly refresh of MOT / tax expiry dates).

export interface DvlaVehicleInfo {
  registrationNumber: string;
  make: string | null;
  yearOfManufacture: number | null;
  fuelType: string | null;
  colour: string | null;
  engineCapacity: number | null;
  co2Emissions: number | null;
  taxStatus: string | null;
  motStatus: string | null;
  motExpiryDate: string | null;
  taxDueDate: string | null;
  // Emissions data for Clean Air Zone / ULEZ compliance.
  euroStatus: string | null;
  monthOfFirstRegistration: string | null; // "YYYY-MM"
}

/**
 * Why a lookup failed. "not_found" and "invalid" are about the plate and will
 * not change until the driver edits it. The rest are about the DVLA or us and
 * are worth retrying soon: "rate_limited" means we asked too fast.
 */
export type DvlaFailure =
  | "not_found"
  | "invalid"
  | "rate_limited"
  | "auth"
  | "upstream"
  | "network"
  | "config";

export class DvlaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly cause?: unknown,
    public readonly kind: DvlaFailure = "upstream"
  ) {
    super(message);
    this.name = "DvlaError";
  }

  /** True when the plate itself is the problem, not the DVLA. */
  get isPlateProblem(): boolean {
    return this.kind === "not_found" || this.kind === "invalid";
  }
}

/**
 * Fetch DVLA vehicle data for a UK registration plate.
 *
 * Throws DvlaError on 404 (vehicle not found), 403 (key invalid), or any
 * non-OK upstream response. Returns the parsed payload on success.
 *
 * Callers are responsible for caching / rate-limiting if needed.
 */
export async function fetchDvlaVehicleInfo(
  registrationNumber: string
): Promise<DvlaVehicleInfo> {
  const apiKey = process.env.DVLA_API_KEY;
  if (!apiKey) {
    throw new DvlaError("DVLA_API_KEY not configured", 503, undefined, "config");
  }

  let response: Response;
  try {
    response = await fetch(
      "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ registrationNumber }),
      }
    );
  } catch (err) {
    throw new DvlaError("DVLA network error", 502, err, "network");
  }

  if (response.status === 404) {
    throw new DvlaError("Vehicle not found at DVLA", 404, undefined, "not_found");
  }
  // The DVLA answers 400 for a registration it will not accept at all (wrong
  // shape, a foreign plate).
  if (response.status === 400) {
    throw new DvlaError("DVLA rejected the registration", 400, undefined, "invalid");
  }
  if (response.status === 429) {
    throw new DvlaError("DVLA rate limit reached", 429, undefined, "rate_limited");
  }
  if (response.status === 403) {
    throw new DvlaError("DVLA authentication failed", 502, undefined, "auth");
  }
  if (!response.ok) {
    throw new DvlaError(
      `DVLA API error: ${response.status} ${response.statusText}`,
      502
    );
  }

  const dvla = (await response.json()) as Record<string, unknown>;

  return {
    registrationNumber,
    make: dvla.make ? String(dvla.make) : null,
    yearOfManufacture:
      typeof dvla.yearOfManufacture === "number" ? dvla.yearOfManufacture : null,
    fuelType: dvla.fuelType ? String(dvla.fuelType) : null,
    colour: dvla.colour ? String(dvla.colour) : null,
    engineCapacity:
      typeof dvla.engineCapacity === "number" ? dvla.engineCapacity : null,
    co2Emissions:
      typeof dvla.co2Emissions === "number" ? dvla.co2Emissions : null,
    taxStatus: dvla.taxStatus ? String(dvla.taxStatus) : null,
    motStatus: dvla.motStatus ? String(dvla.motStatus) : null,
    motExpiryDate: dvla.motExpiryDate ? String(dvla.motExpiryDate) : null,
    taxDueDate: dvla.taxDueDate ? String(dvla.taxDueDate) : null,
    euroStatus: dvla.euroStatus ? String(dvla.euroStatus) : null,
    monthOfFirstRegistration: dvla.monthOfFirstRegistration
      ? String(dvla.monthOfFirstRegistration)
      : null,
  };
}
