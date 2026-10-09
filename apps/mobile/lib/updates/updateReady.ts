// "A new version of MileClear is ready": tell the driver when an update has
// downloaded, instead of waiting for the next time the app starts from cold.
//
// Tom, 9 Oct 2026: the odometer shipped at 17:05 and at 17:32 he wrote "on
// iPhone there is nowhere to add an odometer reading". His phone was still on
// the 7 Oct update. expo-updates only checks when the app starts from fully
// closed and only uses what it downloaded on the start after that, and a
// phone that keeps MileClear in the background can go days without either.
//
// So on launch and whenever the app comes back to the screen (at most every
// CHECK_EVERY_MS), check for an update and download it. Once one is waiting,
// the tab screens show a small banner with Restart. Never while anything is
// recording: a restart would cut off the trip, shift or Start Trip.

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { isRecordingNow } from "./firstOpenUpdate";

import { shouldCheckForUpdate, showUpdateBanner } from "./updateReadyRules";

export { CHECK_EVERY_MS, shouldCheckForUpdate, showUpdateBanner } from "./updateReadyRules";

type LogFn = (event: string, data?: Record<string, unknown>) => Promise<void>;

async function getLog(): Promise<LogFn | null> {
  try {
    return (await import("../tracking/detection")).logDetectionEvent;
  } catch {
    return null;
  }
}

function getUpdates(): any | null {
  try {
    const Updates = require("expo-updates");
    return Updates?.isEnabled ? Updates : null; // off in Expo Go and dev
  } catch {
    return null;
  }
}

let lastCheckMs: number | null = null;
let waiting = false;

/** Check and download. Resolves true when a newer update is waiting to be used. */
export async function checkForWaitingUpdate(nowMs: number = Date.now()): Promise<boolean> {
  if (waiting) return true;
  const Updates = getUpdates();
  if (!Updates || !shouldCheckForUpdate(lastCheckMs, nowMs)) return false;
  lastCheckMs = nowMs;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check?.isAvailable) return false;
    // isNew is false when the launch-time download already fetched it: it is
    // still newer than what is running, so it is still waiting.
    await Updates.fetchUpdateAsync();
    waiting = true;
    return true;
  } catch (err) {
    const log = await getLog();
    await log?.("ota.banner_check_failed", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
    return false;
  }
}

/** Banner state for the tab screens. */
export function useUpdateReady(): { visible: boolean; restart: () => void; later: () => void } {
  const [updateWaiting, setUpdateWaiting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownLogged = useRef(false);

  const run = useCallback(async () => {
    const found = await checkForWaitingUpdate();
    if (!found) return;
    setUpdateWaiting(true);
    setRecording(await isRecordingNow());
  }, []);

  useEffect(() => {
    void run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      // Coming back to the screen: offer it again, and re-read recording.
      setDismissed(false);
      void run();
    });
    return () => sub.remove();
  }, [run]);

  const visible = showUpdateBanner({ updateWaiting, recording, dismissed });

  useEffect(() => {
    if (!visible || shownLogged.current) return;
    shownLogged.current = true;
    void getLog().then((log) => log?.("ota.banner_shown").catch(() => {}));
  }, [visible]);

  const restart = useCallback(() => {
    void (async () => {
      if (await isRecordingNow()) {
        setRecording(true);
        return;
      }
      const log = await getLog();
      await log?.("ota.banner_restart").catch(() => {});
      await getUpdates()?.reloadAsync();
    })();
  }, []);

  const later = useCallback(() => {
    setDismissed(true);
    void getLog().then((log) => log?.("ota.banner_later").catch(() => {}));
  }, []);

  return { visible, restart, later };
}
