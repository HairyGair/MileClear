/**
 * Diagnostic entry point that bypasses expo-router entirely.
 * If this renders in production but the normal app doesn't,
 * the issue is in expo-router's route file evaluation.
 */
import React from "react";
import { View, Text, AppRegistry, Platform } from "react-native";

function DiagnosticApp() {
  return (
    <View style={{ flex: 1, backgroundColor: "#ff0000", justifyContent: "center", alignItems: "center", paddingTop: 60 }}>
      <Text style={{ color: "#ffffff", fontSize: 28, fontWeight: "bold" }}>
        DIAGNOSTIC OK
      </Text>
      <Text style={{ color: "#ffffff", fontSize: 16, marginTop: 12 }}>
        Build 13 - Direct Entry (no expo-router)
      </Text>
      <Text style={{ color: "#ffffff", fontSize: 14, marginTop: 8 }}>
        Platform: {Platform.OS} {Platform.Version}
      </Text>
      <Text style={{ color: "#ffffff", fontSize: 12, marginTop: 20, textAlign: "center", paddingHorizontal: 40 }}>
        If you see this red screen, the issue is in expo-router's route file evaluation, NOT in React Native or Hermes.
      </Text>
    </View>
  );
}

AppRegistry.registerComponent("main", () => DiagnosticApp);
