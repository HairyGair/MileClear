// UK Clean Air Zone (CAZ) + London ULEZ compliance.
//
// There is NO public by-registration compliance API — TfL's was withdrawn in
// 2022. Every commercial ULEZ checker computes compliance the same way we do
// here: from the vehicle's Euro emissions standard + fuel type, applying the
// published zone rules. We already pull euroStatus + fuel type + first-
// registration from DVLA, so this is pure logic on data we hold.
//
// IMPORTANT — present results as GUIDANCE, not gospel. DVLA's euroStatus is
// often blank for pre-2015 vehicles (exactly the non-compliant cohort), so a
// registration-date fallback is used when it is, and the confidence is flagged
// accordingly. The authoritative check is always the official gov.uk / TfL
// checker; we link out to it.

/** Emission standard thresholds for a "clean" vehicle, shared by ULEZ and the
 *  CAZ network (Class C/D apply the same petrol/diesel standards). */
const MIN_EURO_PETROL = 4; // petrol cars/vans: Euro 4 (broadly Jan 2006+)
const MIN_EURO_DIESEL = 6; // diesel cars/vans: Euro 6 (broadly Sep 2015+)
const MIN_EURO_MOTORCYCLE = 3; // Euro 3 (broadly 2007+)

// Registration-date fallbacks (first day the standard became universal) — used
// only when euroStatus is missing. Deliberately conservative: a vehicle
// registered AFTER the date is treated as meeting the standard.
const PETROL_CLEAN_FROM = "2006-01"; // Euro 4 mandatory for new petrol cars
const DIESEL_CLEAN_FROM = "2015-09"; // Euro 6 mandatory for new diesel cars
const MOTORCYCLE_CLEAN_FROM = "2007-01";

export type CazVehicleClass = "car" | "van" | "motorcycle";
export type CazConfidence = "confirmed" | "estimated" | "unknown";
export type CazVerdict = "compliant" | "non_compliant" | "unknown";

export interface CleanAirZone {
  /** Stable id for keys / deep links. */
  id: string;
  /** Display name, e.g. "London ULEZ". */
  name: string;
  /** Short city label. */
  city: string;
  /** CAZ class (B/C/D) or "ULEZ". Informational. */
  class: "ULEZ" | "B" | "C" | "D";
  /** Daily charge in pence for a non-compliant CAR, or null if cars aren't
   *  charged in this zone. */
  carChargePence: number | null;
  /** Daily charge in pence for a non-compliant VAN/LGV (≤3.5t), or null. */
  vanChargePence: number | null;
  /** Official checker / info URL. */
  url: string;
}

// The charging zones operating in the UK as of 2026. Charges + classes are
// amended periodically by each authority — verify against the official pages
// before relying on a specific amount; this list is for guidance + linking.
export const CLEAN_AIR_ZONES: CleanAirZone[] = [
  { id: "london-ulez", name: "London ULEZ", city: "London", class: "ULEZ", carChargePence: 1250, vanChargePence: 1250, url: "https://tfl.gov.uk/modes/driving/ultra-low-emission-zone" },
  { id: "birmingham", name: "Birmingham Clean Air Zone", city: "Birmingham", class: "D", carChargePence: 800, vanChargePence: 800, url: "https://www.brumbreathes.co.uk/" },
  { id: "bristol", name: "Bristol Clean Air Zone", city: "Bristol", class: "D", carChargePence: 900, vanChargePence: 900, url: "https://www.cleanairforbristol.org/" },
  { id: "bath", name: "Bath Clean Air Zone", city: "Bath", class: "C", carChargePence: null, vanChargePence: 900, url: "https://www.bathnes.gov.uk/bathbreathes" },
  { id: "bradford", name: "Bradford Clean Air Zone", city: "Bradford", class: "C", carChargePence: null, vanChargePence: 900, url: "https://www.bradford.gov.uk/breathe-better-bradford/" },
  { id: "sheffield", name: "Sheffield Clean Air Zone", city: "Sheffield", class: "C", carChargePence: null, vanChargePence: 1000, url: "https://www.sheffield.gov.uk/cleanairzone" },
  { id: "tyneside", name: "Newcastle/Gateshead Clean Air Zone", city: "Tyneside", class: "C", carChargePence: null, vanChargePence: 1250, url: "https://www.breathe-cleanair.com/" },
  { id: "portsmouth", name: "Portsmouth Clean Air Zone", city: "Portsmouth", class: "B", carChargePence: null, vanChargePence: null, url: "https://cleanairportsmouth.co.uk/" },
];

