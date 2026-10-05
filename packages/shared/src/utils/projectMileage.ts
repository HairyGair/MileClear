import { calculateMileageDeduction } from "./index.js";

/**
 * Miles by project (5 Oct 2026).
 *
 * A driver who splits business driving between, say, "NHS" and "Private
 * practice" tags each trip with a freeform Project / client label. This
 * totals a tax year's business trips by that label and values each group at
 * the approved mileage rates (or the driver's employer rate).
 *
 * The 10,000-mile threshold is a yearly one, so a trip's value depends on how
 * many business miles came before it. Each trip is valued in date order as
 * the difference between the year's running total before and after it:
 *
 *   value(trip) = deduction(milesBefore + trip) - deduction(milesBefore)
 *
 * A trip that crosses 10,000 is therefore split between the two rates, and
 * because those differences telescope, the per-project values add up to the
 * year's total to the penny. Cars and vans share one threshold; motorbikes
 * have their own flat rate, exactly as in the API's mileage summary.
 */

export type ProjectVehicleType = "car" | "van" | "motorbike";

export interface ProjectMileageTrip {
  startedAt: Date | string;
  distanceMiles: number;
  /** null = vehicle unknown; the fallback type is used. */
  vehicleType: ProjectVehicleType | string | null;
  projectLabel: string | null;
}

export interface ProjectMileageOptions {
  /** UK tax year, e.g. "2026-27". Picks the rate table. */
  taxYear: string;
  /** From resolveMileageRates(user); empty object for the approved rates. */
  rates?: {
    customRateFirst10kPence?: number | null;
    customRateAfter10kPence?: number | null;
  };
  /** Rate class for trips with no vehicle. Defaults to "car". */
  fallbackVehicleType?: ProjectVehicleType;
}

export interface ProjectMileageRow {
  /** Display label (the most-used spelling), or null for "No project". */
  label: string | null;
  trips: number;
  miles: number;
  valuePence: number;
}

export interface ProjectMileageTotals {
  taxYear: string;
  /** Labelled projects by miles (largest first), then the "No project" row last if any. */
  projects: ProjectMileageRow[];
  totals: { trips: number; miles: number; valuePence: number };
}

/** Grouping key for a label: trimmed, case-folded, inner spaces collapsed. "" = no project. */
export function projectLabelKey(label: string | null | undefined): string {
  if (!label) return "";
  return label.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

function toTime(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

function rateClass(raw: string | null, fallback: ProjectVehicleType): "car" | "motorbike" {
  const t = raw === "car" || raw === "van" || raw === "motorbike" ? raw : fallback;
  // Cars and vans are one class with one shared 10,000-mile threshold.
  return t === "motorbike" ? "motorbike" : "car";
}

function roundMiles(m: number): number {
  return Math.round(m * 10) / 10;
}

export function computeProjectMileageTotals(
  trips: ProjectMileageTrip[],
  options: ProjectMileageOptions,
): ProjectMileageTotals {
  const { taxYear } = options;
  const rates = options.rates ?? {};
  const fallback = options.fallbackVehicleType ?? "car";

  // Stable date order (ties keep input order).
  const ordered = trips
    .map((t, i) => ({ t, i, time: toTime(t.startedAt) }))
    .filter(({ t }) => Number.isFinite(t.distanceMiles) && t.distanceMiles > 0)
    .sort((a, b) => a.time - b.time || a.i - b.i);

  const deduction = (cls: "car" | "motorbike", miles: number) =>
    miles > 0 ? calculateMileageDeduction(cls, miles, { ...rates, taxYear }).deductionPence : 0;

  const runningMiles: Record<"car" | "motorbike", number> = { car: 0, motorbike: 0 };
  const runningPence: Record<"car" | "motorbike", number> = { car: 0, motorbike: 0 };

  interface Group {
    trips: number;
    miles: number;
    valuePence: number;
    spellings: Map<string, { count: number; lastTime: number }>;
  }
  const groups = new Map<string, Group>();

  for (const { t, time } of ordered) {
    const cls = rateClass(t.vehicleType, fallback);
    const before = runningPence[cls];
    runningMiles[cls] += t.distanceMiles;
    const after = deduction(cls, runningMiles[cls]);
    runningPence[cls] = after;
    const value = after - before;

    const key = projectLabelKey(t.projectLabel);
    let g = groups.get(key);
    if (!g) {
      g = { trips: 0, miles: 0, valuePence: 0, spellings: new Map() };
      groups.set(key, g);
    }
    g.trips += 1;
    g.miles += t.distanceMiles;
    g.valuePence += value;
    if (key) {
      const spelling = t.projectLabel!.trim().replace(/\s+/g, " ");
      const s = g.spellings.get(spelling) ?? { count: 0, lastTime: 0 };
      s.count += 1;
      s.lastTime = Math.max(s.lastTime, time);
      g.spellings.set(spelling, s);
    }
  }

  const labelled: ProjectMileageRow[] = [];
  let unlabelled: ProjectMileageRow | null = null;
  for (const [key, g] of groups) {
    const row = { trips: g.trips, miles: roundMiles(g.miles), valuePence: g.valuePence };
    if (!key) {
      unlabelled = { label: null, ...row };
      continue;
    }
    // Most-used spelling; ties go to the most recently used one.
    let best = "";
    let bestCount = -1;
    let bestTime = -Infinity;
    for (const [spelling, s] of g.spellings) {
      if (s.count > bestCount || (s.count === bestCount && s.lastTime > bestTime)) {
        best = spelling;
        bestCount = s.count;
        bestTime = s.lastTime;
      }
    }
    labelled.push({ label: best, ...row });
  }
  labelled.sort(
    (a, b) => b.miles - a.miles || (a.label ?? "").localeCompare(b.label ?? "", "en-GB"),
  );

  const totalMiles = ordered.reduce((sum, { t }) => sum + t.distanceMiles, 0);
  return {
    taxYear,
    projects: unlabelled ? [...labelled, unlabelled] : labelled,
    totals: {
      trips: ordered.length,
      miles: roundMiles(totalMiles),
      valuePence: runningPence.car + runningPence.motorbike,
    },
  };
}

/**
 * Distinct labels, most recently used first, one spelling per label (the
 * most recent one). For suggestion chips under the Project / client box.
 * Input: label + when it was used, in any order.
 */
export function distinctProjectLabels(
  rows: { projectLabel: string | null; startedAt: Date | string }[],
  max = 30,
): string[] {
  const sorted = [...rows].sort((a, b) => toTime(b.startedAt) - toTime(a.startedAt));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of sorted) {
    const key = projectLabelKey(r.projectLabel);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r.projectLabel!.trim().replace(/\s+/g, " "));
    if (out.length >= max) break;
  }
  return out;
}
