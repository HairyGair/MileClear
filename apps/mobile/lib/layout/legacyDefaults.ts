// The dashboard defaults as they stood before the calmer home screen
// (4 Oct 2026), kept so a device whose saved layout is still exactly that
// default moves to the new one instead of being treated as customised.
//
// Saved rows only exist after a driver toggles, reorders or resets
// something, so almost every driver on the old default has no rows at all
// and picks up the new registry defaults with no help from this file. This
// covers the rest: someone who switched a card off and on again, or moved
// one up and back down. Anything else, including a layout saved under an
// older registry order, counts as a choice and is left alone.
//
// No React Native imports, so the comparison is unit-testable.

export interface LegacySection {
  key: string;
  visible: boolean;
}

export const LEGACY_DEFAULTS: Record<string, LegacySection[]> = {
  dashboard_work: [
    { key: "work_hero", visible: true },
    { key: "work_cta", visible: true },
    { key: "road_alerts", visible: true },
    { key: "tax_readiness", visible: true },
    { key: "sa_countdown", visible: true },
    { key: "daily_recap", visible: false },
    { key: "business_mileage", visible: true },
    { key: "shift_suggestion", visible: true },
    { key: "weekly_goal", visible: true },
    { key: "work_quicknav", visible: true },
    { key: "work_shift", visible: true },
    { key: "journey_map", visible: true },
    { key: "activity_heatmap", visible: true },
    { key: "benchmark", visible: true },
    { key: "local_benchmark", visible: true },
    { key: "work_calendar", visible: true },
    { key: "community_month", visible: true },
    { key: "community", visible: false },
  ],
  dashboard_personal: [
    { key: "personal_cta", visible: true },
    { key: "road_alerts", visible: true },
    { key: "monthly_history", visible: true },
    { key: "personal_summary", visible: true },
    { key: "daily_recap", visible: false },
    { key: "milestone", visible: true },
    { key: "driving_patterns", visible: true },
    { key: "journey_map", visible: true },
    { key: "local_benchmark", visible: true },
    { key: "community_month", visible: true },
    { key: "community", visible: false },
  ],
};

/**
 * True when `saved` (in position order) is the old default: every key is a
 * known legacy key, in the legacy order, with the legacy visibility. Keys
 * the device never saved (sections added after it last saved) don't count
 * against it. An empty list is not a saved layout and returns false.
 */
export function isUntouchedLegacyDefault(
  saved: LegacySection[],
  legacy: LegacySection[] | undefined
): boolean {
  if (!legacy || saved.length === 0) return false;
  const index = new Map(legacy.map((s, i) => [s.key, i]));
  let last = -1;
  for (const row of saved) {
    const i = index.get(row.key);
    if (i === undefined || i <= last) return false;
    if (legacy[i].visible !== row.visible) return false;
    last = i;
  }
  return true;
}