export interface CazComplianceInput {
  /** DVLA euroStatus string, e.g. "EURO 6", "EURO 6 AD", "EURO 4". */
  euroStatus?: string | null;
  /** DVLA fuelType — accepts raw DVLA values ("PETROL", "DIESEL", "ELECTRICITY",
   *  "HYBRID ELECTRIC") or our normalised ones ("petrol", "diesel", etc.). */
  fuelType?: string | null;
  /** DVLA monthOfFirstRegistration, "YYYY-MM". Fallback when euroStatus blank. */
  firstRegistration?: string | null;
  /** Our vehicle type, used to pick the right standard + charge column. */
  vehicleClass?: CazVehicleClass;
}

export interface CazZoneResult extends CleanAirZone {
  /** Whether THIS vehicle type is charged in THIS zone when non-compliant. */
  chargesThisVehicle: boolean;
  /** The applicable daily charge in pence for this vehicle type, or null. */
  chargePence: number | null;
}

export interface CazAssessment {
  verdict: CazVerdict;
  confidence: CazConfidence;
  /** One-line plain-English summary for the badge. */
  summary: string;
  /** Whether the vehicle is zero-emission (always compliant). */
  zeroEmission: boolean;
  /** Per-zone breakdown for the vehicle. */
  zones: CazZoneResult[];
}

/** Parse the leading Euro number from a DVLA euroStatus string. */
function parseEuro(euroStatus?: string | null): number | null {
  if (!euroStatus) return null;
  const m = euroStatus.match(/(\d)/);
  return m ? parseInt(m[1], 10) : null;
}

function normaliseFuel(fuel?: string | null): "petrol" | "diesel" | "electric" | "other" {
  const f = (fuel ?? "").toLowerCase();
  if (f.includes("electric") && !f.includes("hybrid")) return "electric";
  if (f.includes("diesel")) return "diesel"; // incl. "diesel hybrid"
  if (f.includes("petrol") || f.includes("hybrid")) return "petrol"; // petrol hybrids meet petrol rules
  return "other";
}

/** "YYYY-MM" >= "YYYY-MM" string compare (lexicographic works for this format). */
function regOnOrAfter(reg: string | null | undefined, threshold: string): boolean | null {
  if (!reg || !/^\d{4}-\d{2}/.test(reg)) return null;
  return reg.slice(0, 7) >= threshold;
}

/**
 * Assess a vehicle's Clean Air Zone / ULEZ compliance from DVLA-sourced data.
 * Pure + side-effect-free; safe to run client-side (mobile/web) or server-side.
 */
export function assessCleanAirZones(input: CazComplianceInput): CazAssessment {
  const fuel = normaliseFuel(input.fuelType);
  const vehicleClass: CazVehicleClass = input.vehicleClass ?? "car";

  const zonesFor = (verdict: CazVerdict, confidence: CazConfidence, summary: string, zeroEmission: boolean): CazAssessment => ({
    verdict,
    confidence,
    summary,
    zeroEmission,
    zones: CLEAN_AIR_ZONES.map((z) => {
      const chargePence = vehicleClass === "van" ? z.vanChargePence : vehicleClass === "motorcycle" ? null : z.carChargePence;
      return { ...z, chargesThisVehicle: chargePence != null, chargePence };
    }),
  });

  // Zero-emission → compliant everywhere, with certainty.
  if (fuel === "electric") {
    return zonesFor("compliant", "confirmed", "Zero-emission — compliant in every UK Clean Air Zone and ULEZ.", true);
  }

  const minEuro =
    vehicleClass === "motorcycle" ? MIN_EURO_MOTORCYCLE : fuel === "diesel" ? MIN_EURO_DIESEL : MIN_EURO_PETROL;

  // Primary signal: euroStatus.
  const euro = parseEuro(input.euroStatus);
  if (euro != null) {
    const compliant = euro >= minEuro;
    return zonesFor(
      compliant ? "compliant" : "non_compliant",
      "confirmed",
      compliant
        ? `Euro ${euro} — meets the standard for ULEZ and the Clean Air Zones.`
        : `Euro ${euro} — below the ULEZ/CAZ standard, so a daily charge may apply.`,
      false
    );
  }

  // Fallback: registration date. Flagged as an estimate.
  const threshold =
    vehicleClass === "motorcycle" ? MOTORCYCLE_CLEAN_FROM : fuel === "diesel" ? DIESEL_CLEAN_FROM : PETROL_CLEAN_FROM;
  const byDate = regOnOrAfter(input.firstRegistration, threshold);
  if (byDate != null) {
    return zonesFor(
      byDate ? "compliant" : "non_compliant",
      "estimated",
      byDate
        ? "Likely compliant based on its registration date — confirm with the official checker."
        : "Likely chargeable based on its registration date — confirm with the official checker.",
      false
    );
  }

  // Neither signal available.
  return zonesFor(
    "unknown",
    "unknown",
    "We couldn't determine this vehicle's emissions standard — check the official ULEZ/CAZ checker.",
    false
  );
}
