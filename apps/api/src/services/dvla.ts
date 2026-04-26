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
}

export class DvlaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "DvlaError";
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
    throw new DvlaError("DVLA_API_KEY not configured", 503);
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
    throw new DvlaError("DVLA network error", 502, err);
  }

  if (response.status === 404) {
    throw new DvlaError("Vehicle not found at DVLA", 404);
  }
  if (response.status === 403) {
    throw new DvlaError("DVLA authentication failed", 502);
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
  };
}
