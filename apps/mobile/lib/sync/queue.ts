// Sync queue writer — enqueues items for offline sync

import { randomUUID } from "expo-crypto";
import { getDatabase } from "../db/index";

export type EntityType = "trip" | "earning" | "fuel_log" | "shift" | "saved_location";
export type SyncAction = "create" | "update" | "delete";

// Max transient retries before a row is treated as permanently failed.
// Kept here (not in index.ts) so queue counters can mirror the engine's
// predicate without a circular import. processSyncQueue imports this.
export const MAX_RETRIES = 5;

export async function enqueueSync(
  entityType: EntityType,
  entityId: string,
  action: SyncAction,
  payload?: Record<string, unknown>
): Promise<string> {
  const db = await getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO sync_queue (id, entity_type, entity_id, action, payload, status, retry_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [id, entityType, entityId, action, payload ? JSON.stringify(payload) : null, now, now]
  );

  return id;
}

export async function getPendingCount(): Promise<number> {
  const db = await getDatabase();
  // Mirror the engine's selection predicate so the badge only counts rows
  // that processSyncQueue will actually attempt. Otherwise retry-exhausted
  // rows accumulate as a permanent count the user can't clear.
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending' OR (status = 'failed' AND retry_count < ?)",
    [MAX_RETRIES]
  );
  return row?.count ?? 0;
}

export async function getPendingCountForEntity(entityType: EntityType): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE entity_type = ? AND (status = 'pending' OR (status = 'failed' AND retry_count < ?))",
    [entityType, MAX_RETRIES]
  );
  return row?.count ?? 0;
}
