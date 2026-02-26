// HydrationOverlay — non-dismissable modal shown while initial data sync runs.
//
// Usage:
//   import { HydrationOverlay } from "../components/HydrationOverlay";
//
//   <HydrationOverlay
//     visible={isHydrating}
//     step="Syncing trips..."
//     done={3}
//     total={5}
//   />

import React from "react";
import {
  Modal,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";

interface HydrationOverlayProps {
  visible: boolean;
  step: string;
  done: number;
  total: number;
}

export function HydrationOverlay({
  visible,
  step,
  done,
  total,
}: HydrationOverlayProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Prevent hardware back button on Android from dismissing it
      onRequestClose={() => {}}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Setting up offline access...</Text>

          <ActivityIndicator
            size="large"
            color="#f5a623"
            style={styles.spinner}
          />

          <Text style={styles.stepText}>{step}</Text>

          <Text style={styles.counter}>
            {done}/{total}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(3, 7, 18, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#0a1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  title: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 17,
    color: "#f0f2f5",
    textAlign: "center",
    marginBottom: 24,
  },
  spinner: {
    marginBottom: 20,
  },
  stepText: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    color: "#8494a7",
    textAlign: "center",
    marginBottom: 12,
    minHeight: 18, // prevents layout jump when text changes
  },
  counter: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 12,
    color: "rgba(132, 148, 167, 0.5)",
    textAlign: "center",
  },
});
