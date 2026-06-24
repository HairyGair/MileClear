import "react-native-gesture-handler";
import React, { useEffect, useRef, useState } from "react";
import { View, Text, LogBox, ScrollView, StyleSheet, Alert, AppState, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Font from "expo-font";
import { colors } from "../lib/theme";
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
        <SafeAreaView style={crashStyles.root}>
          <ScrollView contentContainerStyle={crashStyles.content}>
            <View style={crashStyles.iconWrap}>
              <Ionicons name="warning-outline" size={36} color={colors.amber} />
            </View>
            <Text style={crashStyles.title} maxFontSizeMultiplier={1.4}>
              Something went wrong
            </Text>
            <Text style={crashStyles.subtitle} maxFontSizeMultiplier={1.6}>
              MileClear ran into an unexpected error. Your trips are
              still saved — restart the app to continue.
            </Text>
            {this.state.error?.message ? (
              <View style={crashStyles.detailsCard}>
                <Text style={crashStyles.detailsLabel} maxFontSizeMultiplier={1.2}>
                  DIAGNOSTIC
                </Text>
                <Text style={crashStyles.detailsMessage} maxFontSizeMultiplier={1.4}>
                  {this.state.error.message}
                </Text>
              </View>
            ) : null}
            <Text style={crashStyles.support} maxFontSizeMultiplier={1.4}>
              If this keeps happening, email support@mileclear.com.
            </Text>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const crashStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.amberDim,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: colors.text1,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text2,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    padding: 16,
    marginBottom: 24,
  },
  detailsLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: colors.text3,
    letterSpacing: 1,
    marginBottom: 8,
  },
  detailsMessage: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text1,
    lineHeight: 18,
  },
  support: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text3,
    textAlign: "center",
  },
});

import { AuthProvider, useAuth } from "../lib/auth/context";
import { UserProvider, useUser } from "../lib/user/context";
import { ModeProvider } from "../lib/mode/context";
import { SyncProvider } from "../lib/sync/context";
import { HydrationOverlay } from "../components/HydrationOverlay";
import { Skeleton } from "../components/Skeleton";
import { radii, spacing } from "../lib/theme";
import "../lib/tracking/detection";
import {
  setupNotificationResponseHandler,
  registerForPushNotifications,
  registerNotificationCategories,
} from "../lib/notifications/index";
import { setupNotificationChannels, scheduleWeeklyMileageSummary, scheduleTaxYearDeadlineReminder, checkUnclassifiedTripsNudge, checkStreakAtRisk, checkLongRunningShift } from "../lib/notifications/scheduler";
import { registerPushToken } from "../lib/api/notifications";
import { startDriveDetection, finalizeStaleAutoRecordings, registerBackgroundFinalize, bootNativeEngineOnLaunch } from "../lib/tracking/detection";
import { registerGeofences, shadeExpiredUnconfirmedTrips, setDepartureAnchor } from "../lib/geofencing/index";
import { getDatabase } from "../lib/db/index";
import { hydrateLocalData, isHydrationComplete, reconcileSavedLocations, reconcileTrips } from "../lib/sync/hydrate";
import { uploadDiagnosticDump } from "../lib/api/diagnostics";
import { mountAppStateTracker } from "../lib/appState";
import { isIapAvailable, initializeIap, setupPurchaseListeners, endIapConnection } from "../lib/iap/index";
import { validateApplePurchase } from "../lib/api/billing";
import { PaywallProvider } from "../components/paywall";
import { QuickStartModal } from "../components/QuickStartModal";
import { AppLockProvider } from "../lib/appLock/context";
import { AppLockGate } from "../components/AppLockGate";

const HEADER_STYLE = { backgroundColor: "#030712" } as const;
const HEADER_TINT = "#f0f2f5";
const HEADER_TITLE_STYLE = { fontFamily: "PlusJakartaSans_300Light", color: "#f0f2f5" };

