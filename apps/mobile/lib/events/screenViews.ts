/**
 * Screen-view telemetry: which of the app's destinations people actually open.
 *
 * We had 156 event types and not one of them recorded a screen being opened, so
 * navigation decisions were being made from proxies like row counts. This
 * records one event per screen open and nothing else.
 *
 * Transport is the one that already exists: apiRequest -> POST /user/event(s)
 * -> the server's logEvent() -> the AppEvent table, the same path refer.tsx has
 * used for referral.screen_viewed. The only addition is the batch sibling
 * (/user/events), because a tracker that fires a request every time someone
 * changes screen is worse than no telemetry.
 *
 * Network cost: nothing is sent on navigation. Views accumulate in memory and
 * leave the device only when the app goes to the background or the buffer fills
 * (FLUSH_THRESHOLD views), so an ordinary session of tapping around the app
 * costs exactly one request, sent as the user leaves.
 *
 * Consent: this follows the convention the heartbeat and the diagnostic dump
 * already set - automatic for signed-in users, no separate toggle, with the
 * privacy guarantee enforced on content rather than on an opt-in. The privacy
 * policy already declares "Feature usage analytics (anonymous)" under Usage and
 * Device Data. Route names only: never a trip id, coordinate, address, email or
 * query parameter value. See routeName.ts for how ids are stripped.
 */

import { AppState, type AppStateStatus } from "react-native";
import { apiRequest } from "../api/index";
import { routeNameFromSegments } from "./routeName";

/** The one event type this module emits. */
export const SCREEN_VIEWED_EVENT = "screen.viewed";

/** Hard cap on buffered views. Matches the server's batch limit. */
export const MAX_BUFFER = 50;

/** Flush early once this many views pile up inside a single foreground run. */
export const FLUSH_THRESHOLD = 20;

interface BufferedEvent {
  type: string;
  metadata: { route: string };
}

let buffer: BufferedEvent[] = [];
let lastRoute: string | null = null;
let flushing = false;
let enabled = false;

/**
 * Turn tracking on or off. Off clears anything buffered, so a signed-out
 * session never carries views into the next account on the device.
 */
export function setScreenTrackingEnabled(next: boolean): void {
  enabled = next;
  if (!next) {
    buffer = [];
    lastRoute = null;
  }
}

/**
 * Record one screen open. Takes raw expo-router segments and never a resolved
 * pathname, so dynamic segments stay as their file-system pattern.
 *
 * Consecutive duplicates are dropped: a re-render or a param change on the
 * same screen is not a new visit, and collapsing them keeps the buffer honest.
 */
export function recordScreenView(segments: readonly string[]): void {
  try {
    if (!enabled) return;
    const route = routeNameFromSegments(segments);
    if (route === lastRoute) return;
    lastRoute = route;
    buffer.push({ type: SCREEN_VIEWED_EVENT, metadata: { route } });
    // Drop the oldest rather than grow without bound if flushes keep failing.
    if (buffer.length > MAX_BUFFER) {
      buffer = buffer.slice(buffer.length - MAX_BUFFER);
    }
    if (buffer.length >= FLUSH_THRESHOLD) {
      void flushScreenViews();
    }
  } catch {
    // Telemetry must never throw into a navigation path.
  }
}

/**
 * Send whatever is buffered. Safe to call at any time and from anywhere: it
 * no-ops when empty or already in flight, and it never rejects.
 *
 * A failed send puts the events back at the front of the buffer so an offline
 * stretch retries on the next flush instead of losing the session.
 */
export async function flushScreenViews(): Promise<void> {
  try {
    if (!enabled || flushing || buffer.length === 0) return;
    flushing = true;
    const batch = buffer;
    buffer = [];
    try {
      await apiRequest("/user/events", {
        method: "POST",
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // Offline, 401 mid-refresh, server down: keep the newest and retry later.
      const restored = [...batch, ...buffer];
      buffer = restored.slice(Math.max(0, restored.length - MAX_BUFFER));
    } finally {
      flushing = false;
    }
  } catch {
    flushing = false;
  }
}

/**
 * Flush when the app leaves the foreground - the moment a session's views are
 * complete and the last chance to send them before iOS suspends us.
 *
 * Returns an unsubscribe function.
 */
export function mountScreenViewFlush(): () => void {
  const handler = (state: AppStateStatus) => {
    if (state !== "active") void flushScreenViews();
  };
  const sub = AppState.addEventListener("change", handler);
  return () => {
    try {
      sub.remove();
    } catch {
      // nothing to undo
    }
  };
}

/** Test seam: how many views are waiting to be sent. */
export function bufferedScreenViewCount(): number {
  return buffer.length;
}
