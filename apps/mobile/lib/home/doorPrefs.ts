// Which Home door rows a driver has hidden (Oct 2026 Home redesign).
//
// Used by Home (long-press a row, "Hide this row") and by Settings > Home
// screen (a switch per row, "Show all again"). Kept on this phone, in
// tracking_state, like the other per-phone settings. Every call is
// best-effort: a read that fails means "nothing hidden", a write that fails
// is swallowed, so Home never breaks on a storage error.
//
// API (keep stable, Settings depends on it):
//   DOOR_ROW_IDS, DoorRowId, DOOR_ROW_LABELS
//   getHiddenDoorRows(): Promise<DoorRowId[]>
//   setDoorRowHidden(id, hidden): Promise<DoorRowId[]>   (returns the new list)
//   showAllDoorRows(): Promise<void>

/** The rows a driver may hide. The road alert row is never hideable. */
export const DOOR_ROW_IDS = ["tax", "insights", "earnings", "badges", "fuel"] as const;
export type DoorRowId = (typeof DOOR_ROW_IDS)[number];

/** Plain names for the Settings page. */
export const DOOR_ROW_LABELS: Record<DoorRowId, string> = {
  tax: "Tax",
  insights: "Insights",
  earnings: "Earnings",
  badges: "Badges",
  fuel: "Fuel",
};

export const DOOR_PREFS_KEY = "home_hidden_door_rows";

/** Pure: stored text to a clean list. Anything unreadable is "nothing hidden". */
export function parseHiddenDoorRows(raw: string | null | undefined): DoorRowId[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return DOOR_ROW_IDS.filter((id) => parsed.includes(id));
  } catch {
    return [];
  }
}

/** Pure: add or remove one id, keeping the canonical order and no repeats. */
export function withDoorRowHidden(
  current: readonly DoorRowId[],
  id: DoorRowId,
  hidden: boolean
): DoorRowId[] {
  const set = new Set<DoorRowId>(current);
  if (hidden) set.add(id);
  else set.delete(id);
  return DOOR_ROW_IDS.filter((x) => set.has(x));
}

async function db() {
  const mod = await import("../db/index");
  return mod.getDatabase();
}

export async function getHiddenDoorRows(): Promise<DoorRowId[]> {
  try {
    const d = await db();
    const row = await d.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [DOOR_PREFS_KEY]
    );
    return parseHiddenDoorRows(row?.value);
  } catch {
    return [];
  }
}

async function write(ids: DoorRowId[]): Promise<void> {
  try {
    const d = await db();
    await d.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      DOOR_PREFS_KEY,
      JSON.stringify(ids),
    ]);
  } catch {
    // best-effort
  }
}

export async function setDoorRowHidden(id: DoorRowId, hidden: boolean): Promise<DoorRowId[]> {
  const next = withDoorRowHidden(await getHiddenDoorRows(), id, hidden);
  await write(next);
  return next;
}

export async function showAllDoorRows(): Promise<void> {
  await write([]);
}
