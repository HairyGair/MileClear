import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSync } from "../lib/sync/context";

export function SyncStatusBar() {
  const { syncState, pendingCount, triggerSync } = useSync();

  if (pendingCount === 0) return null;

  return (
    <TouchableOpacity style={styles.container} onPress={triggerSync} activeOpacity={0.7}>
      <View style={styles.row}>
        {syncState === "syncing" ? (
          <ActivityIndicator size="small" color="#f5a623" />
        ) : (
          <Ionicons name="cloud-upload-outline" size={14} color="#f5a623" />
        )}
        <Text style={styles.text}>
          {syncState === "syncing"
            ? "Syncing..."
            : `${pendingCount} ${pendingCount === 1 ? "item" : "items"} pending sync`}
        </Text>
        {syncState !== "syncing" && (
          <Ionicons name="chevron-forward" size={12} color="#4a5568" />
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
    borderBottomColor: "#1f2937",
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