// Re-attach the native engine the moment the JS bundle boots — deliberately
// at module scope, BEFORE React mounts or auth resolves. When RNBG relaunches
// a terminated app in the background (stationary-region exit, phone locked in
// a pocket), the auth-gated startDriveDetection below never runs because
// SecureStore/keychain is locked — so without this, the engine stayed deaf and
// every drive on app-terminating devices was lost (Norman Boomer, 5–10 Jun
// 2026). Internally gated on onboarding + permissions; never prompts; never
// throws.
void bootNativeEngineOnLaunch();

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [quickStartVisible, setQuickStartVisible] = useState(false);

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

        // Quick Start tour AUTO-FIRE DISABLED (21 May 2026).
        //
        // Build 67 fresh installs froze immediately after the post-
        // login dashboard render — the 600ms setTimeout fired the
        // QuickStartModal and the modal-on-modal interaction (or
        // AppModal presentationStyle on the dashboard's ScrollView)
        // locked the UI thread. Retention-killer for every new
        // App Store install.
        //
        // Mark the flag eagerly so any user who relaunches into this
        // code path doesn't get the tour fired retroactively when we
        // re-enable it. Users can replay the tour manually from
        // Settings → Help & Tutorials.
        await db
          .runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('quick_start_shown', '1')"
          )
          .catch(() => {
            // Non-fatal — worst case the tour briefly flickered.
          });
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
      // Signed in — clear the logged_out gate so detection (incl. the
      // module-scope bootNativeEngineOnLaunch on future boots) runs again.
      getDatabase()
        .then((db) => db.runAsync("DELETE FROM tracking_state WHERE key = 'logged_out'"))
        .catch(() => {});
      // Finalize stale recordings BEFORE starting detection - otherwise
      // startDriveDetection() fires a location update that the task buffers
      // with the current timestamp, making the trip end time = app open time.
      finalizeStaleAutoRecordings()
        .catch(() => {})
        .finally(() => startDriveDetection());
      registerBackgroundFinalize().catch(() => {});
      // Reconcile saved locations against server truth before registering
      // geofences — otherwise rows deleted on another device would still
      // be registered with iOS, and processGeofenceTrip would tag trips
      // with their stale names. Awaiting indirectly via .then on the
      // reconcile promise keeps the call order correct without blocking.
      // Saved-locations reconcile keeps local SQLite in sync with the
      // server's truth. Geofence registration is now anchor-only (17 May
      // 2026 refactor) — saved locations are no longer iOS geofences —
      // but we still call registerGeofences afterwards to keep the anchor
      // active.
      reconcileSavedLocations()
        .catch(() => {})
        .finally(() => {
          registerGeofences().catch(() => {});
        });
      // Pull server-authoritative trip fields (classification, platform, etc.)
      // into local SQLite. Trips hydrate append-only, so a trip classified
      // server-side / on web / on another device would otherwise stay
      // "unclassified" in the local list forever (the trip-drift bug).
      reconcileTrips().catch(() => {});
      setDepartureAnchor().catch(() => {});
      shadeExpiredUnconfirmedTrips().catch(() => {});
      registerForPushNotifications()
        .then((token) => { if (token) return registerPushToken(token); })
        .catch(() => {});
      // Register the Live Activity push-to-start token (iOS 17.2+) so the
      // server can auto-show the Dynamic Island on a background-detected drive.
      import("../lib/liveActivity")
        .then((m) => m.syncPushToStartToken())
        .catch(() => {});
      scheduleWeeklyMileageSummary().catch(() => {});
      scheduleTaxYearDeadlineReminder().catch(() => {});
      checkUnclassifiedTripsNudge().catch(() => {});
      checkStreakAtRisk().catch(() => {});
      checkLongRunningShift().catch(() => {});
      // Mount BEFORE uploading the diagnostic so the first dump after a
      // cold start already has the current AppState snapshot. Idempotent
      // — the tracker no-ops if already mounted.
      mountAppStateTracker();
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
        // Re-sync the push-to-start token (it can rotate between launches).
        import("../lib/liveActivity")
          .then((m) => m.syncPushToStartToken())
          .catch(() => {});
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
      // Referral invite link: mileclear://r/CODE or https://mileclear.com/r/CODE.
      // Stash the code so the register screen pre-fills it (the friend doesn't
      // have to type it). Helps users who tap a referral link with the app
      // installed; brand-new installs paste the code the web page copied for them.
      const refMatch = url.match(/\/r\/([A-Za-z0-9]{1,16})/i);
      if (refMatch) {
        try {
          const db = await getDatabase();
          await db.runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('pending_referral_code', ?)",
            [refMatch[1].toUpperCase()]
          );
        } catch {}
        return;
      }
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
  }, [router]);

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

        const db = await getDatabase();

        // Three states the "saving" phase can have landed us in:
        //   1. Auto-recording active   → finalize trip (existing path)
        //   2. Active shift            → end shift via API (NEW 12 May 2026)
        //   3. Neither                 → stale state, just dismiss the LA
        //
        // Without case 2, the shift LA's "End Shift" button silently
        // dismissed the LA without ever calling endShift on the server,
        // so Anthony's shift from the previous night stayed alive and
        // today's drives accumulated into it (showing 19+ mi on the
        // dashboard). Anthony 12 May 2026.

        const recording = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
        );
        if (recording?.value === "1") {
          const { finalizeAutoTrip } = await import("../lib/tracking/detection");
          await finalizeAutoTrip();
          return;
        }

        // No auto-trip — check for an active shift the user just ended
        // via the lock-screen "End Shift" button.
        const activeShift = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM shifts WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
        );
        if (activeShift?.id) {
          const { syncEndShift } = await import("../lib/sync/actions");
          try {
            await syncEndShift(activeShift.id);
          } catch {
            // Network or API error — local SQLite already marked
            // completed inside syncEndShift; the sync queue will
            // retry. The LA still gets dismissed below.
          }
          const { endLiveActivityWithSummary } = await import("../lib/liveActivity");
          await endLiveActivityWithSummary({ distanceMiles: 0 }).catch(() => {});
          return;
        }

        // Stale "saving" state with nothing to finalize — dismiss the LA.
        const { endLiveActivity } = await import("../lib/liveActivity");
        await endLiveActivity();
      } catch {}
    };

    // Independent cleanup pass for orphaned geofence trip LAs. Runs on
    // the same triggers as checkPendingFinalize. Cleans up the state
    // where a user departed a saved location, parked at a non-saved
    // location, and the LA has been pinned to the Dynamic Island for
    // hours. Bug surfaced 12 May 2026 after build 65 went out.
    const cleanupOrphanedLA = async () => {
      try {
        const { cleanupStaleGeofenceLA } = await import("../lib/geofencing");
        await cleanupStaleGeofenceLA();
      } catch {}
    };

    // Run once on mount (covers cold launch from intent)
    checkPendingFinalize();
    cleanupOrphanedLA();

    // And on every foreground transition (warm launch from intent)
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkPendingFinalize();
        cleanupOrphanedLA();
      }
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

  // Only block on the onboarding-check when the user IS authenticated.
  // Unauthenticated users (fresh installs, logged-out devices) don't
  // need a DB lookup before seeing the login screen — and gating on
  // a never-resolving onboardingChecked would freeze them forever on
  // the skeleton overlay. 21 May 2026 retention investigation.
  const showLoading = isLoading || (isAuthenticated && !onboardingChecked);

  return (
    <>
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
        <Stack.Screen name="charging-nearby" options={{ headerShown: true, title: "Nearby Chargers" }} />
        <Stack.Screen name="profile-edit" options={{ headerShown: true, title: "Edit Profile" }} />
        <Stack.Screen name="change-password" options={{ headerShown: true, title: "Change Password" }} />
        <Stack.Screen name="active-recording" options={{ headerShown: true, title: "Recording trip" }} />
        <Stack.Screen name="exports" options={{ headerShown: true, title: "Tax Exports" }} />
        <Stack.Screen name="refer" options={{ headerShown: true, title: "Invite Friends" }} />
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
        <Stack.Screen name="vehicle-mot-history" options={{ headerShown: true, title: "MOT History" }} />
        <Stack.Screen name="hmrc-reconciliation" options={{ headerShown: true, title: "HMRC Reconciliation" }} />
        <Stack.Screen name="tax-mtd" options={{ headerShown: true, title: "Tax (MTD)" }} />
        <Stack.Screen name="tax-mtd-nino" options={{ headerShown: true, title: "National Insurance Number" }} />
        <Stack.Screen name="tax-mtd-business" options={{ headerShown: true, title: "Confirm trade" }} />
        <Stack.Screen name="tax-mtd-preview" options={{ headerShown: true, title: "Review submission" }} />
        <Stack.Screen name="tax-mtd-submitted" options={{ headerShown: true, title: "Submitted", headerBackVisible: false }} />
        <Stack.Screen name="tax-mtd-history" options={{ headerShown: true, title: "Submission history" }} />
        <Stack.Screen name="invoices" options={{ headerShown: true, title: "Invoices" }} />
        <Stack.Screen name="invoice-form" options={{ headerShown: true, title: "Add invoice" }} />
        <Stack.Screen name="expenses" options={{ headerShown: true, title: "Expenses" }} />
        <Stack.Screen name="expense-form" options={{ headerShown: true, title: "Add Expense" }} />
        <Stack.Screen name="inbox" options={{ headerShown: true, title: "Inbox" }} />
        <Stack.Screen name="receipt-scan" options={{ headerShown: true, title: "Scan Receipt" }} />
        <Stack.Screen name="accountant" options={{ headerShown: true, title: "My Accountant" }} />
        <Stack.Screen name="help" options={{ headerShown: true, title: "Help & Tutorials" }} />
        {/* Settings hub + sub-screens. Each is a small focused screen so
            individual settings are findable. Profile tab links into here. */}
        <Stack.Screen name="settings/index" options={{ headerShown: true, title: "Settings" }} />
        <Stack.Screen name="settings/general" options={{ headerShown: true, title: "General" }} />
        <Stack.Screen name="settings/tracking" options={{ headerShown: true, title: "Tracking & Locations" }} />
        <Stack.Screen name="settings/work-tax" options={{ headerShown: true, title: "Work & Tax" }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: true, title: "Notifications" }} />
        <Stack.Screen name="settings/visibility" options={{ headerShown: true, title: "What you see" }} />
        <Stack.Screen name="settings/data-exports" options={{ headerShown: true, title: "Data & Exports" }} />
        <Stack.Screen name="settings/community" options={{ headerShown: true, title: "Community" }} />
        <Stack.Screen name="settings/help" options={{ headerShown: true, title: "Help & Feedback" }} />
        <Stack.Screen name="settings/legal" options={{ headerShown: true, title: "Legal" }} />
        <Stack.Screen name="settings/security" options={{ headerShown: true, title: "Security" }} />
      </Stack>
      <QuickStartModal
        visible={quickStartVisible}
        onClose={() => setQuickStartVisible(false)}
      />
      {/* Loading overlay - covers Stack while auth/onboarding resolves.
          Mirrors the dashboard's own skeleton layout so the transition from
          auth-loading -> dashboard-loading -> dashboard is visually
          seamless. Replaces the centred amber spinner that was upstaging
          the dashboard's cascade animation: by the time auth resolved,
          dashboard data was already cached and the cascade fired
          invisibly. With matching skeletons here the cascade lands as
          actual visible polish. */}
      {showLoading && (
        <View style={styles.loadingOverlay}>
          <ScrollView contentContainerStyle={styles.loadingContent}>
            <Skeleton.Group gap={spacing.md}>
              <Skeleton height={32} width={180} radius={radii.pill} />
              <Skeleton height={140} radius={radii.lg} style={{ marginTop: spacing.md }} />
              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                <Skeleton height={56} width="48%" radius={radii.md} />
                <Skeleton height={56} width="48%" radius={radii.md} />
              </View>
              <Skeleton height={120} radius={radii.lg} style={{ marginTop: spacing.lg }} />
              <Skeleton height={120} radius={radii.lg} style={{ marginTop: spacing.md }} />
            </Skeleton.Group>
          </ScrollView>
        </View>
      )}
      <HydrationOverlay visible={hydrating} step={hydrateStep} done={hydrateDone} total={6} />
      {/* App-lock overlay — only when signed in + onboarded, so it never stacks
          over the login/onboarding flow. Covers the UI; the native tracking
          engine (booted at module scope) keeps running while locked. */}
      {isAuthenticated && onboardingComplete && <AppLockGate />}
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <AuthProvider>
          <UserProvider>
            <PaywallProvider>
              <ModeProvider>
                <SyncProvider>
                  <AppLockProvider>
                    <RootNavigator />
                  </AppLockProvider>
                </SyncProvider>
              </ModeProvider>
            </PaywallProvider>
          </UserProvider>
        </AuthProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 999,
  },
  loadingContent: {
    // Mirrors the dashboard's content padding so skeletons line up with
    // where the real cards will land once auth resolves.
    padding: spacing.xl,
    // Top inset to clear the status bar area approximately. The skeleton
    // is intentionally a few px shy of perfect status-bar alignment to
    // avoid Dynamic Island clipping on iPhone 14 Pro+.
    paddingTop: 60,
  },
});
