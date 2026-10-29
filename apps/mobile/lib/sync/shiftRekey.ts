// When a shift started offline gets its server id, everything on the phone
// that names the local id moves to the server id. Kept pure so the order and
// the conditions can be tested (lib/sync/index.ts and actions.ts run them).
//
// Until 29 Oct 2026 the tracking lock was left out: active_shift_id kept the
// local id, so every fix after the sync was stored under it, and End Shift
// (processShiftTrips with the server id) never read them. Driving after a
// mid-shift sync was never turned into trips.
//
// The lock moves first, so new fixes go to the server id straight away. A fix
// whose handler read the lock just before can still land under the local id
// after the move, so an alias row remembers the old id and End Shift folds
// those rows in (aliasedShiftIdsSql).

export const SHIFT_ID_ALIAS_PREFIX = "shift_id_alias:";

export interface SqlStep {
  sql: string;
  params: string[];
}

export function shiftIdAliasKey(localId: string): string {
  return `${SHIFT_ID_ALIAS_PREFIX}${localId}`;
}

/** Statements that move a shift's local id to its server id, in order. */
export function shiftRekeySteps(localId: string, serverId: string): SqlStep[] {
  return [
    {
      // Only this shift's lock: a Start Trip's or another shift's is left alone.
      sql: "UPDATE tracking_state SET value = ? WHERE key = 'active_shift_id' AND value = ?",
      params: [serverId, localId],
    },
    {
      sql: "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
      params: [shiftIdAliasKey(localId), serverId],
    },
    { sql: "UPDATE shift_coordinates SET shift_id = ? WHERE shift_id = ?", params: [serverId, localId] },
    { sql: "UPDATE trips SET shift_id = ? WHERE shift_id = ?", params: [serverId, localId] },
  ];
}

/** The old local ids recorded for a shift's server id ("_" escaped: LIKE treats it as any character). */
export const aliasedShiftIdsSql =
  "SELECT key FROM tracking_state WHERE key LIKE 'shift\\_id\\_alias:%' ESCAPE '\\' AND value = ?";

interface AliasDb {
  getFirstAsync<T>(sql: string, params: string[]): Promise<T | null>;
}

/**
 * The id to end a shift by. Home (or an old screen) can still hold the local
 * id of a shift started offline after the sync moved everything to the server
 * id; ending by the old id would read no breadcrumbs and end nothing.
 */
export async function currentShiftId(db: AliasDb, shiftId: string): Promise<string> {
  try {
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [
      shiftIdAliasKey(shiftId),
    ]);
    return row?.value || shiftId;
  } catch {
    return shiftId;
  }
}

interface TxDb {
  withTransactionAsync?: (task: () => Promise<void>) => Promise<void>;
}

/** Run the rename and re-key together, so a kill part way can't leave the lock on the old id. */
export async function runInTransaction(db: TxDb, task: () => Promise<void>): Promise<void> {
  if (typeof db.withTransactionAsync === "function") await db.withTransactionAsync(task);
  else await task();
}

export function localIdFromAliasKey(key: string): string | null {
  return key.startsWith(SHIFT_ID_ALIAS_PREFIX) && key.length > SHIFT_ID_ALIAS_PREFIX.length
    ? key.slice(SHIFT_ID_ALIAS_PREFIX.length)
    : null;
}
