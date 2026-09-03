// Is the Live Activity actually there? The one question nothing answered.
//
// Three facts, read from the device and written to both the diagnostic
// dump (statusJson.liveActivity) and the server (la.presence_check):
//   enabled  - ActivityKit's areActivitiesEnabled, i.e. the per-app switch
//              in Settings > MileClear > Live Activities. Off on Anthony's
//              own phone and 38 of 387 dumps on 3 Sep 2026, and the app
//              had never once asked.
//   present  - an Activity<MileClearAttributes> exists right now.
//   token    - the device holds a push-to-start token (iOS issues none
//              while activities are disabled).
// plus what we last did about it (local start vs push requested, when).
//
// The probe runs from the foreground handler in _layout.tsx under the
// rule in presenceRule.ts. Detection code is imported lazily: detection.ts
// imports this module, and a static import back would be a cycle.

import { Platform } from "react-native";
import { getDatabase } from "../db";
import { apiRequest } from "../api";
import { decidePresenceProbe } from "./presenceRule";

const KEY_SIGNAL_AT = "la_last_signal_at";
const KEY_SIGNAL_KIND = "la_last_signal_kind";
const KEY_PROBE_AT = "la_presence_probe_at";

export type LiveActivitySignalKind = "local_started" | "push_requested";

async function readState(key: string): Promise<string | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [key]);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function writeState(key: string, value: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [key, value]);
  } catch {
    // diagnostics only
  }
}

/** Called by detection when an activity was started locally or a push-to-start was requested. */
export async function noteLiveActivitySignal(kind: LiveActivitySignalKind): Promise<void> {
  await writeState(KEY_SIGNAL_AT, String(Date.now()));
  await writeState(KEY_SIGNAL_KIND, kind);
}

export interface LiveActivityState {
  enabled: boolean | null;
  present: boolean | null;
  activityId: string | null;
  hasPushToStartToken: boolean | null;
  lastSignalAt: string | null;
  lastSignalKind: LiveActivitySignalKind | null;
  lastStartError: string | null;
}

/** Snapshot for the diagnostic dump. Null fields = not an iOS device or the module is missing. */
export async function getLiveActivityState(): Promise<LiveActivityState> {
  const [signalAt, signalKind] = await Promise.all([readState(KEY_SIGNAL_AT), readState(KEY_SIGNAL_KIND)]);
  const base: LiveActivityState = {
    enabled: null,
    present: null,
    activityId: null,
    hasPushToStartToken: null,
    lastSignalAt: signalAt ? new Date(Number(signalAt)).toISOString() : null,
    lastSignalKind: (signalKind as LiveActivitySignalKind | null) ?? null,
    lastStartError: null,
  };
  if (Platform.OS !== "ios") return base;
  try {
    const la = await import("./index");
    const [enabled, activityId, token] = await Promise.all([
      la.isLiveActivitySupported(),
      la.getActiveActivityId(),
      la.getPushToStartToken().catch(() => null),
    ]);
    return {
      ...base,
      enabled,
      present: !!activityId,
      activityId,
      hasPushToStartToken: !!token,
      lastStartError: la.getLastLiveActivityStartError(),
    };
  } catch {
    return base;
  }
}

/**
 * Foreground probe. Decides from context + cooldown, then records what
 * ActivityKit says alongside what we expected. `present:false` with a
 * recent push_requested signal and enabled:true is the finding we are
 * after: Apple accepted the push and nothing appeared.
 */
export async function probeLiveActivityPresence(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const now = Date.now();
    const [recording, signalAt, probeAt] = await Promise.all([
      readState("auto_recording_active"),
      readState(KEY_SIGNAL_AT),
      readState(KEY_PROBE_AT),
    ]);
    const decision = decidePresenceProbe({
      now,
      recordingOpen: recording === "1",
      lastSignalAt: signalAt ? Number(signalAt) : null,
      lastProbeAt: probeAt ? Number(probeAt) : null,
    });
    if (!decision.probe) return;
    await writeState(KEY_PROBE_AT, String(now));

    const state = await getLiveActivityState();
    const payload = {
      context: decision.context,
      enabled: state.enabled,
      present: state.present,
      hasPushToStartToken: state.hasPushToStartToken,
      lastSignalKind: state.lastSignalKind,
      sinceSignalMs: signalAt ? now - Number(signalAt) : null,
      lastStartError: state.lastStartError,
      osVersion: String(Platform.Version),
    };
    const detection = await import("../tracking/detection");
    detection.logDetectionEvent("la_presence_check", payload).catch(() => {});
    apiRequest("/user/event", { method: "POST", body: JSON.stringify({ type: "la.presence_check", metadata: payload }) }).catch(
      () => {}
    );
  } catch {
    // diagnostics only
  }
}
