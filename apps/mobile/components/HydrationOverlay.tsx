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

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { AppModal } from "./AppModal";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;

interface HydrationOverlayProps {
  visible: boolean;
  step: string;
  done: number;
  total: number;
}

const SLOW_THRESHOLD_SECS = 8;

export function HydrationOverlay({
  visible,
  step,
  done,
  total,
}: HydrationOverlayProps) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!visible) {
      setIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_SECS * 1000);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AppModal
      visible={visible}
      animationType="fade"
      // Prevent hardware back button on Android from dismissing it
      onRequestClose={() => {}}
    >
      <View
        style={styles.overlay}
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={`Setting up offline access. ${step} ${done} of ${total} complete${isSlow ? ". Taking longer than usual." : ""}`}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Setting up offline access...</Text>

          <ActivityIndicator
            size="large"
            color={AMBER}
            style={styles.spinner}
            accessibilityLabel="Loading"
          />

          <Text style={styles.stepText}>{step}</Text>

          <Text style={styles.counter}>
            {done}/{total}
          </Text>

          {isSlow && (
            <Text style={styles.slowNote}>
              Taking longer than usual - still working...
            </Text>
          )}
        </View>
      </View>
    </AppModal>
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
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 24,
  },
  spinner: {
    marginBottom: 20,
  },
  stepText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 12,
    minHeight: 18, // prevents layout jump when text changes
  },
  counter: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(132, 148, 167, 0.5)",
    textAlign: "center",
  },
  slowNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: AMBER,
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 8,
  },
});
