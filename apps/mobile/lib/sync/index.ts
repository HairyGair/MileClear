// Offline sync engine
// Processes the sync queue and pushes pending data to the API

export type SyncState = "idle" | "syncing" | "error";

export async function processSyncQueue(): Promise<void> {
  // TODO: read pending items from SQLite sync_queue
  // TODO: batch upload to POST /sync/push
  // TODO: mark items as synced on success
}

export async function getSyncStatus(): Promise<{
  pendingCount: number;
  lastSyncedAt: string | null;
}> {
  // TODO: query sync_queue table
  return { pendingCount: 0, lastSyncedAt: null };
}
