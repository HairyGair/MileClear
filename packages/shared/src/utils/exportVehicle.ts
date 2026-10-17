/**
 * One-car trip reports (Colin, 17 Oct 2026: "How can I produce reports for
 * two cars?"). The CSV and the Trip Report PDF take an optional vehicleId;
 * these helpers name the car the same way on the server, the app and the
 * website, so two downloads are easy to tell apart.
 */

export interface ExportVehicleLike {
  id: string;
  make: string;
  model: string;
  registrationPlate?: string | null;
}

/** "Nissan Qashqai (AB12 CDE)", or "Nissan Qashqai" with no plate. */
export function exportVehicleLabel(v: Pick<ExportVehicleLike, "make" | "model" | "registrationPlate">): string {
  const name = `${v.make ?? ""} ${v.model ?? ""}`.replace(/\s+/g, " ").trim() || "Vehicle";
  const plate = (v.registrationPlate ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return plate ? `${name} (${plate})` : name;
}

/**
 * File-name safe: lower case letters, digits and single hyphens only, at most
 * 40 characters. "nissan-qashqai-ab12cde". Never empty ("vehicle").
 */
export function exportVehicleSlug(v: Pick<ExportVehicleLike, "make" | "model" | "registrationPlate">): string {
  const plate = (v.registrationPlate ?? "").replace(/\s+/g, "");
  const raw = [v.make ?? "", v.model ?? "", plate].join(" ").toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "vehicle";
}

export interface ExportVehicleChoice {
  /** undefined means every car. */
  vehicleId: string | undefined;
  label: string;
}

/**
 * The "Which vehicle?" choices for the CSV and Trip Report: "All vehicles" first,
 * then each vehicle. Null when there is nothing to choose (0 or 1 vehicle), so
 * the download goes straight through as before.
 */
export function exportVehicleChoices(vehicles: ExportVehicleLike[]): ExportVehicleChoice[] | null {
  if (vehicles.length < 2) return null;
  return [
    { vehicleId: undefined, label: "All vehicles" },
    ...vehicles.map((v) => ({ vehicleId: v.id, label: exportVehicleLabel(v) })),
  ];
}
