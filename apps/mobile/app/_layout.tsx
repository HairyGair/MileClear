import React, { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, LogBox, ScrollView, StyleSheet, Alert, AppState, Linking } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Font from "expo-font";
import {
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

LogBox.ignoreLogs(["Not Found"]);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Root ErrorBoundary caught:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: "#030712", padding: 40, justifyContent: "center" }}>
          <Text style={{ color: "#ef4444", fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>App Crash</Text>
          <ScrollView>
            <Text style={{ color: "#f0f2f5", fontSize: 13, lineHeight: 20 }}>{this.state.error?.message}</Text>
            <Text style={{ color: "#6b7280", fontSize: 11, marginTop: 12, lineHeight: 16 }}>{this.state.error?.stack?.slice(0, 800)}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

import { AuthProvider, useAuth } from "../lib/auth/context";
import { UserProvider, useUser } from "../lib/user/context";
import { ModeProvider } from "../lib/mode/context";
import { SyncProvider } from "../lib/sync/context";
import { SyncStatusBar } from "../components/SyncStatusBar";
import { HydrationOverlay } from "../components/HydrationOverlay";
import "../lib/tracking/detection";
import {
  setupNotificationResponseHandler,
  registerForPushNotifications,
  registerNotificationCategories,
} from "../lib/notifications/index";
import { setupNotificationChannels, scheduleWeeklyMileageSummary, scheduleTaxYearDeadlineReminder, checkUnclassifiedTripsNudge, checkStreakAtRisk, checkLongRunningShift } from "../lib/notifications/scheduler";
import { registerPushToken } from "../lib/api/notifications";
import { startDriveDetection, finalizeStaleAutoRecordings } from "../lib/tracking/detection";
import { registerGeofences, shadeExpiredUnconfirmedTrips, setDepartureAnchor } from "../lib/geofencing/index";
import { getDatabase } from "../lib/db/index";
import { hydrateLocalData, isHydrationComplete } from "../lib/sync/hydrate";
import { uploadDiagnosticDump } from "../lib/api/diagnostics";
import { isIapAvailable, initializeIap, setupPurchaseListeners, endIapConnection } from "../lib/iap/index";
import { validateApplePurchase } from "../lib/api/billing";
import { PaywallProvider } from "../components/paywall";

const HEADER_STYLE = { backgroundColor: "#030712" } as const;
const HEADER_TINT = "#f0f2f5";
const HEADER_TITLE_STYLE = { fontFamily: "PlusJakartaSans_300Light", color: "#f0f2f5" };

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setOnboardingChecked(true);
      return;
    }
    getDatabase()
      .then(async (db) => {
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'onboarding_complete'"
        );
        if (row?.value === "true") {
          setOnboardingComplete(true);
        } else {
          await db.runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('onboarding_complete', 'true')"
          );
          setOnboardingComplete(true);
        }
        setOnboardingChecked(true);
      })
      .catch(() => {
        setOnboardingComplete(false);
        setOnboardingChecked(true);
      });
  }, [isAuthenticated]);

  const [hydrating, setHydrating] = useState(false);
  const [hydrateStep, setHydrateStep] = useState("Preparing...");
  const [hydrateDone, setHydrateDone] = useState(0);
  const hydrateRan = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || isLoading || hydrateRan.current) return;
    hydrateRan.current = true;
    isHydrationComplete().then((done) => {
      if (done) return;
      setHydrating(true);

      const timeout = setTimeout(() => {
        console.warn("Hydration timed out after 30s, continuing anyway");
        setHydrating(false);
      }, 30000);

      hydrateLocalData((step, stepDone) => {
        setHydrateStep(step);
        setHydrateDone(stepDone);
      })
        .catch(console.error)
        .finally(() => {
          clearTimeout(timeout);
          setHydrating(false);
        });
    });
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      // Finalize stale recordings BEFORE starting detection - otherwise
      // startDriveDetection() fires a location update that the task buffers
      // with the current timestamp, making the trip end time = app open time.
      finalizeStaleAutoRecordings()
        .catch(() => {})
        .finally(() => startDriveDetection());
      registerGeofences().catch(() => {});
      setDepartureAnchor().catch(() => {});
      shadeExpiredUnconfirmedTrips().catch(() => {});
      registerForPushNotifications()
        .then((token) => { if (token) return registerPushToken(token); })
        .catch(() => {});
      scheduleWeeklyMileageSummary().catch(() => {});
      scheduleTaxYearDeadlineReminder().catch(() => {});
      checkUnclassifiedTripsNudge().catch(() => {});
      checkStreakAtRisk().catch(() => {});
      checkLongRunningShift().catch(() => {});
      uploadDiagnosticDump().catch(() => {});
    }
  }, [isAuthenticated, isLoading]);

  // Restart drive detection every time the app comes to foreground.
  // iOS can clear the location subscription overnight (app kill, reboot, update),
  // and the old isTaskRegisteredAsync guard silently prevented re-registration.
  // This ensures detection is always running when the app is active.
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        finalizeStaleAutoRecordings()
          .catch(() => {})
          .finally(() => startDriveDetection());
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, isLoading]);

  // Heartbeat telemetry: fires on first authenticated session and on every
  // foregrounding afterwards. Internally rate-limited to once per 24h so
  // frequent backgrounding doesn't hammer the API.
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    import("../lib/heartbeat").then(({ maybeSendHeartbeat }) => {
      maybeSendHeartbeat().catch(() => {});
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      import("../lib/heartbeat").then(({ maybeSendHeartbeat }) => {
        maybeSendHeartbeat().catch(() => {});
      });
    });
    return () => sub.remove();
  }, [isAuthenticated, isLoading]);

  // Handle deep links from Live Activity buttons (end-trip, cancel-trip)
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const url = event.url;
      if (url === "mileclear://dashboard") {
        router.navigate("/(tabs)/dashboard");
        return;
      }
      if (url === "mileclear://trips") {
        router.navigate("/(tabs)/trips");
        return;
      }
      if (url === "mileclear://active-recording") {
        // Live Activity / Dynamic Island tap, persistent notification tap,
        // or any other surface that signals "show me the trip in progress".
        router.navigate("/active-recording" as any);
        return;
      }
      if (url === "mileclear://classify-trip") {
        // Sent by the "Classify Trip" CTA on the ended-phase Live Activity.
        // Route to the trips inbox so the user can tap Business/Personal.
        router.navigate("/(tabs)/trips");
        return;
      }
      if (url === "mileclear://end-trip") {
        try {
          // Instant visual feedback - flip the Live Activity into "saving"
          // phase BEFORE running finalize, so the user sees "Saving trip..."
          // regardless of whether we're on iOS 16.x (no App Intent) or 17+
          // (App Intent already did this in the widget process).
          const { markLiveActivitySaving } = await import("../lib/liveActivity");
          await markLiveActivitySaving(0);

          const { finalizeAutoTrip } = await import("../lib/tracking/detection");
          // Check if there's an active shift first
          const db = await getDatabase();
          const activeShift = await db.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
          );
          if (activeShift) {
            // Navigate to dashboard where they can end the shift properly
            router.navigate("/(tabs)/dashboard");
          } else {
            // Auto-trip: finalize immediately. The finalize flow will flip
            // the Live Activity to the "ended" phase with final stats.
            await finalizeAutoTrip();
          }
        } catch {}
      } else if (url === "mileclear://cancel-trip") {
        try {
          const { cancelAutoRecording } = await import("../lib/tracking/detection");
          await cancelAutoRecording(true);
          const { endLiveActivity } = await import("../lib/liveActivity");
          await endLiveActivity();
        } catch {}
      }
    };

    const sub = Linking.addEventListener("url", handleUrl);
    // Also handle cold launch from deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    return () => sub.remove();
  }, []);

  // Process pending finalization when the app opens or returns to foreground.
  //
  // On iOS 17+, the EndTripIntent runs in the widget extension process when
  // the user taps "End Trip" on the lock screen. The intent flips the Live
  // Activity to phase="saving" instantly and opens the main app via
  // openAppWhenRun=true. The main app doesn't know it was launched by the
  // intent per se, but it can detect the pending finalize by checking the
  // Live Activity phase: if it's "saving" and we have an active auto-
  // recording in SQLite, the intent is waiting for us to finish the job.
  //
  // This hook runs on app mount AND on every AppState -> active transition,
  // covering: cold launch from intent, warm foreground from intent, and
  // the iOS 16.x deep-link fallback (which also flips the LA via the URL
  // handler above).
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const checkPendingFinalize = async () => {
      try {
        const { getLiveActivityPhase } = await import("../lib/liveActivity");
        const phase = await getLiveActivityPhase();
        if (phase !== "saving") return;

        // Confirm we actually have an active recording to finalize -
        // otherwise the "saving" state is stale and we just dismiss it.
        const db = await getDatabase();
        const recording = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
        );
        if (recording?.value === "1") {
          const { finalizeAutoTrip } = await import("../lib/tracking/detection");
          await finalizeAutoTrip();
        } else {
          // Stale "saving" state with nothing to finalize - dismiss the LA.
          const { endLiveActivity } = await import("../lib/liveActivity");
          await endLiveActivity();
        }
      } catch {}
    };

    // Run once on mount (covers cold launch from intent)
    checkPendingFinalize();

    // And on every foreground transition (warm launch from intent)
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPendingFinalize();
    });
    return () => sub.remove();
  }, [isAuthenticated, isLoading]);

  // Apple In-App Purchase: global listener for StoreKit transactions
  const { refreshUser } = useUser();
  useEffect(() => {
    if (!isAuthenticated || isLoading || !isIapAvailable()) return;

    let cleanup: (() => void) | undefined;

    initializeIap().then((ok) => {
      if (!ok) return;
      cleanup = setupPurchaseListeners({
        onPurchaseSuccess: async (transactionId) => {
          await validateApplePurchase(transactionId);
          refreshUser();
        },
        onPurchaseError: (error) => {
          Alert.alert(
            "Purchase Failed",
            error.message || "Something went wrong with your purchase."
          );
        },
      });
    });

    return () => {
      cleanup?.();
      endIapConnection();
    };
  }, [isAuthenticated, isLoading, refreshUser]);

  const showLoading = isLoading || !onboardingChecked;

  return (
    <>
      {isAuthenticated && !showLoading && <SyncStatusBar />}
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: HEADER_STYLE,
          headerTintColor: HEADER_TINT,
          headerTitleStyle: HEADER_TITLE_STYLE,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="onboarding" redirect={!isAuthenticated || onboardingComplete} />
        <Stack.Screen name="(tabs)" redirect={!isAuthenticated || !onboardingComplete} />
        <Stack.Screen name="(auth)" redirect={isAuthenticated} />
        <Stack.Screen name="trip-form" options={{ headerShown: true, title: "Add Trip" }} />
        <Stack.Screen name="vehicle-form" options={{ headerShown: true, title: "Add Vehicle" }} />
        <Stack.Screen name="work-schedule" options={{ headerShown: true, title: "Work Schedule" }} />
        <Stack.Screen name="earning-form" options={{ headerShown: true, title: "Add Earning" }} />
        <Stack.Screen name="fuel-form" options={{ headerShown: true, title: "Log Fuel" }} />
        <Stack.Screen name="profile-edit" options={{ headerShown: true, title: "Edit Profile" }} />
        <Stack.Screen name="change-password" options={{ headerShown: true, title: "Change Password" }} />
        <Stack.Screen name="active-recording" options={{ headerShown: true, title: "Recording trip" }} />
        <Stack.Screen name="exports" options={{ headerShown: true, title: "Tax Exports" }} />
        <Stack.Screen name="achievements" options={{ headerShown: true, title: "Achievements" }} />
        <Stack.Screen name="csv-import" options={{ headerShown: true, title: "Import CSV" }} />
        <Stack.Screen name="open-banking" options={{ headerShown: true, title: "Open Banking" }} />
        <Stack.Screen name="admin-users" options={{ headerShown: true, title: "User Management" }} />
        <Stack.Screen name="admin-user-detail" options={{ headerShown: true, title: "User Detail" }} />
        <Stack.Screen name="admin-health" options={{ headerShown: true, title: "System Health" }} />
        <Stack.Screen name="feedback" options={{ headerShown: true, title: "Suggestions" }} />
        <Stack.Screen name="feedback-form" options={{ headerShown: true, title: "Submit Suggestion" }} />
        <Stack.Screen name="admin-feedback" options={{ headerShown: true, title: "Manage Feedback" }} />
        <Stack.Screen name="sync-status" options={{ headerShown: true, title: "Sync Status" }} />
        <Stack.Screen name="drive-detection-diagnostics" options={{ headerShown: true, title: "Drive Detection" }} />
        <Stack.Screen name="saved-locations" options={{ headerShown: true, title: "Saved Locations" }} />
        <Stack.Screen name="saved-location-form" options={{ headerShown: true, title: "Add Location" }} />
        <Stack.Screen name="insights" options={{ headerShown: true, title: "Insights & Analytics" }} />
        <Stack.Screen name="analytics" options={{ headerShown: true, title: "Driving Analytics" }} />
        <Stack.Screen name="classification-rules" options={{ headerShown: true, title: "Classification Rules" }} />
        <Stack.Screen name="admin-revenue" options={{ headerShown: true, title: "Revenue" }} />
        <Stack.Screen name="admin-engagement" options={{ headerShown: true, title: "Engagement" }} />
        <Stack.Screen name="admin-auto-trips" options={{ headerShown: true, title: "Auto-trip Health" }} />
        <Stack.Screen name="admin-push" options={{ headerShown: true, title: "Push Notifications" }} />
        <Stack.Screen name="admin-email" options={{ headerShown: true, title: "Email Campaigns" }} />
        <Stack.Screen name="customize-layout" options={{ headerShown: false }} />
        <Stack.Screen name="self-assessment" options={{ headerShown: true, title: "Self Assessment" }} />
        <Stack.Screen name="first-tax-return" options={{ headerShown: true, title: "First-Time Guide" }} />
      </Stack>
      {/* Loading overlay - covers Stack while auth/onboarding resolves */}
      {showLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#f5a623" />
        </View>
      )}
      <HydrationOverlay visible={hydrating} step={hydrateStep} done={hydrateDone} total={6} />
    </>
  );
}

export default function RootLayout() {
  // Load fonts in background - never block the navigator
  useEffect(() => {
    Font.loadAsync({
      PlusJakartaSans_300Light,
      PlusJakartaSans_400Regular,
      PlusJakartaSans_500Medium,
      PlusJakartaSans_600SemiBold,
      PlusJakartaSans_700Bold,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    registerNotificationCategories();
    setupNotificationResponseHandler();
    setupNotificationChannels().catch(console.error);
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <UserProvider>
          <PaywallProvider>
            <ModeProvider>
              <SyncProvider>
                <RootNavigator />
              </SyncProvider>
            </ModeProvider>
          </PaywallProvider>
        </UserProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#030712",
    zIndex: 999,
  },
});
