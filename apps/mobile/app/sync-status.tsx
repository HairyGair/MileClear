// Sync Status Screen
// Shows the offline sync queue, live sync state, and lets the user retry or
// discard individual failed items.

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { getDatabase } from "../lib/db/index";
import {
  processSyncQueue,
  getSyncStatus,
  getState,
  onSyncStateChange,
  type SyncState,
} from "../lib/sync/index";
import { Button } from "../components/Button";

// ── Types ────────────────────────────────────────────────────────────────────

type QueueItemStatus = "pending" | "failed" | "permanently_failed";

interface QueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  status: QueueItemStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";
const GREEN = "#34c759";
const RED = "#ef4444";
const ORANGE = "#f97316";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function entityLabel(type: string): string {
  const map: Record<string, string> = {
    trip: "Trip",
    earning: "Earning",
    fuel_log: "Fuel Log",
    shift: "Shift",
  };
  return map[type] ?? type;
}

function entityIcon(type: string): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    trip: "navigate-outline",
    earning: "cash-outline",
    fuel_log: "water-outline",
    shift: "time-outline",
  };
  return map[type] ?? "ellipse-outline";
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    create: "Create",
    update: "Update",
    delete: "Delete",
  };
  return map[action] ?? action;
}

function statusColor(status: QueueItemStatus): string {
  if (status === "permanently_failed") return RED;
  if (status === "failed") return ORANGE;
  return AMBER;
}

