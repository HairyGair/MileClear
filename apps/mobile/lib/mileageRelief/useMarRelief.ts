// Mileage Allowance Relief on the phone: one hook, so the Tax tab card, the
// CLAIMS row, the Home line and the Mileage Allowance Relief screen's hero
// always show the same pounds. The driver's answers (tax region, Self
// Assessment, corrected employer payments) live in tracking_state on this
// phone; the miles come from GET /mileage-relief (or /tax/overview).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  calculateMileageAllowanceRelief,
  type EmployerPaid,
  type MarYearResult,
  type MileageReliefData,
  type MileageReliefYearMiles,
  type TaxRegion,
} from "@mileclear/shared";
import { getDatabase } from "../db";

export const MAR_PREFS_KEY = "mileage_relief_prefs_v1";

type Answer<T> = T | null;

export interface ReliefPrefs {
  region: Answer<TaxRegion>;
  filesSa: Answer<boolean>;
  /** Per tax year: what the employer actually paid, when it differs from the usual rate. */
  overrides: Record<string, EmployerPaid>;
}

export const EMPTY_RELIEF_PREFS: ReliefPrefs = { region: null, filesSa: null, overrides: {} };

export async function loadReliefPrefs(): Promise<ReliefPrefs> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [MAR_PREFS_KEY],
    );
    if (!row) return EMPTY_RELIEF_PREFS;
    const parsed = JSON.parse(row.value) as Partial<ReliefPrefs>;
    return {
      region: parsed.region === "rUK" || parsed.region === "scotland" ? parsed.region : null,
      filesSa: typeof parsed.filesSa === "boolean" ? parsed.filesSa : null,
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
    };
  } catch {
    return EMPTY_RELIEF_PREFS;
  }
}

async function saveReliefPrefs(prefs: ReliefPrefs): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
      [MAR_PREFS_KEY, JSON.stringify(prefs)],
    );
  } catch {
    // Not fatal: the answers just will not be remembered next time.
  }
}

/** What the employer paid in a year when the driver has not corrected it. */
export function usualEmployerPaid(data: MileageReliefData): EmployerPaid {
  return {
    kind: "rates",
    carVanFirst10kPence: data.employerMileageRatePence ?? 0,
    carVanAfter10kPence: data.employerMileageRatePenceAfter10k,
  };
}

export interface MarYear {
  miles: MileageReliefYearMiles;
  result: MarYearResult;
  overridden: boolean;
}

/** Pure: the per-year results for these miles and answers. */
export function computeMarYears(data: MileageReliefData, prefs: ReliefPrefs): MarYear[] {
  return data.years
    .map((y) => {
      const override = prefs.overrides[y.taxYear];
      const result = calculateMileageAllowanceRelief({
        taxYear: y.taxYear,
        carVanMiles: y.carVanMiles,
        motorcycleMiles: y.motorcycleMiles,
        employerPaid: override ?? usualEmployerPaid(data),
        filesSelfAssessment: prefs.filesSa,
        taxRegion: prefs.region,
      });
      return result ? { miles: y, result, overridden: !!override } : null;
    })
    .filter((r): r is MarYear => r !== null);
}

export function useMarRelief(data: MileageReliefData | null) {
  const [prefs, setPrefs] = useState<ReliefPrefs>(EMPTY_RELIEF_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);

  const reloadPrefs = useCallback(async () => {
    setPrefs(await loadReliefPrefs());
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    void reloadPrefs();
  }, [reloadPrefs]);

  // The screen can change the answers; the tab and Home pick them up on return.
  useFocusEffect(
    useCallback(() => {
      void reloadPrefs();
    }, [reloadPrefs]),
  );

  const updatePrefs = useCallback((next: ReliefPrefs) => {
    setPrefs(next);
    void saveReliefPrefs(next);
  }, []);

  const results = useMemo(() => (data ? computeMarYears(data, prefs) : []), [data, prefs]);

  const totalReliefPence = results.reduce((a, r) => a + r.result.reliefPence, 0);

  return {
    prefs,
    updatePrefs,
    results,
    /** Null until the miles and the driver's answers have both loaded. */
    totalReliefPence: data && prefsReady ? totalReliefPence : null,
    ready: prefsReady,
  };
}
