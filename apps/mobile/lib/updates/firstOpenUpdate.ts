// On the first open after an App Store update, move straight to the latest
// over-the-air update instead of running the version Apple shipped.
//
// Chris Saunders, 26 Sep 2026: he updated to 1.3.11 from the App Store and
// "Save as place" had gone. His phone reported isEmbeddedLaunch with a bundle
// from 11 Sep, when build 90 was cut: expo-updates launches the bundle inside
// the binary, downloads the newer update in the background and only uses it
// on the NEXT launch. So everyone who updated from the release email ran a
// fortnight-old app for their first session, missing the walk fixes, the
// pause changes and Save as place.
//
// Now, on an embedded launch only, the app checks for a newer update, and if
// one downloads while it is safe to restart (app on screen, nothing
// recording, still within the first minute) it restarts into it. Otherwise it
// leaves things as they were: the update applies on the next open.

export const FIRST_OPEN_WINDOW_MS = 60 * 1000;

export type FirstOpenSkip =
  | "not_embedded"
  | "updates_disabled"
  | "background"
  | "recording"
  | "too_late";

export interface FirstOpenState {
  isEnabled: boolean;
  isEmbeddedLaunch: boolean;
  appActive: boolean;
  recording: boolean;
  msSinceLaunch: number;
}

/** Before touching the network: is this a launch we would ever restart? */
export function firstOpenPrecheck(s: Pick<FirstOpenState, "isEnabled" | "isEmbeddedLaunch">): FirstOpenSkip | null {
  if (!s.isEnabled) return "updates_disabled";
  if (!s.isEmbeddedLaunch) return "not_embedded";
  return null;
}

/** With a new update downloaded: restart now, or leave it for the next open? */
export function firstOpenRestartDecision(s: FirstOpenState): { restart: true } | { restart: false; reason: FirstOpenSkip } {
  const pre = firstOpenPrecheck(s);
  if (pre) return { restart: false, reason: pre };
  if (!s.appActive) return { restart: false, reason: "background" };
  if (s.recording) return { restart: false, reason: "recording" };
  if (s.msSinceLaunch > FIRST_OPEN_WINDOW_MS) return { restart: false, reason: "too_late" };
  return { restart: true };
}

/** Anything that must not be cut off by a restart: an auto recording, a shift or a Start Trip. */
export async function isRecordingNow(): Promise<boolean> {
  try {
    const { getDatabase } = await import("../db/index");
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM tracking_state WHERE key IN ('auto_recording_active', 'active_shift_id')"
    );
    return rows.some((r) => (r.key === "auto_recording_active" ? r.value === "1" : !!r.value));
  } catch {
    // Unknown means do not restart: the update still applies on the next open.
    return true;
  }
}

let started = false;

/** Call once at startup. Never throws; does nothing in Expo Go or dev. */
export async function applyFreshUpdateOnFirstOpen(launchedAt: number = Date.now()): Promise<void> {
  if (started) return;
  started = true;
  let log: ((event: string, data?: Record<string, unknown>) => Promise<void>) | null = null;
  try {
    log = (await import("../tracking/detection")).logDetectionEvent;
  } catch {
    log = null;
  }
  try {
    const Updates = require("expo-updates");
    const pre = firstOpenPrecheck({
      isEnabled: !!Updates?.isEnabled,
      isEmbeddedLaunch: !!Updates?.isEmbeddedLaunch,
    });
    if (pre) return; // the normal case on every launch but the first after an install

    const check = await Updates.checkForUpdateAsync();
    if (!check?.isAvailable) {
      await log?.("ota.first_open_none").catch(() => {});
      return;
    }
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched?.isNew) return;

    const { AppState } = require("react-native");
    const decision = firstOpenRestartDecision({
      isEnabled: true,
      isEmbeddedLaunch: true,
      appActive: AppState.currentState === "active",
      recording: await isRecordingNow(),
      msSinceLaunch: Date.now() - launchedAt,
    });
    if (!decision.restart) {
      await log?.("ota.first_open_deferred", { reason: decision.reason }).catch(() => {});
      return;
    }
    await log?.("ota.first_open_applied", { ms: Date.now() - launchedAt }).catch(() => {});
    await Updates.reloadAsync();
  } catch (err) {
    await log?.("ota.first_open_failed", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
  }
}
