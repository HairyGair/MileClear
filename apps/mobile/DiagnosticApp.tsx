/**
 * Diagnostic entry point - Build 14
 * Sets up error catching FIRST, then loads expo-router.
 * Any crash during route file evaluation will be displayed on screen.
 */
import React, { useState, useEffect } from "react";
import { View, Text, AppRegistry, Platform, ScrollView, Alert } from "react-native";

let capturedError: { message: string; stack?: string } | null = null;

// Capture ANY error that happens during module evaluation
const originalHandler = (globalThis as any).ErrorUtils?.getGlobalHandler?.();
(globalThis as any).ErrorUtils?.setGlobalHandler?.((error: any, isFatal: any) => {
  capturedError = { message: String(error?.message || error), stack: error?.stack };
  // Also show an alert in case the component never renders
  try {
    Alert.alert("JS Error Caught", String(error?.message || error).slice(0, 300));
  } catch {}
  if (originalHandler) originalHandler(error, isFatal);
});

// Now try to load expo-router
let ExpoRouterEntry: any = null;
let loadError: string | null = null;

try {
  ExpoRouterEntry = require("expo-router/entry-classic");
} catch (err: any) {
  loadError = `Failed to load expo-router:\n${err?.message || err}\n\n${err?.stack?.slice(0, 1000) || ""}`;
  capturedError = { message: err?.message || String(err), stack: err?.stack };
}

// If expo-router loaded without throwing, it already registered itself.
// But if there was an error, show a diagnostic screen instead.
if (loadError || capturedError) {
  function ErrorDisplay() {
    const errMsg = loadError || capturedError?.message || "Unknown error";
    const errStack = capturedError?.stack || "";
    return (
      <View style={{ flex: 1, backgroundColor: "#1a0000", paddingTop: 80, paddingHorizontal: 20 }}>
        <Text style={{ color: "#ff4444", fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>
          Build 14 - Error Caught
        </Text>
        <Text style={{ color: "#ff8888", fontSize: 14, marginBottom: 12 }}>
          expo-router crashed during initialization:
        </Text>
        <ScrollView style={{ flex: 1 }}>
          <Text style={{ color: "#ffffff", fontSize: 13, lineHeight: 20, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
            {errMsg}
          </Text>
          <Text style={{ color: "#888888", fontSize: 11, lineHeight: 16, marginTop: 16 }}>
            {errStack}
          </Text>
        </ScrollView>
      </View>
    );
  }

  AppRegistry.registerComponent("main", () => ErrorDisplay);
}
// If no error, expo-router's entry-classic already called renderRootComponent/AppRegistry
