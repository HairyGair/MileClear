import * as Location from "expo-location";
import { Alert, Linking } from "react-native";

export type LocationPermissionTier = "none" | "foreground" | "always";

export interface LocationPermissionStatus {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus;
  tier: LocationPermissionTier;
}

/**
 * Snapshot of the user's current Location permission state across both
 * foreground and background tiers, plus a derived `tier` summary.
 */
export async function getLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();

  let tier: LocationPermissionTier = "none";
  if (fg.status === "granted" && bg.status === "granted") {
    tier = "always";
  } else if (fg.status === "granted") {
    tier = "foreground";
  }

  return { foreground: fg.status, background: bg.status, tier };
}

/**
 * Smart escalation: gets the user from wherever they are now to "Always
 * Allow" via the most appropriate path.
 *
 * iOS deliberately makes this a two-step process. The user must first grant
 * foreground ("While Using App") access, then iOS prompts separately for
 * background ("Always") access. If the app has never asked, Settings
 * doesn't even contain a Location row for the user to flip manually -
 * we have to trigger the in-app prompt to make the row appear.
 *
 *  - foreground undetermined:  fire FG prompt in-app
 *  - foreground granted, BG undetermined: fire BG prompt in-app
 *  - any tier denied OR prompts didn't actually escalate: explain and
 *    deep-link to Settings with the exact toggle path spelled out
 *
 * Returns the final status after every attempt.
 *
 * `showSettingsAlert` (default true) controls the Path-3 fallback Alert that
 * deep-links to Settings. Callers that render their own inline guidance (e.g.
 * the onboarding location step) pass false so the user isn't hit with a system
 * Alert on top of their own UI.
 */
export async function requestOrFixBackgroundLocation(
  opts: { showSettingsAlert?: boolean } = {}
): Promise<LocationPermissionStatus> {
  const { showSettingsAlert = true } = opts;
  let status = await getLocationPermissionStatus();

  // Path 1: never been asked - fire the in-app FG prompt. This also creates
  // the Location row in iOS Settings, which is otherwise hidden.
  if (status.foreground === "undetermined") {
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // ignore, will fall through to Settings
    }
    status = await getLocationPermissionStatus();
  }

  // Path 2: FG granted but BG never asked - fire BG prompt. iOS may or may
  // not actually present the dialog (depends on heuristics around prior use);
  // we re-check status after and fall through to Settings if it didn't take.
  if (status.foreground === "granted" && status.background === "undetermined") {
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {
      // ignore, will fall through to Settings
    }
    status = await getLocationPermissionStatus();
  }

  // Path 3: still not "always" - explain the manual route and offer Settings.
  if (status.tier !== "always" && showSettingsAlert) {
    showSettingsExplainer(status);
  }

  return status;
}

// ── Permission-after-value ──────────────────────────────────────────────────
//
// The activation funnel's biggest leak (~47% of users) is the Always-location
// ask landing BEFORE the user has seen the app do anything. This prompt flips
// the order: it fires right after a trip was successfully captured — the user
// is looking at proof of value — and offers to "make it automatic". Gated to
// foreground-tier users, max once per 7 days and 3 times ever, so it never
// becomes a nag.

const AFTER_CAPTURE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const AFTER_CAPTURE_MAX_ASKS = 3;

function trackActivationEvent(type: string, metadata?: Record<string, unknown>): void {
  import("../api/index")
    .then(({ apiRequest }) =>
      apiRequest("/user/event", {
        method: "POST",
        body: JSON.stringify({ type, metadata }),
      })
    )
    .catch(() => {});
}

/**
 * Offer the Always upgrade right after a captured trip. Returns true when the
 * prompt was shown (callers should skip competing prompts like the rating ask
 * for this save). Never throws.
 */
export async function maybeOfferAlwaysAfterCapture(
  distanceMiles: number | null
): Promise<boolean> {
  try {
    const status = await getLocationPermissionStatus();
    if (status.tier !== "foreground") return false;

    const { getDatabase } = await import("../db/index");
    const db = await getDatabase();
    const [lastRow, countRow] = await Promise.all([
      db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'always_after_capture_asked_at'"
      ),
      db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'always_after_capture_ask_count'"
      ),
    ]);
    const lastAsk = lastRow ? Number(lastRow.value) : 0;
    const askCount = countRow ? Number(countRow.value) : 0;
    if (askCount >= AFTER_CAPTURE_MAX_ASKS) return false;
    if (Number.isFinite(lastAsk) && Date.now() - lastAsk < AFTER_CAPTURE_COOLDOWN_MS) {
      return false;
    }

    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('always_after_capture_asked_at', ?)",
      [Date.now().toString()]
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('always_after_capture_ask_count', ?)",
      [String(askCount + 1)]
    );
    trackActivationEvent("activation.always_after_capture_shown", {
      askNumber: askCount + 1,
      distanceMiles,
    });

    const milesLine =
      distanceMiles != null && distanceMiles > 0
        ? `That's ${distanceMiles.toFixed(1)} miles in the log. `
        : "";
    Alert.alert(
      "Make it automatic?",
      `${milesLine}Drives like this can record by themselves — even with the app closed and your phone in your pocket. One setting does it.`,
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => trackActivationEvent("activation.always_after_capture_declined"),
        },
        {
          text: "Make it automatic",
          onPress: () => {
            trackActivationEvent("activation.always_after_capture_accepted");
            requestOrFixBackgroundLocation().catch(() => {});
          },
        },
      ]
    );
    return true;
  } catch {
    return false;
  }
}

function showSettingsExplainer(status: LocationPermissionStatus) {
  const fgGranted = status.foreground === "granted";

  const title = fgGranted
    ? "One more step for auto-detection"
    : "Tracking needs location access";

  const message = fgGranted
    ? 'iOS hides "Always Allow" one tap deeper than it should.\n\nIn Settings:\n  1. Tap Location\n  2. Tap Always\n  3. Make sure Precise Location is on'
    : 'MileClear needs location access to record your trips.\n\nIn Settings:\n  1. Tap Location\n  2. Tap "Always" (or "While Using App" first if Always is not offered)\n  3. Make sure Precise Location is on';

  Alert.alert(title, message, [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => Linking.openSettings() },
  ]);
}
