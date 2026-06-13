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

// ── Phase B: zone-crossing detection ─────────────────────────────────────────
//
// Boundary polygons for the charging zones, used to flag when a recorded trip's
// route passed through one. APPROXIMATE — simplified outlines, not the official
// boundaries (which are free GeoJSON on data.gov.uk and should replace these
// before heavy promotion). Because they're approximate, detection is a PROMPT
// to the user ("did you pay the charge?"), never an automatic bill. Each ring is
// a closed list of [lng, lat] vertices.
type Ring = [number, number][];

const ZONE_BOUNDARIES: Record<string, Ring> = {
  // London ULEZ = all 32 boroughs (Aug 2023 expansion). Coarse polygon roughly
  // following the Greater London outline.
  "london-ulez": [
    [-0.510, 51.46], [-0.40, 51.62], [-0.18, 51.69], [0.06, 51.67],
    [0.28, 51.60], [0.33, 51.48], [0.20, 51.36], [0.02, 51.29],
    [-0.20, 51.28], [-0.42, 51.34], [-0.510, 51.46],
  ],
  // Compact city-centre CAZs — small central polygons around each ring road.
  birmingham: [[-1.918, 52.464], [-1.918, 52.494], [-1.868, 52.494], [-1.868, 52.464], [-1.918, 52.464]],
  bristol: [[-2.625, 51.440], [-2.625, 51.470], [-2.565, 51.470], [-2.565, 51.440], [-2.625, 51.440]],
  bath: [[-2.375, 51.371], [-2.375, 51.393], [-2.343, 51.393], [-2.343, 51.371], [-2.375, 51.371]],
  sheffield: [[-1.485, 53.366], [-1.485, 53.396], [-1.448, 53.396], [-1.448, 53.366], [-1.485, 53.366]],
  // Bradford CAZ covers the wider urban area (outer ring) — a larger box.
  bradford: [[-1.805, 53.755], [-1.805, 53.825], [-1.715, 53.825], [-1.715, 53.755], [-1.805, 53.755]],
  tyneside: [[-1.635, 54.948], [-1.635, 54.985], [-1.585, 54.985], [-1.585, 54.948], [-1.635, 54.948]],
  portsmouth: [[-1.105, 50.778], [-1.105, 50.820], [-1.055, 50.820], [-1.055, 50.778], [-1.105, 50.778]],
};

/** Ray-casting point-in-polygon. point = [lng, lat]. */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Cheap bounding-box pre-check so we only ray-cast against plausible zones. */
function ringBounds(ring: Ring): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Return the ids of charging zones whose boundary a trip's route passed
 * through. Tests every supplied coordinate (with a bbox fast-path); a single
 * point inside the zone counts as a crossing.
 */
export function detectCleanAirZoneCrossings(coords: { lat: number; lng: number }[]): string[] {
  if (!coords || coords.length === 0) return [];
  const hits = new Set<string>();
  const bounds = Object.entries(ZONE_BOUNDARIES).map(([id, ring]) => ({ id, ring, b: ringBounds(ring) }));
  for (const { lat, lng } of coords) {
    if (lat == null || lng == null) continue;
    for (const z of bounds) {
      if (hits.has(z.id)) continue;
      const [minX, minY, maxX, maxY] = z.b;
      if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
      if (pointInRing(lng, lat, z.ring)) hits.add(z.id);
    }
    if (hits.size === bounds.length) break;
  }
  return [...hits];
}

export interface CazTripCharge {
  zoneId: string;
  name: string;
  city: string;
  chargePence: number;
  url: string;
}

export interface CazTripAssessment {
  /** True when the vehicle wouldn't be charged anywhere (compliant / zero-emission). */
  compliant: boolean;
  confidence: CazConfidence;
  /** Chargeable zones this trip's route crossed (empty when compliant or no crossings). */
  charges: CazTripCharge[];
}

/**
 * Combine vehicle compliance with route detection: which Clean Air Zone charges
 * a given trip is likely to have incurred. Returns no charges when the vehicle
 * is compliant — there's nothing to pay — so the client only prompts when money
 * is genuinely at stake. Pure; safe to run server- or client-side.
 */
export function assessTripCleanAirZoneCharges(
  input: CazComplianceInput & { coords: { lat: number; lng: number }[] }
): CazTripAssessment {
  const compliance = assessCleanAirZones(input);
  if (compliance.verdict === "compliant") {
    return { compliant: true, confidence: compliance.confidence, charges: [] };
  }
  const crossed = new Set(detectCleanAirZoneCrossings(input.coords));
  const charges: CazTripCharge[] = compliance.zones
    .filter((z) => crossed.has(z.id) && z.chargesThisVehicle && z.chargePence != null)
    .map((z) => ({ zoneId: z.id, name: z.name, city: z.city, chargePence: z.chargePence as number, url: z.url }));
  return { compliant: false, confidence: compliance.confidence, charges };
}
