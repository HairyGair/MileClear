// Home's second chance at notifications (18 Oct 2026). The first ask stays in
// the first-run tour's check screen and Home's setup checklist, before any
// trip: the push token is what lets the server's recording watchdog finish a
// stuck recording or wake a silent engine, so new drivers need it from drive
// one. But 59 of 210 drivers who stopped never gave us a token. So a driver
// whose phone has still never been asked once a trip is saved gets a short
// explanation; only "Allow" fires the system prompt. "Not now" comes back
// once, a few trips later, and that is all. If the phone already has an
// answer (allowed or denied), this never shows; Settings is the route back.
// It replaces the bare Alert trip-form used to show after a save.
//
// Pure and unit-tested. The memory lives in tracking_state on the phone.

export type NotifPermission = "granted" | "denied" | "undetermined";

/** Trips after a "Not now" before the one re-ask. */
export const NOTIF_REASK_AFTER_TRIPS = 5;
/** The in-app ask shows at most this many times. */
export const NOTIF_MAX_ASKS = 2;

export interface NotifAskMemory {
  asks: number;
  /** Trips on this phone when it last showed. */
  atTrips: number;
}

export const NOTIF_ASK_KEY = "notif_ask_after_trip";
/** Set by the old after-save Alert in trip-form and by the tour. */
export const LEGACY_NOTIF_ASKED_KEY = "notification_contextual_asked";

/** Stored JSON, else the old one-time flag (counts as one ask), else never asked. */
export function parseNotifAskMemory(raw: string | null | undefined, legacyAsked: boolean): NotifAskMemory {
  if (raw) {
    try {
      const v = JSON.parse(raw) as Partial<NotifAskMemory>;
      const asks = Number(v.asks);
      const atTrips = Number(v.atTrips);
      if (Number.isFinite(asks) && Number.isFinite(atTrips)) return { asks, atTrips };
    } catch {
      // fall through
    }
  }
  return legacyAsked ? { asks: 1, atTrips: 0 } : { asks: 0, atTrips: 0 };
}

export function shouldShowNotifAsk(i: {
  permission: NotifPermission | null;
  /** Saved trips on this phone; null while unread. */
  trips: number | null;
  memory: NotifAskMemory | null;
}): boolean {
  if (i.permission !== "undetermined" || i.trips === null || !i.memory) return false;
  if (i.trips < 1) return false;
  if (i.memory.asks === 0) return true;
  if (i.memory.asks >= NOTIF_MAX_ASKS) return false;
  return i.trips >= i.memory.atTrips + NOTIF_REASK_AFTER_TRIPS;
}

/** The sheet's words. */
export function notifAskCopy(trips: number): { title: string; body: string; small: string } {
  return {
    title: trips <= 1 ? "Your first trip is saved" : `${trips} trips saved`,
    body: "Get a nudge when a trip needs sorting, and your weekly recap.",
    small: "You can turn them off in Settings at any time.",
  };
}