function statusLabel(status: QueueItemStatus): string {
  if (status === "permanently_failed") return "Perm. Failed";
  if (status === "failed") return "Failed";
  return "Pending";
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface StatusHeaderProps {
  syncState: SyncState;
  pendingCount: number;
  lastSyncedAt: string | null;
  queueHasIssues: boolean;
}

function StatusHeader({
  syncState,
  pendingCount,
  lastSyncedAt,
  queueHasIssues,
}: StatusHeaderProps) {
  const isSyncing = syncState === "syncing";

  let dotColor = GREEN;
  let label = "All synced";

  if (isSyncing) {
    dotColor = AMBER;
    label = "Syncing...";
  } else if (queueHasIssues) {
    dotColor = RED;
    label = "Sync issues";
  } else if (pendingCount > 0) {
    dotColor = AMBER;
    label = `${pendingCount} item${pendingCount !== 1 ? "s" : ""} pending`;
  }

  return (
    <View style={styles.headerCard}>
      <View style={styles.headerRow}>
        {isSyncing ? (
          <ActivityIndicator size="small" color={AMBER} style={styles.headerDot} />
        ) : (
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
        )}
        <Text style={styles.headerStatus}>{label}</Text>
      </View>
      <Text style={styles.headerMeta}>
        {lastSyncedAt
          ? `Last synced ${formatRelative(lastSyncedAt)}`
          : "Never synced"}
      </Text>
    </View>
  );
}

interface QueueItemRowProps {
  item: QueueItem;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

function QueueItemRow({ item, onRetry, onDelete }: QueueItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasFailed =
    item.status === "failed" || item.status === "permanently_failed";
  const isPermanent = item.status === "permanently_failed";
  const color = statusColor(item.status);

  return (
    <View style={styles.itemCard}>
      {/* Top row: icon + entity type + action + status pill */}
      <View style={styles.itemTopRow}>
        <View style={styles.itemLeft}>
          <View style={[styles.entityBadge, { borderColor: color + "40" }]}>
            <Ionicons
              name={entityIcon(item.entity_type)}
              size={14}
              color={color}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.entityBadgeText, { color }]}>
              {entityLabel(item.entity_type)}
            </Text>
          </View>
          <Text style={styles.actionText}>{actionLabel(item.action)}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: color + "22" }]}>
          <Text style={[styles.statusPillText, { color }]}>
            {statusLabel(item.status)}
          </Text>
        </View>
      </View>

      {/* Meta row: retry count + created date */}
      <View style={styles.itemMetaRow}>
        {item.retry_count > 0 && (
          <Text style={styles.retryCount}>
            {item.retry_count} {item.retry_count === 1 ? "retry" : "retries"}
          </Text>
        )}
        <Text style={styles.createdAt}>{formatRelative(item.created_at)}</Text>
      </View>

      {/* Error message (failed / permanently_failed) */}
      {hasFailed && item.last_error ? (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.7}
          style={styles.errorRow}
        >
          <Text
            style={styles.errorText}
            numberOfLines={expanded ? undefined : 2}
          >
            {item.last_error}
          </Text>
          <Text style={styles.showMore}>
            {expanded ? "Show less" : "Show more"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Action buttons */}
      <View style={styles.itemActions}>
        {!isPermanent && (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => onRetry(item.id)}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh-outline" size={14} color={AMBER} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(item.id)}
          activeOpacity={0.75}
        >
          <Ionicons name="trash-outline" size={14} color={RED} />
          <Text style={styles.deleteBtnText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmptyQueue() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="checkmark-circle-outline" size={40} color={GREEN} />
      </View>
      <Text style={styles.emptyTitle}>Everything is synced</Text>
      <Text style={styles.emptyText}>No items waiting to upload.</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SyncStatusScreen() {
  const [syncState, setSyncState] = useState<SyncState>(getState);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(true);

  // Derived flag: any item in a permanently failed state
  const queueHasIssues = queueItems.some(
    (i) => i.status === "permanently_failed"
  );

  // ── Data loading ─────────────────────────────────────────────

  const loadQueue = useCallback(async () => {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<QueueItem>(
        `SELECT * FROM sync_queue
         WHERE status IN ('pending', 'failed', 'permanently_failed')
         ORDER BY created_at DESC`
      );
      setQueueItems(rows);
    } catch {
      // Leave previous data in place on error
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const { pendingCount: count, lastSyncedAt: last } =
        await getSyncStatus();
      setPendingCount(count);
      setLastSyncedAt(last);
    } catch {
      // Silently fail
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadQueue(), loadStatus()]);
  }, [loadQueue, loadStatus]);

  // Reload on screen focus
  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  // Subscribe to real-time sync state changes
  useEffect(() => {
    const unsub = onSyncStateChange((state, count) => {
      setSyncState(state);
      setPendingCount(count);
      // Reload queue after each sync cycle completes
      if (state === "idle" || state === "error") {
        loadAll();
      }
    });
    return unsub;
  }, [loadAll]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await processSyncQueue();
    } finally {
      setSyncing(false);
      loadAll();
    }
  }, [loadAll]);

  const handleRetry = useCallback(
    async (id: string) => {
      try {
        const db = await getDatabase();
        const now = new Date().toISOString();
        await db.runAsync(
          `UPDATE sync_queue
           SET status = 'pending', retry_count = 0, last_error = NULL, updated_at = ?
           WHERE id = ?`,
          [now, id]
        );
        await loadAll();
        // Fire a sync attempt immediately
        processSyncQueue().catch(() => {});
      } catch {
        Alert.alert("Error", "Could not reset this item.");
      }
    },
    [loadAll]
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        "Remove from queue",
        "This removes the sync attempt. Your local data is kept — it just won't be uploaded. Are you sure?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                const db = await getDatabase();
                await db.runAsync(
                  "DELETE FROM sync_queue WHERE id = ?",
                  [id]
                );
                await loadAll();
              } catch {
                Alert.alert("Error", "Could not remove this item.");
              }
            },
          },
        ]
      );
    },
    [loadAll]
  );

  // ── Rendering ─────────────────────────────────────────────────

  const isSyncDisabled =
    syncing || syncState === "syncing" || queueItems.length === 0;

  return (
    <View style={styles.container}>
      <FlatList
        data={queueItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Status header */}
            <StatusHeader
              syncState={syncState}
              pendingCount={pendingCount}
              lastSyncedAt={lastSyncedAt}
              queueHasIssues={queueHasIssues}
            />

            {/* Sync Now button */}
            <View style={styles.syncBtnWrap}>
              <Button
                title={syncing ? "Syncing..." : "Sync Now"}
                icon={syncing ? undefined : "cloud-upload-outline"}
                loading={syncing}
                disabled={isSyncDisabled}
                onPress={handleSyncNow}
              />
            </View>

            {/* Section heading — only when there are items */}
            {!loadingQueue && queueItems.length > 0 && (
              <Text style={styles.sectionTitle}>Queue</Text>
            )}

            {loadingQueue && (
              <ActivityIndicator
                size="small"
                color={AMBER}
                style={{ marginTop: 32 }}
              />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <QueueItemRow
            item={item}
            onRetry={handleRetry}
            onDelete={handleDelete}
          />
        )}
        ListEmptyComponent={
          !loadingQueue ? <EmptyQueue /> : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Status header card
  headerCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  headerDot: {
    width: 20,
    height: 20,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerStatus: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  headerMeta: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginLeft: 20,
  },

  // Sync Now wrapper
  syncBtnWrap: {
    marginBottom: 24,
  },

  // Queue section title
  sectionTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  separator: {
    height: 10,
  },

  // Queue item card
  itemCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  entityBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  entityBadgeText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  actionText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  statusPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
  },

  // Meta row
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  retryCount: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: ORANGE,
  },
  createdAt: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },

  // Error row
  errorRow: {
    backgroundColor: "rgba(239,68,68,0.06)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.15)",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fca5a5",
    lineHeight: 18,
  },
  showMore: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    marginTop: 4,
  },

  // Item action buttons
  itemActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245,166,35,0.08)",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.20)",
  },
  retryBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(239,68,68,0.06)",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.15)",
  },
  deleteBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: RED,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 52,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(52,199,89,0.08)",
    borderWidth: 1,
    borderColor: "rgba(52,199,89,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
});
