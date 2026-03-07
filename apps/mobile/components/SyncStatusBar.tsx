import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSync } from "../lib/sync/context";

export function SyncStatusBar() {
  const { syncState, pendingCount, triggerSync } = useSync();

  if (pendingCount === 0) return null;

  const statusText = syncState === "syncing"
    ? "Syncing..."
    : `${pendingCount} ${pendingCount === 1 ? "item" : "items"} pending sync`;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={triggerSync}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={syncState === "syncing" ? "Syncing data, please wait" : `${statusText}. Tap to sync now`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row} accessibilityRole="summary">
        {syncState === "syncing" ? (
          <ActivityIndicator size="small" color="#f5a623" accessibilityLabel="Loading" />
        ) : (
          <Ionicons name="cloud-upload-outline" size={14} color="#f5a623" accessible={false} />
        )}
        <Text style={styles.text}>
          {statusText}
        </Text>
        {syncState !== "syncing" && (
          <Ionicons name="chevron-forward" size={12} color="#64748b" accessible={false} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0a1120",
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    color: "#f5a623",
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
  },
});
