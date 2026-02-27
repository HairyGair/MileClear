/**
 * Diagnostic entry point - Build 15
 * Intercepts AppRegistry.registerComponent to wrap expo-router's
 * root component in an ErrorBoundary. This catches render-time
 * crashes that happen when expo-router lazily evaluates route files.
 */
import React from "react";
import { View, Text, AppRegistry, Platform, ScrollView, Alert } from "react-native";

// Store any error caught at any level
let caughtError: { message: string; stack: string } | null = null;

// 1. Set up global error handler FIRST
const origHandler = (globalThis as any).ErrorUtils?.getGlobalHandler?.();
(globalThis as any).ErrorUtils?.setGlobalHandler?.((error: any, isFatal: any) => {
  caughtError = { message: String(error?.message || error), stack: String(error?.stack || "").slice(0, 2000) };
  try { Alert.alert("GLOBAL ERROR", String(error?.message || error).slice(0, 300)); } catch {}
  if (origHandler) origHandler(error, isFatal);
});

// 2. Error boundary that catches render-time errors
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    caughtError = { message: error.message, stack: `${error.stack || ""}\n\nComponent Stack:${info.componentStack || ""}`.slice(0, 2000) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: "#1a0000", paddingTop: 80, paddingHorizontal: 20 }}>
          <Text style={{ color: "#ff4444", fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>
            Build 15 - Render Error
          </Text>
          <Text style={{ color: "#ff8888", fontSize: 14, marginBottom: 12 }}>
            expo-router crashed while rendering routes:
          </Text>
          <ScrollView style={{ flex: 1 }}>
            <Text selectable style={{ color: "#ffffff", fontSize: 13, lineHeight: 20, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
              {this.state.error?.message || "Unknown error"}
            </Text>
            <Text selectable style={{ color: "#888888", fontSize: 11, lineHeight: 16, marginTop: 16 }}>
              {this.state.error?.stack?.slice(0, 2000) || "No stack trace"}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

// 3. Monkey-patch AppRegistry to wrap whatever expo-router registers
const originalRegister = AppRegistry.registerComponent.bind(AppRegistry);
AppRegistry.registerComponent = (appKey: string, componentProvider: any, ...rest: any[]) => {
  const wrappedProvider = () => {
    const OriginalComponent = componentProvider();
    return function WrappedRoot(props: any) {
      return (
        <RootErrorBoundary>
          <OriginalComponent {...props} />
        </RootErrorBoundary>
      );
    };
  };
  return originalRegister(appKey, wrappedProvider, ...rest);
};

// 4. Now load expo-router — it will call AppRegistry.registerComponent,
//    which we've patched to wrap with our ErrorBoundary
try {
  require("expo-router/entry-classic");
} catch (err: any) {
  // Module-level crash — show error directly
  const msg = `expo-router module crash:\n${err?.message || err}\n\n${err?.stack?.slice(0, 1500) || ""}`;

  function ModuleErrorDisplay() {
    return (
      <View style={{ flex: 1, backgroundColor: "#1a0000", paddingTop: 80, paddingHorizontal: 20 }}>
        <Text style={{ color: "#ff4444", fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>
          Build 15 - Module Error
        </Text>
        <ScrollView style={{ flex: 1 }}>
          <Text selectable style={{ color: "#ffffff", fontSize: 13, lineHeight: 20, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
            {msg}
          </Text>
        </ScrollView>
      </View>
    );
  }

  AppRegistry.registerComponent = originalRegister;
  AppRegistry.registerComponent("main", () => ModuleErrorDisplay);
}
