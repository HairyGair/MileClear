// Sync queue writer — enqueues items for offline sync

import { randomUUID } from "expo-crypto";
import { getDatabase } from "../db/index";

export type EntityType = "trip" | "earning" | "fuel_log";
export type SyncAction = "create" | "update" | "delete";

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
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'failed')"
  );
  return row?.count ?? 0;
}

export async function getPendingCountForEntity(entityType: EntityType): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE entity_type = ? AND status IN ('pending', 'failed')",
    [entityType]
  );
  return row?.count ?? 0;
}
