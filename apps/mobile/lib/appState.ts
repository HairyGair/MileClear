// Lightweight AppState tracker. Mounts once at app start, listens for
// foreground/background transitions, exposes a snapshot for diagnostics.
//
// We don't have an iOS-native module for "was the JS runtime suspended
// between events?" — but the AppState transition history is the next-
// best proxy. If a user reports "no trip recorded between 8am and 9am"
// and the AppState log shows the app was backgrounded the entire time
// without a single foreground transition, we know iOS suspended us and
// the background detection task didn't fire.
//
// The history is module-level state and resets on cold start. That's
// intentional — we want the recent transitions, not a long-term log.

import { AppState, type AppStateStatus } from "react-native";

interface AppStateTransition {
  from: AppStateStatus;
  to: AppStateStatus;
  at: number; // ms epoch
  durationMs: number; // how long we were in `from` before transitioning
}

const MAX_HISTORY = 20;

let mounted = false;
let currentState: AppStateStatus = AppState.currentState;
let lastTransitionAt: number = Date.now();
let lastForegroundedAt: number | null =
  currentState === "active" ? Date.now() : null;
let lastBackgroundedAt: number | null =
  currentState === "background" ? Date.now() : null;
const history: AppStateTransition[] = [];

export function mountAppStateTracker(): void {
  if (mounted) return;
  mounted = true;
  AppState.addEventListener("change", (next) => {
    if (next === currentState) return;
    const now = Date.now();
    history.unshift({
      from: currentState,
      to: next,
      at: now,
      durationMs: now - lastTransitionAt,
    });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    currentState = next;
    lastTransitionAt = now;
    if (next === "active") lastForegroundedAt = now;
    if (next === "background") lastBackgroundedAt = now;
  });
}

export interface AppStateInfo {
  currentState: AppStateStatus;
  lastForegroundedAt: string | null;
  lastBackgroundedAt: string | null;
  secondsInCurrentState: number;
  recentTransitions: Array<{
    from: AppStateStatus;
    to: AppStateStatus;
    at: string;
    durationMs: number;
  }>;
}

export function getAppStateInfo(): AppStateInfo {
  const now = Date.now();
  return {
    currentState,
    lastForegroundedAt: lastForegroundedAt
      ? new Date(lastForegroundedAt).toISOString()
      : null,
    lastBackgroundedAt: lastBackgroundedAt
      ? new Date(lastBackgroundedAt).toISOString()
      : null,
    secondsInCurrentState: Math.round((now - lastTransitionAt) / 1000),
    recentTransitions: history.map((t) => ({
      from: t.from,
      to: t.to,
      at: new Date(t.at).toISOString(),
      durationMs: t.durationMs,
    })),
  };
}
