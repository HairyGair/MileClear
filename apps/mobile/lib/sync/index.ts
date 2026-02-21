// Offline sync engine
// Processes the sync queue and pushes pending data to the API one-by-one

import { getDatabase } from "../db/index";
import { apiRequest } from "../api/index";
import { isOnline, onConnectivityChange } from "../network";
import { getPendingCount } from "./queue";

export type SyncState = "idle" | "syncing" | "error";

const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

interface QueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: string | null;
  status: string;
  retry_count: number;
  created_at: string;
}

type SyncStateListener = (state: SyncState, pendingCount: number) => void;

let currentState: SyncState = "idle";
let processing = false;
const stateListeners: Set<SyncStateListener> = new Set();
let connectivityUnsub: (() => void) | null = null;

function getEndpoint(entityType: string, action: string, entityId: string): { method: string; path: string } {
  const routes: Record<string, { base: string }> = {
    trip: { base: "/trips" },
    earning: { base: "/earnings" },
    fuel_log: { base: "/fuel/logs" },
  };

  const route = routes[entityType];
  if (!route) throw new Error(`Unknown entity type: ${entityType}`);

  switch (action) {
    case "create":
      return { method: "POST", path: route.base };
    case "update":
      return { method: "PATCH", path: `${route.base}/${entityId}` };
    case "delete":
      return { method: "DELETE", path: `${route.base}/${entityId}` };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function getBackoffMs(retryCount: number): number {
  return Math.min(2000 * Math.pow(2, retryCount), 32000);
}

function setState(state: SyncState, pendingCount: number) {
  currentState = state;
  for (const listener of stateListeners) {
    try {
      listener(state, pendingCount);
    } catch {
      // Don't let listener errors break sync
    }
  }
}

export async function processSyncQueue(): Promise<void> {
  if (processing) return;
  if (!isOnline()) return;

  processing = true;
  const pending = await getPendingCount();
  setState("syncing", pending);

  try {
    const db = await getDatabase();

    const items = await db.getAllAsync<QueueItem>(
      `SELECT * FROM sync_queue
       WHERE status IN ('pending', 'failed') AND retry_count < ?
       ORDER BY created_at ASC
       LIMIT ?`,
      [MAX_RETRIES, BATCH_SIZE]
    );

    if (items.length === 0) {
      setState("idle", 0);
      processing = false;
      return;
    }

    for (const item of items) {
      try {
        const { method, path } = getEndpoint(item.entity_type, item.action, item.entity_id);

        const options: RequestInit = { method };
        if (item.payload && item.action !== "delete") {
          options.body = item.payload;
        }

        await apiRequest(path, options);

        // Success — mark synced
        await db.runAsync(
          "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE id = ?",
          [new Date().toISOString(), item.id]
        );

        // Update local entity synced_at
        if (item.action === "create") {
          const table = item.entity_type === "fuel_log" ? "fuel_logs" : `${item.entity_type}s`;
          await db.runAsync(
            `UPDATE ${table} SET synced_at = ? WHERE id = ?`,
            [new Date().toISOString(), item.entity_id]
          );
        }
      } catch (err) {
        const isNetwork =
          err instanceof TypeError && err.message.includes("Network request failed");

        if (isNetwork) {
          // Network failure — stop processing rest (they'll all fail too)
          break;
        }

        const is4xx =
          err instanceof Error &&
          (/HTTP 4\d\d/.test(err.message) || /Session expired/.test(err.message));

        if (is4xx) {
          // Permanent failure — stop retrying
          await db.runAsync(
            "UPDATE sync_queue SET status = 'permanently_failed', last_error = ?, updated_at = ? WHERE id = ?",
            [err instanceof Error ? err.message : "Unknown error", new Date().toISOString(), item.id]
          );
        } else {
          // Transient failure — increment retry count
          const newRetry = item.retry_count + 1;
          await db.runAsync(
            "UPDATE sync_queue SET status = 'failed', retry_count = ?, last_error = ?, updated_at = ? WHERE id = ?",
            [newRetry, err instanceof Error ? err.message : "Unknown error", new Date().toISOString(), item.id]
          );
        }
      }
    }

    const remainingCount = await getPendingCount();
    setState(remainingCount > 0 ? "error" : "idle", remainingCount);
  } catch {
    const count = await getPendingCount();
    setState("error", count);
  } finally {
    processing = false;
  }
}

export async function getSyncStatus(): Promise<{
  pendingCount: number;
  lastSyncedAt: string | null;
}> {
  const db = await getDatabase();

  const pendingRow = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'failed')"
  );

  const lastRow = await db.getFirstAsync<{ updated_at: string }>(
    "SELECT updated_at FROM sync_queue WHERE status = 'synced' ORDER BY updated_at DESC LIMIT 1"
  );

  return {
    pendingCount: pendingRow?.count ?? 0,
    lastSyncedAt: lastRow?.updated_at ?? null,
  };
}

export function getState(): SyncState {
  return currentState;
}

export function onSyncStateChange(listener: SyncStateListener): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function startAutoSync(): () => void {
  // Process immediately on startup
  processSyncQueue();

  // Process when connectivity changes to online
  connectivityUnsub = onConnectivityChange((online) => {
    if (online) {
      processSyncQueue();
    }
  });

  return () => {
    if (connectivityUnsub) {
      connectivityUnsub();
      connectivityUnsub = null;
    }
  };
}
