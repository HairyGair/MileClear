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

// The first-run tour (lib/tutorial) runs as its own screen. While the root
// layout is still deciding whether this account gets it, Home can already be
// mounted underneath, so every auto-shown ask waits for that answer, and
// stands down if the tour is about to take over. Set by the root layout.
let hold: Promise<boolean> | null = null;

/** Hold every auto-shown ask until `tourWillShow` resolves; true means show none of them. */
export function holdPromptsFor(tourWillShow: Promise<boolean>): void {
  hold = tourWillShow;
}

/** Resolves once the first-run decision is known: true while the tour is taking over. */
export async function promptHoldSettled(): Promise<boolean> {
  return hold ? hold.catch(() => false) : false;
}

/** The tour is over (or never ran): asks may show again. */
export function releasePromptHold(): void {
  hold = null;
}

/**
 * Ask for this app open's one pop-up slot. Await it right before showing an
 * auto-shown ask, and before writing any "seen" flag: on false, show nothing
 * and leave the flag alone so the ask comes back on a later open.
 * Not for anything the driver opened themselves (a tap on an info button).
 */
export async function requestPromptSlot(id: PromptId): Promise<boolean> {
  listenForNewSessions();
  if (hold) {
    const tourWillShow = await hold.catch(() => false);
    if (tourWillShow) return false;
  }
  return gate.request(id);
}
