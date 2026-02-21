// Sync status bar — shows pending sync count below the header

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSync } from "../lib/sync/context";

export function SyncStatusBar() {
  const { syncState, pendingCount, triggerSync } = useSync();

  if (pendingCount === 0) return null;

  return (
    <TouchableOpacity style={styles.container} onPress={triggerSync} activeOpacity={0.7}>
      {syncState === "syncing" ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color="#f59e0b" />
          <Text style={styles.text}>Syncing...</Text>
        </View>
      ) : (
        <Text style={styles.text}>
          {pendingCount} {pendingCount === 1 ? "item" : "items"} pending sync
        </Text>
      )}
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1c1917",
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#292524",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    color: "#f59e0b",
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
  },
});
