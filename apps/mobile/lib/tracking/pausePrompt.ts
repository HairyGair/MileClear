// Ask about a running pause when the driver starts a shift or a trip.
//
// 26 Sep 2026: Peter chose "Pause recording > For a week" on a Wednesday
// evening and then drove two working days with automatic recording off. The
// only sign was one line under the Start Trip buttons, so he filed a missing
// trip report instead. A shift or a Start Trip records its own GPS during a
// pause, but automatic recording stays off afterwards, silently.
//
// So a user-tapped Start Shift / Start Trip asks once: resume, or keep it.
// Either answer carries on with the start; the question never blocks it, and
// any failure here reads as "nothing to ask". Background and notification
// starts never call this (an alert there would have no one to answer it).
//
// The flow takes its side effects as deps so it can be tested in node. The
// default deps load react-native, detection and the API lazily, which keeps
// this file importable anywhere (Expo Go included) and out of vitest's way.

import { pausePromptCopy, type PausePromptCopy } from "./pauseRule";

export type PausePromptSource = "shift" | "trip";
export type PausePromptResult = "not_paused" | "resumed" | "kept";

export interface PausePromptDeps {
  getPauseUntil: () => Promise<number | null>;
  now: () => number;
  ask: (copy: PausePromptCopy) => Promise<"resume" | "keep">;
  resume: () => Promise<void>;
  log: (event: string, data: Record<string, unknown>) => void;
}

/** The flow itself. Never throws. */
export async function runPausePrompt(
  source: PausePromptSource,
  deps: PausePromptDeps
): Promise<PausePromptResult> {
  let until: number | null = null;
  try {
    until = await deps.getPauseUntil();
  } catch {
    return "not_paused";
  }
  const now = deps.now();
  const copy = pausePromptCopy(until, now);
  if (!copy || until === null) return "not_paused";

  let choice: "resume" | "keep" = "keep";
  try {
    choice = await deps.ask(copy);
  } catch {
    choice = "keep";
  }
  const hoursLeft = Math.round((until - now) / 36e5);
  if (choice === "resume") {
    try {
      await deps.resume();
    } catch {
      // The start still goes ahead; the dashboard line still offers Resume.
    }
    safeLog(deps, "pause_prompt.resumed", { source, hoursLeft });
    return "resumed";
  }
  safeLog(deps, "pause_prompt.kept", { source, hoursLeft });
  return "kept";
}

function safeLog(deps: PausePromptDeps, event: string, data: Record<string, unknown>): void {
  try {
    deps.log(event, data);
  } catch {}
}

function askWithAlert(copy: PausePromptCopy): Promise<"resume" | "keep"> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (c: "resume" | "keep") => {
      if (settled) return;
      settled = true;
      resolve(c);
    };
    try {
      const { Alert } = require("react-native");
      Alert.alert(
        copy.title,
        copy.message,
        [
          { text: copy.keepLabel, onPress: () => done("keep") },
          { text: copy.resumeLabel, onPress: () => done("resume") },
        ],
        // Android: a tap outside the alert dismisses it with no button. That
        // reads as "keep", and the start carries on.
        { cancelable: true, onDismiss: () => done("keep") }
      );
    } catch {
      done("keep");
    }
  });
}

const defaultDeps: PausePromptDeps = {
  getPauseUntil: async () => {
    const m = await import("./detection");
    return m.getDrivePauseUntil();
  },
  now: () => Date.now(),
  ask: askWithAlert,
  resume: async () => {
    const m = await import("./detection");
    await m.resumeDriveDetection("manual");
  },
  log: (event, data) => {
    import("./detection")
      .then((m) => m.logDetectionEvent(event, data))
      .catch(() => {});
    import("../api/index")
      .then(({ apiRequest }) =>
        apiRequest("/user/event", { method: "POST", body: JSON.stringify({ type: event, metadata: data }) })
      )
      .catch(() => {});
  },
};

// One question at a time: a double tap on Start must not stack two alerts,
// nor start twice. The second tap gets "busy" and should do nothing.
let inFlight = false;

/**
 * Call before a user-tapped Start Shift / Start Trip, await it, then start
 * whatever the answer. Resolves "resumed" when the driver turned recording
 * back on (refresh any paused UI), "kept" or "not_paused" otherwise, and
 * "busy" when an earlier tap is still being asked (that tap will start).
 */
export async function askAboutPauseBeforeStart(
  source: PausePromptSource
): Promise<PausePromptResult | "busy"> {
  if (inFlight) return "busy";
  inFlight = true;
  try {
    return await runPausePrompt(source, defaultDeps);
  } finally {
    inFlight = false;
  }
}
