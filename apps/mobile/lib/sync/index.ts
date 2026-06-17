// Offline sync engine
// Processes the sync queue and pushes pending data to the API one-by-one

import { AppState, type AppStateStatus } from "react-native";
import { getDatabase } from "../db/index";
import { apiRequest } from "../api/index";
import { isOnline, onConnectivityChange } from "../network";
import { getPendingCount, MAX_RETRIES } from "./queue";
import { backfillGhostTrips } from "./backfill";
import {
  isNetworkError,
  isLocalSystemError,
  isSessionExpired,
  isRateLimited,
  isAuthError,
  isDefiniteClientRejection,
} from "./errors";

export type SyncState = "idle" | "syncing" | "error";

export interface SyncProgress {
  current: number;
  total: number;
}

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

type SyncStateListener = (
  state: SyncState,
  pendingCount: number,
  progress: SyncProgress | null
) => void;

let currentState: SyncState = "idle";
let processing = false;
const stateListeners: Set<SyncStateListener> = new Set();
let connectivityUnsub: (() => void) | null = null;

function getEndpoint(entityType: string, action: string, entityId: string): { method: string; path: string } {
  const routes: Record<string, { base: string }> = {
    trip: { base: "/trips" },
    earning: { base: "/earnings" },
    fuel_log: { base: "/fuel/logs" },
    shift: { base: "/shifts" },
    saved_location: { base: "/saved-locations" },
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

function setState(
  state: SyncState,
  pendingCount: number,
  progress: SyncProgress | null = null
) {
  currentState = state;
  for (const listener of stateListeners) {
    try {
      listener(state, pendingCount, progress);
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

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Emit per-item progress so the UI can show "Syncing 3 of 12..."
      // instead of an opaque spinner that looks frozen on long batches.
      setState("syncing", pending, { current: i + 1, total: items.length });
      try {
        const { method, path } = getEndpoint(item.entity_type, item.action, item.entity_id);

        const options: RequestInit = { method };
        if (item.payload && item.action !== "delete") {
          options.body = item.payload;
        }

        const response = await apiRequest<{ data?: { id?: string } }>(path, options);
        const now = new Date().toISOString();
        const TABLE_MAP: Record<string, string> = {
          trip: "trips",
          earning: "earnings",
          fuel_log: "fuel_logs",
          shift: "shifts",
          saved_location: "saved_locations",
        };
        const table = TABLE_MAP[item.entity_type];
        if (!table) throw new Error(`Unknown entity type: ${item.entity_type}`);

        if (item.action === "create" && response?.data?.id) {
          // Reconcile local UUID → server ID atomically.
          // Check if server ID already exists locally (e.g. from hydration race) —
          // if so, delete the local duplicate instead of updating.
          const serverId = response.data.id;
          const localId = item.entity_id;
          const existingServer = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM ${table} WHERE id = ?`, [serverId]
          );
          if (existingServer) {
            await db.execAsync(`
              DELETE FROM ${table} WHERE id = '${localId}';
              UPDATE sync_queue SET entity_id = '${serverId}', status = 'synced', updated_at = '${now}' WHERE id = '${item.id}';
            `);
          } else {
            await db.execAsync(`
              UPDATE ${table} SET id = '${serverId}', synced_at = '${now}' WHERE id = '${localId}';
              UPDATE sync_queue SET entity_id = '${serverId}', status = 'synced', updated_at = '${now}' WHERE id = '${item.id}';
            `);
          }
          // Cascade the new server ID to OTHER pending queue rows for the
          // same entity. Without this, an update or delete enqueued before
          // the create finished still references the dead local UUID and
          // 404s against the server. (For shifts this also covers the
          // case where shift_coordinates and trips reference the old ID.)
          await db.runAsync(
            `UPDATE sync_queue SET entity_id = ?
             WHERE entity_id = ? AND entity_type = ? AND id != ?
             AND status IN ('pending', 'failed')`,
            [serverId, localId, item.entity_type, item.id]
          );
          // Also rewrite payload entity references for queued updates so
          // the body of the PATCH carries the new server id.
          const queuedUpdates = await db.getAllAsync<{ id: string; payload: string | null }>(
            `SELECT id, payload FROM sync_queue
             WHERE entity_id = ? AND entity_type = ? AND action = 'update'
             AND status IN ('pending', 'failed')`,
            [serverId, item.entity_type]
          );
          for (const upd of queuedUpdates) {
            if (!upd.payload) continue;
            try {
              const parsed = JSON.parse(upd.payload);
              if (parsed && typeof parsed === "object" && parsed.id === localId) {
                parsed.id = serverId;
                await db.runAsync(
                  "UPDATE sync_queue SET payload = ? WHERE id = ?",
                  [JSON.stringify(parsed), upd.id]
                );
              }
            } catch {
              // Bad JSON in queue row, skip - the cascade above is the
              // load-bearing change; this body rewrite is defensive.
            }
          }
          // Cascade shift ID changes to related tables
          if (item.entity_type === "shift") {
            await db.execAsync(`
              UPDATE shift_coordinates SET shift_id = '${serverId}' WHERE shift_id = '${localId}';
              UPDATE trips SET shift_id = '${serverId}' WHERE shift_id = '${localId}';
            `);
          }
        } else if (item.action === "delete") {
          // Clean up local row on successful delete
          await db.execAsync(`
            DELETE FROM ${table} WHERE id = '${item.entity_id}';
            UPDATE sync_queue SET status = 'synced', updated_at = '${now}' WHERE id = '${item.id}';
          `);
        } else {
          // Update — mark synced
          await db.execAsync(`
            UPDATE sync_queue SET status = 'synced', updated_at = '${now}' WHERE id = '${item.id}';
            UPDATE ${table} SET synced_at = '${now}' WHERE id = '${item.entity_id}';
          `);
        }
      } catch (err) {
        // PRESERVE-AND-STOP: the network was unreachable (including the
        // token-refresh-network-failure that apiRequest throws as "Network
        // error"), a local system error (SecureStore in background), the
        // session expired, or we're being rate-limited. None of these mean
        // the item is bad - the rest of the batch will hit the same wall.
        // Break WITHOUT touching retry_count. This is the load-bearing fix:
        // the old code only knew `TypeError: Network request failed`, so an
        // offline pass on an expired token fell through to the "transient"
        // branch and incremented retry_count on up to BATCH_SIZE items per
        // pass - parking real trips as permanently_failed after a few offline
        // app-opens (the weeks-stuck / never-appears queue bug).
        if (
          isNetworkError(err) ||
          isLocalSystemError(err) ||
          isSessionExpired(err) ||
          isAuthError(err) ||
          isRateLimited(err)
        ) {
          break;
        }

        const errMsg = err instanceof Error ? err.message : "Unknown error";
        const now2 = new Date().toISOString();

        if (isDefiniteClientRejection(err)) {
          // The server definitively rejected THIS payload (a real 4xx, not
          // 429). Retrying won't help - park it but keep the local row for
          // manual review. Other items in the batch may be fine, so continue.
          await db.runAsync(
            "UPDATE sync_queue SET status = 'permanently_failed', last_error = ?, updated_at = ? WHERE id = ?",
            [errMsg, now2, item.id]
          );
          continue;
        }

        // Genuine transient failure (5xx, or anything unrecognised). Increment
        // retry count; at the ceiling, park as permanently_failed so it's
        // accounted for instead of lingering as a silently-filtered 'failed'.
        const newRetry = item.retry_count + 1;
        const newStatus = newRetry >= MAX_RETRIES ? "permanently_failed" : "failed";
        await db.runAsync(
          "UPDATE sync_queue SET status = ?, retry_count = ?, last_error = ?, updated_at = ? WHERE id = ?",
          [newStatus, newRetry, errMsg, now2, item.id]
        );
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

// Periodic retry while items are pending. iOS / network blips that don't
// trigger a clean offline -> online transition (e.g. a brief 5G drop while
// the device still reports "connected") used to leave the queue stranded
// until app restart. This timer drains it within a minute regardless.
const PERIODIC_RETRY_MS = 60_000;
let retryTimer: ReturnType<typeof setInterval> | null = null;

/**
 * One-time-per-cold-start recovery for items the OLD engine wrongly parked.
 * A network failure on an expired token used to be misclassified as transient
 * and burn retry_count until the row hit permanently_failed - so real trips
 * died purely from weak signal. Revive rows whose last_error matches a
 * network / refresh / session / timeout signature; reset them to pending with
 * a fresh retry budget. Server-rejected rows (4xx/5xx messages) don't match
 * and stay parked. Idempotent and cheap - a still-offline revived item just
 * breaks again next pass without burning a retry under the new logic.
 */
async function reviveNetworkParkedItems(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sync_queue
        SET status = 'pending', retry_count = 0, updated_at = ?
      WHERE (status = 'permanently_failed' OR (status = 'failed' AND retry_count >= ?))
        AND last_error IS NOT NULL
        AND (
          last_error LIKE '%Network error%' OR
          last_error LIKE '%Network request failed%' OR
          last_error LIKE '%REFRESH_NETWORK_ERROR%' OR
          last_error LIKE '%Failed to fetch%' OR
          last_error LIKE '%timed out%' OR
          last_error LIKE '%timeout%' OR
          last_error LIKE '%Session expired%'
        )`,
    [new Date().toISOString(), MAX_RETRIES]
  );
}

async function periodicTick() {
  try {
    const pending = await getPendingCount();
    if (pending > 0) {
      processSyncQueue();
    }
  } catch {
    // Pending count read failed - swallow, next tick will try again.
  }
}

export function startAutoSync(): () => void {
  // Recover items the OLD engine wrongly parked. Before this fix, an offline
  // pass on an expired token misclassified "Network error" as a transient
  // failure and burned retry_count on every item, so real trips ended up as
  // permanently_failed (or retry-exhausted) purely because of weak signal -
  // never retried again. Revive exactly those (last_error matches a network /
  // refresh / session / timeout signature) so they get a fair retry now.
  // Genuinely-bad items (4xx, 5xx server messages) don't match and stay
  // parked. Cheap, idempotent: a revived item that's still offline simply
  // breaks again next pass without burning a retry.
  // Sequence: revive wrongly-parked items, then sweep ghost trips (local-only
  // rows with no queued CREATE) into the queue, then kick off the first pass.
  // Each step is best-effort and must not block the next.
  (async () => {
    try {
      await reviveNetworkParkedItems();
    } catch {
      // Recovery is best-effort; the next cold start retries.
    }
    try {
      await backfillGhostTrips();
    } catch {
      // Backfill failures shouldn't block sync. Next cold start tries again.
    }
    processSyncQueue();
  })();

  // Process when connectivity changes to online
  connectivityUnsub = onConnectivityChange((online) => {
    if (online) {
      processSyncQueue();
    }
  });

  // Process when the app returns to foreground. Covers the case where the
  // user backgrounds the app mid-drive, comes back, and stuck items need
  // to flush without waiting for a network flip or restart.
  const appStateSub = AppState.addEventListener(
    "change",
    (state: AppStateStatus) => {
      if (state === "active") {
        processSyncQueue();
      }
    }
  );

  // Periodic retry every 60s. Cheap - only POSTs when there's something
  // pending - but ensures stuck queues drain even without an AppState or
  // network event. Fixes the silent-stuck-trips class of bug.
  retryTimer = setInterval(periodicTick, PERIODIC_RETRY_MS);

  return () => {
    if (connectivityUnsub) {
      connectivityUnsub();
      connectivityUnsub = null;
    }
    appStateSub.remove();
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  };
}
