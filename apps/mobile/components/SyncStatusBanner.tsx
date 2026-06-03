// Dashboard banner that surfaces trips stuck in the sync queue. The audit found
// that sync state was computed but never shown anywhere except a buried Settings
// screen, so a permanently_failed trip was invisible — the user had no idea a
// trip never reached their account. This is the missing global status surface.
//
// Scope: only the CONCERNING states (permanently_failed = needs the user;
// failed = a retry failed). Fresh `pending` items are transient and already get
// a per-row "Pending" badge in the trip list, so we don't show them here to
// avoid flashing on every save.

import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getDatabase } from "../lib/db/index";
import { colors, fonts } from "../lib/theme";

const RED = "#ef4444";
const AMBER = colors.amber;

export function SyncStatusBanner() {
  const router = useRouter();
  const [counts, setCounts] = useState({ perm: 0, failed: 0 });
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ status: string; n: number }>(
        "SELECT status, COUNT(*) AS n FROM sync_queue WHERE status IN ('permanently_failed', 'failed') GROUP BY status"
      );
      if (!mountedRef.current) return;
      const m: Record<string, number> = {};
      for (const r of rows) m[r.status] = r.n;
      setCounts({ perm: m.permanently_failed ?? 0, failed: m.failed ?? 0 });
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  const { perm, failed } = counts;
  if (perm === 0 && failed === 0) return null;

  const isError = perm > 0; // permanently_failed needs the user; failed is retrying
  const count = isError ? perm : failed;
  const accent = isError ? RED : AMBER;
  const title = `${count} trip${count !== 1 ? "s" : ""} ${isError ? "couldn't sync" : "are retrying to sync"}`;
  const subtitle = isError
    ? "Saved on your phone. Tap to review and retry."
    : "Saved on your phone, retrying to upload. Tap for details.";

  return (
    <TouchableOpacity
      onPress={() => router.push("/sync-status")}
      activeOpacity={0.8}
      style={[
        styles.banner,
        {
          backgroundColor: isError ? "rgba(239,68,68,0.12)" : "rgba(245,166,35,0.1)",
          borderColor: isError ? "rgba(239,68,68,0.32)" : "rgba(245,166,35,0.25)",
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <Ionicons name={isError ? "warning" : "cloud-upload-outline"} size={18} color={accent} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: accent }]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  textWrap: { flex: 1, marginLeft: 10 },
  title: { fontFamily: fonts.bold, fontSize: 13.5 },
  subtitle: { color: "#94a3b8", fontFamily: fonts.medium, fontSize: 11.5, marginTop: 2 },
});
