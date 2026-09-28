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

/**
 * What is still waiting in the queue, for the diagnostic dump. The heartbeat
 * only ever sent counts, so on 28 Sep 2026 support could see that 55 drivers
 * had permanently failed uploads and not one thing about what they were.
 * Bodies are never included: they carry routes.
 */
export async function getSyncQueueSummary(limit = 30): Promise<
  Array<{
    entity: string;
    action: string;
    status: string;
    retries: number;
    error: string | null;
    createdAt: string;
    hasLocalRow: boolean | null;
  }>
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    entity_type: string;
    entity_id: string;
    action: string;
    status: string;
    retry_count: number;
    last_error: string | null;
    created_at: string;
  }>(
    `SELECT entity_type, entity_id, action, status, retry_count, last_error, created_at
     FROM sync_queue WHERE status != 'synced' ORDER BY created_at ASC LIMIT ?`,
    [limit]
  );
  const table: Record<string, string> = {
    trip: "trips",
    earning: "earnings",
    fuel_log: "fuel_logs",
    shift: "shifts",
    saved_location: "saved_locations",
  };
  const out = [];
  for (const r of rows) {
    let hasLocalRow: boolean | null = null;
    const t = table[r.entity_type];
    if (t) {
      const hit = await db.getFirstAsync<{ id: string }>(`SELECT id FROM ${t} WHERE id = ?`, [r.entity_id]);
      hasLocalRow = !!hit;
    }
    out.push({
      entity: r.entity_type,
      action: r.action,
      status: r.status,
      retries: r.retry_count,
      error: r.last_error ? r.last_error.slice(0, 160) : null,
      createdAt: r.created_at,
      hasLocalRow,
    });
  }
  return out;
}
