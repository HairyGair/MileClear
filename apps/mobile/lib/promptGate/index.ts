import { AppState } from "react-native";
import { createPromptGate, isNewSession, type PromptId } from "./rule";

export type { PromptId } from "./rule";

const gate = createPromptGate({
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

let backgroundedAt: number | null = null;
let listening = false;

function listenForNewSessions(): void {
  if (listening) return;
  listening = true;
  AppState.addEventListener("change", (state) => {
    if (state === "background") {
      backgroundedAt = Date.now();
    } else if (state === "active") {
      if (isNewSession(backgroundedAt, Date.now())) gate.reset();
      backgroundedAt = null;
    }
  });
}

/**
 * Ask for this app open's one pop-up slot. Await it right before showing an
 * auto-shown ask, and before writing any "seen" flag: on false, show nothing
 * and leave the flag alone so the ask comes back on a later open.
 * Not for anything the driver opened themselves (a tap on an info button).
 */
export function requestPromptSlot(id: PromptId): Promise<boolean> {
  listenForNewSessions();
  return gate.request(id);
}
