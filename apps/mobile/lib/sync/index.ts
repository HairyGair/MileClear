// Offline sync engine
// Processes the sync queue and pushes pending data to the API one-by-one

import { AppState, type AppStateStatus } from "react-native";
import { getDatabase } from "../db/index";
import { apiRequest } from "../api/index";
import { isOnline, onConnectivityChange } from "../network";
import { getPendingCount, MAX_RETRIES } from "./queue";
import { backfillGhostTrips, loadTripCreateBody } from "./backfill";
import { resolveMissingTarget } from "./missingTargetRule";
import { enqueueSync } from "./queue";
import { HELD_STATUS, isAlreadyApplied, parkedItemAction } from "./queueRules";
import {
  isNetworkError,
  isLocalSystemError,
  isSessionExpired,
  isRateLimited,
  isAuthError,
  isServerUnavailable,
  isDefiniteClientRejection,
  isTargetMissing,
  isItemForbidden,
} from "./errors";
import { ApiError } from "../api/apiError";

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

    // Entities whose create has not landed yet. An edit or delete for one of
    // them can only 404 (the server has never seen the id), so it waits
    // behind the create instead of being sent. Before 28 Sep 2026 it was sent,
    // 404'd, and the missing-target rule turned it into a broken create that
    // parked as permanently_failed.
    const unfinishedCreates = new Set(
      (
        (await db.getAllAsync<{ entity_id: string }>(
          "SELECT entity_id FROM sync_queue WHERE action = 'create' AND status != 'synced'"
        )) ?? []
      ).map((r) => r.entity_id)
    );
    // Local id -> server id for creates that land during THIS pass. The
    // cascade below rewrites the queue rows in SQLite, but `items` was read
    // before it ran, so an edit later in the same batch still carried the dead
    // local id and 404'd (an offline trip, classified offline, then synced).
    const remapped = new Map<string, string>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const serverIdForEntity = remapped.get(item.entity_id);
      if (serverIdForEntity) {
        const localId = item.entity_id;
        item.entity_id = serverIdForEntity;
        if (item.payload) {
          try {
            const body = JSON.parse(item.payload);
            if (body && typeof body === "object" && body.id === localId) {
              body.id = serverIdForEntity;
              item.payload = JSON.stringify(body);
            }
          } catch {
            // unreadable body: the entity_id swap above is what matters
          }
        }
      }
      if (item.action !== "create" && unfinishedCreates.has(item.entity_id)) {
        continue;
      }
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
          remapped.set(localId, serverId);
          unfinishedCreates.delete(localId);
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
        // One item refused (a free account's third saved place). Hold it and
        // carry on: it says nothing about the token or the network, and the
        // queue runs oldest first, so stopping here held back every trip
        // queued after it. See isItemForbidden and HELD_STATUS.
        if (isItemForbidden(err)) {
          await db.runAsync(
            "UPDATE sync_queue SET status = ?, last_error = ?, updated_at = ? WHERE id = ?",
            [HELD_STATUS, err instanceof Error ? err.message : "Refused", new Date().toISOString(), item.id]
          );
          continue;
        }

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
          isRateLimited(err) ||
          isServerUnavailable(err)
        ) {
          break;
        }

        const errMsg = err instanceof Error ? err.message : "Unknown error";
        const now2 = new Date().toISOString();

        // The server has no such record. Not a malformed payload, so it does
        // not belong in the permanently_failed pile where it sits for ever
        // behind a red "Sync issues" badge. See missingTargetRule.ts.
        if (isTargetMissing(err)) {
          const tableForItem: Record<string, string> = {
            trip: "trips",
            earning: "earnings",
            fuel_log: "fuel_logs",
            shift: "shifts",
            saved_location: "saved_locations",
          };
          const localTable = tableForItem[item.entity_type];
          let localRowExists = false;
          let localRowSynced = false;
          if (localTable) {
            const row = await db.getFirstAsync<{ id: string; synced_at: string | null }>(
              `SELECT id, synced_at FROM ${localTable} WHERE id = ?`,
              [item.entity_id]
            );
            localRowExists = !!row;
            localRowSynced = !!row?.synced_at;
          }
          const resolution = resolveMissingTarget({
            action: item.action as "create" | "update" | "delete",
            localRowExists,
            localRowSynced,
          });
          if (resolution === "drop") {
            await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [item.id]);
            continue;
          }
          if (resolution === "drop_local" && localTable) {
            // The server removed it after it synced (merged, split, deleted on
            // the web, cleared as a duplicate). Converge on that instead of
            // resurrecting it; the edit has nothing left to apply to.
            await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [item.id]);
            await db.runAsync(`DELETE FROM ${localTable} WHERE id = ?`, [item.entity_id]);
            continue;
          }
          if (resolution === "await_create") {
            // Never reached the server and nothing queued to put it there: a
            // trip gets a create built from its own row, and this edit waits
            // behind it. Other records have no such builder; their edit is
            // dropped and the row stays on the phone as it is.
            const body =
              item.entity_type === "trip" ? await loadTripCreateBody(item.entity_id) : null;
            if (body) {
              await enqueueSync("trip", item.entity_id, "create", body);
              unfinishedCreates.add(item.entity_id);
              await db.runAsync(
                "UPDATE sync_queue SET status = 'pending', last_error = ?, updated_at = ? WHERE id = ?",
                ["waiting for its trip to upload", now2, item.id]
              );
            } else {
              await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [item.id]);
            }
            continue;
          }
        }

        if (
          isAlreadyApplied(
            item.entity_type,
            item.action,
            err instanceof ApiError ? err.statusCode : null,
            errMsg
          )
        ) {
          await db.runAsync(
            "UPDATE sync_queue SET status = 'synced', last_error = ?, updated_at = ? WHERE id = ?",
            [errMsg, now2, item.id]
          );
          continue;
        }

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

