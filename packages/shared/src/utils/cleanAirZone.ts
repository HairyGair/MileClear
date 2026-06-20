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
// route passed through one. Each ring is a closed list of [lng, lat] vertices.
//
// Provenance — every zone that can charge a CAR or VAN now uses an OFFICIAL
// boundary, simplified + grid-verified against the source polygon:
//   • london-ulez — OFFICIAL (GLA, data.london.gov.uk), reprojected from EPSG:27700.
//   • bristol     — OFFICIAL (Open Data Bristol).
//   • bradford    — OFFICIAL (City of Bradford MDC ArcGIS).
//   • birmingham, bath, sheffield, tyneside — OFFICIAL (OpenStreetMap zone
//     polygons; ODbL → attribute OpenStreetMap contributors wherever surfaced).
//   • portsmouth  — APPROXIMATE box, intentionally: it's Class B (buses/coaches/
//     taxis/HGVs only), so it never charges a car or van and the boundary is
//     never used to raise a charge for a MileClear user.
//
// Because some are still approximate, detection is always a PROMPT to the user
// ("did you pay the charge?"), never an automatic bill.
type Ring = [number, number][];

const ZONE_BOUNDARIES: Record<string, Ring> = {
  // London ULEZ = all of Greater London (Aug 2023 expansion). OFFICIAL boundary
  // from the GLA "London Wide Ultra Low Emission Zone 2023" dataset
  // (data.london.gov.uk, OGL v3.0), reprojected EPSG:27700→WGS84 and simplified
  // (Douglas-Peucker, ~600m) to 140 vertices. Verified against 17 in/out points
  // (boroughs in; Watford/Staines/Epsom/Dartford/Epping out).
  "london-ulez": [
    [-0.4614, 51.4956], [-0.4095, 51.4924], [-0.4897, 51.4955], [-0.4833, 51.5072], [-0.4908, 51.5265], [-0.4819, 51.5304],
    [-0.4955, 51.5386], [-0.4639, 51.5637], [-0.4714, 51.584], [-0.4938, 51.584], [-0.4996, 51.5922], [-0.4974, 51.6316],
    [-0.473, 51.619], [-0.4794, 51.6035], [-0.4501, 51.6146], [-0.4161, 51.6107], [-0.3425, 51.6208], [-0.3173, 51.6399],
    [-0.2925, 51.6216], [-0.3046, 51.6359], [-0.2879, 51.6235], [-0.2994, 51.6351], [-0.2725, 51.6376], [-0.2635, 51.6284],
    [-0.2729, 51.6421], [-0.2446, 51.641], [-0.2191, 51.6525], [-0.2259, 51.6575], [-0.2199, 51.6606], [-0.2017, 51.6564],
    [-0.1955, 51.6684], [-0.1606, 51.6716], [-0.1635, 51.6858], [-0.1249, 51.6758], [-0.108, 51.6914], [-0.0589, 51.6783],
    [-0.0111, 51.6801], [-0.0127, 51.6359], [0.0253, 51.6352], [0.0254, 51.6189], [0.0544, 51.6176], [0.0381, 51.5944],
    [0.0099, 51.5958], [0.0351, 51.5938], [0.0443, 51.5751], [0.039, 51.5922], [0.0526, 51.6119], [0.0856, 51.5934],
    [0.0834, 51.6065], [0.0985, 51.6149], [0.1169, 51.6167], [0.1266, 51.6102], [0.1232, 51.6059], [0.129, 51.6085],
    [0.1193, 51.6153], [0.1341, 51.6231], [0.1823, 51.6258], [0.1894, 51.6244], [0.1835, 51.6158], [0.2079, 51.61],
    [0.2338, 51.6255], [0.2611, 51.6088], [0.2447, 51.6024], [0.2581, 51.6065], [0.2541, 51.5904], [0.2702, 51.5896],
    [0.2838, 51.5732], [0.2532, 51.5786], [0.2851, 51.5714], [0.29, 51.5614], [0.279, 51.5338], [0.2257, 51.5246],
    [0.2268, 51.5004], [0.1836, 51.5116], [0.2289, 51.4992], [0.2104, 51.4896], [0.2221, 51.4812], [0.2002, 51.4525],
    [0.1709, 51.4414], [0.1536, 51.447], [0.1708, 51.4411], [0.1476, 51.4356], [0.1661, 51.4352], [0.1475, 51.4092],
    [0.1124, 51.4133], [0.15, 51.4022], [0.127, 51.3809], [0.1479, 51.3659], [0.1448, 51.3555], [0.1108, 51.3447],
    [0.1066, 51.3274], [0.0748, 51.3158], [0.0871, 51.2991], [0.0545, 51.2921], [0.0424, 51.2927], [0.0292, 51.3134],
    [0.0327, 51.3074], [0.015, 51.2919], [0.0031, 51.3323], [-0.0137, 51.3317], [-0.0373, 51.354], [-0.021, 51.338],
    [-0.0503, 51.3327], [-0.0631, 51.3434], [-0.0782, 51.3359], [-0.0695, 51.3259], [-0.0814, 51.3168], [-0.1175, 51.3381],
    [-0.0834, 51.3101], [-0.1009, 51.2964], [-0.1141, 51.298], [-0.1383, 51.3169], [-0.1438, 51.3121], [-0.1411, 51.32],
    [-0.1609, 51.3173], [-0.1677, 51.3348], [-0.2018, 51.3399], [-0.2135, 51.3587], [-0.223, 51.3574], [-0.233, 51.3662],
    [-0.2279, 51.3712], [-0.254, 51.3864], [-0.2534, 51.3949], [-0.2873, 51.3743], [-0.3036, 51.3752], [-0.301, 51.3869],
    [-0.328, 51.3919], [-0.3528, 51.4108], [-0.3863, 51.4145], [-0.4075, 51.4235], [-0.4019, 51.4305], [-0.4274, 51.431],
    [-0.426, 51.4375], [-0.4541, 51.4385], [-0.4467, 51.4495], [-0.4928, 51.4633], [-0.4927, 51.4837], [-0.5001, 51.4839],
    [-0.4897, 51.4937], [-0.4614, 51.4956],
  ],
  // Compact city-centre CAZs — small central polygons around each ring road.
  // Birmingham CAZ (Class D, charges cars) — inside the A4540 Middleway ring.
  // Boundary from OpenStreetMap way 770591846 (boundary=low_emission_zone,
  // operator "Birmingham City Council"; ODbL — attribute OSM contributors),
  // simplified to 29 vertices (99.7% grid agreement). The council's own INSPIRE
  // WFS was unreachable; this OSM zone polygon is the authoritative boundary as
  // mapped. Verified: New St / Jewellery Quarter / Digbeth in; Edgbaston / Aston
  // / Selly Oak out.
  birmingham: [
    [-1.8921, 52.4922], [-1.8897, 52.4922], [-1.8871, 52.491], [-1.8802, 52.4831], [-1.8774, 52.4804], [-1.8764, 52.479],
    [-1.8751, 52.4749], [-1.8758, 52.4718], [-1.8783, 52.4691], [-1.8827, 52.4667], [-1.8869, 52.4637], [-1.8923, 52.4649],
    [-1.8979, 52.4669], [-1.905, 52.4682], [-1.914, 52.472], [-1.9177, 52.4727], [-1.9182, 52.4735], [-1.9223, 52.4751],
    [-1.9256, 52.477], [-1.9265, 52.4786], [-1.9257, 52.48], [-1.9215, 52.4836], [-1.919, 52.4848], [-1.9173, 52.4876],
    [-1.9155, 52.4917], [-1.9124, 52.4931], [-1.9062, 52.4936], [-1.895, 52.4922], [-1.8921, 52.4922],
  ],
  // Bristol CAZ — OFFICIAL boundary from Open Data Bristol (opendata.bristol.gov.uk,
  // ArcGIS, already WGS84), simplified to 73 vertices (99.2% grid agreement vs the
  // source polygon).
  bristol: [
    [-2.5821, 51.4607], [-2.5814, 51.4595], [-2.5828, 51.4586], [-2.5824, 51.458], [-2.5841, 51.457], [-2.5822, 51.4562],
    [-2.5803, 51.4563], [-2.5803, 51.4558], [-2.5831, 51.4553], [-2.5837, 51.4534], [-2.5832, 51.4531], [-2.5826, 51.4521],
    [-2.5797, 51.4508], [-2.5813, 51.4502], [-2.5811, 51.4483], [-2.5816, 51.4474], [-2.5781, 51.444], [-2.581, 51.4465],
    [-2.5892, 51.4443], [-2.5912, 51.4449], [-2.5922, 51.4448], [-2.592, 51.4454], [-2.5931, 51.4456], [-2.598, 51.445],
    [-2.606, 51.446], [-2.6095, 51.4452], [-2.6117, 51.4455], [-2.6133, 51.4446], [-2.6149, 51.4449], [-2.6179, 51.4431],
    [-2.6202, 51.4442], [-2.6218, 51.4441], [-2.6239, 51.4417], [-2.6249, 51.4413], [-2.6245, 51.4401], [-2.6261, 51.4409],
    [-2.6268, 51.4414], [-2.6251, 51.4414], [-2.6232, 51.4447], [-2.6243, 51.4462], [-2.6235, 51.4475], [-2.624, 51.4481],
    [-2.624, 51.4497], [-2.6266, 51.4527], [-2.6275, 51.4556], [-2.6294, 51.4572], [-2.6291, 51.4611], [-2.6271, 51.4624],
    [-2.6266, 51.4625], [-2.6291, 51.4611], [-2.6296, 51.4581], [-2.627, 51.4553], [-2.6265, 51.4531], [-2.6247, 51.4508],
    [-2.6207, 51.4518], [-2.6172, 51.4501], [-2.6129, 51.4498], [-2.6049, 51.4521], [-2.6028, 51.4542], [-2.6007, 51.455],
    [-2.6016, 51.4553], [-2.6011, 51.4559], [-2.6001, 51.4558], [-2.5992, 51.4569], [-2.5972, 51.4574], [-2.5936, 51.4602],
    [-2.5928, 51.4599], [-2.5906, 51.4613], [-2.5897, 51.46], [-2.5856, 51.4594], [-2.5855, 51.46], [-2.5844, 51.4597],
    [-2.5821, 51.4607],
  ],
  // Bath CAZ (Class C) — OFFICIAL, OpenStreetMap way 1146120795, 104 verts (99.2%).
  bath: [
    [-2.3749, 51.3789], [-2.374, 51.381], [-2.3746, 51.3809], [-2.3747, 51.3812], [-2.3749, 51.3814], [-2.3746, 51.3817],
    [-2.3729, 51.3815], [-2.3734, 51.3818], [-2.3714, 51.3826], [-2.372, 51.3831], [-2.376, 51.3845], [-2.3763, 51.3854],
    [-2.3784, 51.3858], [-2.3787, 51.3867], [-2.3786, 51.3885], [-2.3783, 51.3891], [-2.3766, 51.3891], [-2.375, 51.3912],
    [-2.3749, 51.3916], [-2.3733, 51.3921], [-2.3713, 51.3925], [-2.3681, 51.3925], [-2.3675, 51.3922], [-2.3678, 51.3917],
    [-2.368, 51.3914], [-2.3678, 51.3912], [-2.3664, 51.3916], [-2.3659, 51.3916], [-2.3643, 51.3911], [-2.3643, 51.3921],
    [-2.3641, 51.3924], [-2.363, 51.3926], [-2.3621, 51.3917], [-2.3606, 51.3923], [-2.3604, 51.3918], [-2.3595, 51.392],
    [-2.3573, 51.3918], [-2.3565, 51.3916], [-2.3546, 51.3906], [-2.354, 51.3901], [-2.3522, 51.3905], [-2.3488, 51.3906],
    [-2.3457, 51.3915], [-2.3454, 51.3901], [-2.3453, 51.3887], [-2.3449, 51.3882], [-2.3458, 51.3876], [-2.3456, 51.3873],
    [-2.3451, 51.3875], [-2.3445, 51.3873], [-2.342, 51.3878], [-2.3412, 51.3873], [-2.3425, 51.3859], [-2.343, 51.3859],
    [-2.3439, 51.3854], [-2.3444, 51.3848], [-2.3447, 51.3848], [-2.3448, 51.3854], [-2.3477, 51.3857], [-2.3479, 51.3848],
    [-2.3488, 51.3839], [-2.349, 51.3829], [-2.3497, 51.3828], [-2.3497, 51.3827], [-2.3494, 51.3823], [-2.3492, 51.3822],
    [-2.3491, 51.3821], [-2.3491, 51.3792], [-2.3511, 51.3775], [-2.3521, 51.377], [-2.3527, 51.3769], [-2.3529, 51.3766],
    [-2.3525, 51.3761], [-2.3527, 51.3761], [-2.3587, 51.3769], [-2.3604, 51.3769], [-2.3613, 51.3766], [-2.3645, 51.3769],
    [-2.367, 51.3763], [-2.3672, 51.3759], [-2.3656, 51.3757], [-2.3666, 51.3749], [-2.3668, 51.374], [-2.3689, 51.3739],
    [-2.3706, 51.3742], [-2.3716, 51.3738], [-2.3725, 51.3739], [-2.3722, 51.3748], [-2.3716, 51.3752], [-2.3698, 51.3746],
    [-2.3698, 51.3749], [-2.3687, 51.3754], [-2.3688, 51.3757], [-2.369, 51.3758], [-2.3692, 51.3763], [-2.3694, 51.3767],
    [-2.3687, 51.3769], [-2.3684, 51.3771], [-2.3682, 51.377], [-2.3677, 51.3768], [-2.3663, 51.3773], [-2.3653, 51.3775],
    [-2.3673, 51.378], [-2.3749, 51.3789],
  ],
  // Sheffield CAZ (Class C) — OFFICIAL, OpenStreetMap relation 16389126 (inner
  // ring road), outer ways stitched + simplified to 45 verts (99.3%).
  sheffield: [
    [-1.4843, 53.3826], [-1.4832, 53.3845], [-1.4776, 53.3886], [-1.4771, 53.3884], [-1.4763, 53.3886], [-1.4739, 53.3874],
    [-1.4699, 53.3873], [-1.469, 53.3878], [-1.4683, 53.3892], [-1.4696, 53.3898], [-1.469, 53.3897], [-1.4633, 53.389],
    [-1.4637, 53.3888], [-1.4619, 53.3878], [-1.4612, 53.3882], [-1.4616, 53.3873], [-1.4604, 53.3869], [-1.4591, 53.3868],
    [-1.4582, 53.3877], [-1.4585, 53.3868], [-1.4555, 53.3862], [-1.4534, 53.3853], [-1.4471, 53.3845], [-1.4554, 53.385],
    [-1.4589, 53.3838], [-1.4585, 53.3824], [-1.4606, 53.3821], [-1.4624, 53.3795], [-1.4648, 53.3769], [-1.4628, 53.3746],
    [-1.4715, 53.3729], [-1.4731, 53.3732], [-1.4743, 53.3728], [-1.4764, 53.3729], [-1.4769, 53.3725], [-1.4773, 53.3732],
    [-1.4786, 53.3739], [-1.4784, 53.3739], [-1.4784, 53.3745], [-1.4801, 53.3745], [-1.4841, 53.3775], [-1.4845, 53.378],
    [-1.4839, 53.3817], [-1.4836, 53.3821], [-1.4843, 53.3826],
  ],
  // Bradford CAZ (Class C) — OFFICIAL, City of Bradford MDC ArcGIS (CBMDC,
  // already WGS84), wider urban area, simplified to 86 verts (99.6%).
  bradford: [
    [-1.8025, 53.8415], [-1.8157, 53.8404], [-1.8117, 53.8392], [-1.8116, 53.8382], [-1.8165, 53.8356], [-1.8183, 53.8352],
    [-1.8166, 53.8335], [-1.811, 53.8331], [-1.8177, 53.8282], [-1.8186, 53.8264], [-1.8166, 53.826], [-1.8113, 53.8266],
    [-1.8093, 53.8261], [-1.808, 53.8248], [-1.8058, 53.8261], [-1.7978, 53.8281], [-1.7881, 53.827], [-1.7846, 53.8255],
    [-1.7814, 53.8254], [-1.7837, 53.8241], [-1.7831, 53.8237], [-1.7838, 53.8226], [-1.7833, 53.8219], [-1.7815, 53.8217],
    [-1.7827, 53.8195], [-1.7792, 53.8169], [-1.7796, 53.8148], [-1.7783, 53.8136], [-1.7732, 53.8112], [-1.7701, 53.8056],
    [-1.7728, 53.8055], [-1.7823, 53.8015], [-1.7852, 53.7992], [-1.7846, 53.7964], [-1.7851, 53.7962], [-1.7819, 53.7909],
    [-1.7822, 53.7907], [-1.7749, 53.7866], [-1.7835, 53.7825], [-1.7798, 53.7802], [-1.7784, 53.7771], [-1.7706, 53.7754],
    [-1.7625, 53.772], [-1.7621, 53.7713], [-1.7529, 53.7693], [-1.7499, 53.7701], [-1.7466, 53.7682], [-1.7351, 53.7695],
    [-1.7317, 53.7708], [-1.7281, 53.7755], [-1.7253, 53.7739], [-1.7266, 53.7756], [-1.7217, 53.7791], [-1.7206, 53.7839],
    [-1.7174, 53.7902], [-1.7189, 53.7929], [-1.718, 53.7934], [-1.7191, 53.7935], [-1.72, 53.7986], [-1.7222, 53.8021],
    [-1.7258, 53.8055], [-1.7304, 53.8085], [-1.7374, 53.8111], [-1.7443, 53.8113], [-1.747, 53.8103], [-1.7533, 53.8103],
    [-1.7565, 53.8095], [-1.7623, 53.815], [-1.7639, 53.8155], [-1.7663, 53.8178], [-1.7702, 53.8243], [-1.7694, 53.8246],
    [-1.7703, 53.8244], [-1.7728, 53.8263], [-1.7738, 53.829], [-1.7748, 53.8296], [-1.7742, 53.831], [-1.7725, 53.8319],
    [-1.7716, 53.8345], [-1.7698, 53.8342], [-1.7716, 53.8347], [-1.7704, 53.8355], [-1.7714, 53.8365], [-1.7802, 53.8391],
    [-1.7922, 53.8398], [-1.8025, 53.8415],
  ],
  // Tyneside (Newcastle/Gateshead) CAZ (Class C) — OFFICIAL, OpenStreetMap
  // way 1338896773, 44 verts.
  tyneside: [
    [-1.6049, 54.9824], [-1.6071, 54.9814], [-1.6082, 54.9815], [-1.6121, 54.9824], [-1.6119, 54.9804], [-1.6132, 54.9795],
    [-1.6153, 54.9811], [-1.6166, 54.9809], [-1.6178, 54.9784], [-1.6189, 54.9773], [-1.6267, 54.9756], [-1.628, 54.9727],
    [-1.6301, 54.9714], [-1.6294, 54.9686], [-1.6278, 54.9688], [-1.6249, 54.9678], [-1.6242, 54.9661], [-1.6299, 54.9624],
    [-1.6283, 54.9607], [-1.6234, 54.9614], [-1.6177, 54.9613], [-1.6077, 54.9662], [-1.6077, 54.9674], [-1.6067, 54.9669],
    [-1.6054, 54.9671], [-1.6064, 54.9685], [-1.6062, 54.9694], [-1.6057, 54.97], [-1.6068, 54.97], [-1.608, 54.9704],
    [-1.6078, 54.9712], [-1.607, 54.9716], [-1.6079, 54.9716], [-1.608, 54.972], [-1.6066, 54.9727], [-1.6064, 54.9741],
    [-1.6059, 54.9744], [-1.6042, 54.9745], [-1.605, 54.9749], [-1.6057, 54.9762], [-1.605, 54.9779], [-1.6046, 54.979],
    [-1.6044, 54.9821], [-1.6049, 54.9824],
  ],
  // Portsmouth CAZ is Class B — it charges buses, coaches, taxis and HGVs only,
  // NOT cars or vans (carChargePence + vanChargePence are both null in
  // CLEAN_AIR_ZONES). So this boundary is never used to raise a charge for a
  // MileClear user; the approximate box is kept only for completeness.
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
