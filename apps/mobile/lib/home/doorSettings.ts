// The rows on Settings > Home screen: one switch per Home door row, "on"
// meaning the row may show. Pure; the storage lives in doorPrefs.ts.

import { DOOR_ROW_IDS, DOOR_ROW_LABELS, type DoorRowId } from "./doorPrefs";

export interface DoorSwitch {
  id: DoorRowId;
  label: string;
  hint: string;
  /** The same icon the row shows on Home, so the two are easy to match up. */
  icon: "document-text-outline" | "stats-chart-outline" | "cash-outline" | "ribbon-outline" | "water-outline";
  /** True when the row is allowed to show on Home. */
  shown: boolean;
}

const DETAILS: Record<DoorRowId, { hint: string; icon: DoorSwitch["icon"] }> = {
  tax: { hint: "Your tax summary, with 31 January reminders in season", icon: "document-text-outline" },
  insights: { hint: "A line about your week, linking to Insights", icon: "stats-chart-outline" },
  earnings: { hint: "What you were paid this week", icon: "cash-outline" },
  badges: { hint: "The next badge you can earn", icon: "ribbon-outline" },
  fuel: { hint: "Cheap fuel near you", icon: "water-outline" },
};

export function doorSwitches(hidden: readonly DoorRowId[]): DoorSwitch[] {
  return DOOR_ROW_IDS.map((id) => ({
    id,
    label: DOOR_ROW_LABELS[id],
    hint: DETAILS[id].hint,
    icon: DETAILS[id].icon,
    shown: !hidden.includes(id),
  }));
}

/** One plain line under the list: how many rows are switched off. */
export function hiddenSummary(hidden: readonly DoorRowId[]): string {
  if (hidden.length === 0) return "All shortcuts can show on Home.";
  return `${hidden.length} ${hidden.length === 1 ? "shortcut is" : "shortcuts are"} hidden.`;
}