/** Held items (see HELD_STATUS) get one more try per app start, so a place
 *  refused on the free plan uploads by itself once the driver is Pro. */
async function reviveHeldItems(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'pending', updated_at = ? WHERE status = ?",
    [new Date().toISOString(), HELD_STATUS]
  );
}

/**
 * Bump when a fix lands that could let parked (permanently_failed) rows
 * through, so every phone looks at its parked rows once more. 2026-09-28: the
 * server stopped rejecting trips for a shift id that is not a UUID, the queue
 * stopped turning 404'd edits into broken creates, and edits now wait behind
 * their create instead of 404ing.
 */
export const PARKED_REVIVAL_REVISION = "2026-09-28";
const PARKED_REVIVAL_KEY = "sync_parked_revival";

const LOCAL_TABLE: Record<string, string> = {
  trip: "trips",
  earning: "earnings",
  fuel_log: "fuel_logs",
  shift: "shifts",
  saved_location: "saved_locations",
};

/**
 * One pass per PARKED_REVIVAL_REVISION over rows parked as permanently_failed:
 * drop the ones with nothing left to send, rebuild the ones whose body was
 * never a trip, hold refused saved places, and give the rest one more try.
 * See parkedItemAction for the rules and why the pass exists.
 */
async function reviewParkedItemsOnce(): Promise<void> {
  const db = await getDatabase();
  const done = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [PARKED_REVIVAL_KEY]
  );
  if (done?.value === PARKED_REVIVAL_REVISION) return;

  const parked = await db.getAllAsync<QueueItem & { last_error: string | null }>(
    "SELECT * FROM sync_queue WHERE status = 'permanently_failed'"
  );
  const now = new Date().toISOString();
  for (const item of parked) {
    const table = LOCAL_TABLE[item.entity_type];
    let localRowExists = false;
    let localRowSynced = false;
    if (table) {
      const row = await db.getFirstAsync<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM ${table} WHERE id = ?`,
        [item.entity_id]
      );
      localRowExists = !!row;
      localRowSynced = !!row?.synced_at;
    }
    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = item.payload ? JSON.parse(item.payload) : null;
      payload = parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      payload = null;
    }
    const decision = parkedItemAction({
      entityType: item.entity_type,
      action: item.action,
      localRowExists,
      localRowSynced,
      lastError: item.last_error ?? null,
      payload,
    });
    if (decision === "drop") {
      await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [item.id]);
    } else if (decision === "hold") {
      await db.runAsync("UPDATE sync_queue SET status = ?, updated_at = ? WHERE id = ?", [
        HELD_STATUS,
        now,
        item.id,
      ]);
    } else if (decision === "rebuild") {
      const body = await loadTripCreateBody(item.entity_id);
      if (body) {
        await db.runAsync(
          "UPDATE sync_queue SET payload = ?, status = 'pending', retry_count = 0, updated_at = ? WHERE id = ?",
          [JSON.stringify(body), now, item.id]
        );
      } else {
        await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [item.id]);
      }
    } else {
      await db.runAsync(
        "UPDATE sync_queue SET status = 'pending', retry_count = 0, updated_at = ? WHERE id = ?",
        [now, item.id]
      );
    }
  }
  await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
    PARKED_REVIVAL_KEY,
    PARKED_REVIVAL_REVISION,
  ]);
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
      await reviewParkedItemsOnce();
    } catch {
      // Best-effort; the revision marker is only written after a full pass.
    }
    try {
      await reviveHeldItems();
    } catch {
      // Best-effort; the next cold start retries.
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
