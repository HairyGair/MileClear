// Road alerts trial (Oct 2026): small helpers shared by the screen and the
// dashboard card.

import { registerPushToken } from "./api/notifications";
import { registerForPushNotifications } from "./notifications";
import { setNotificationPreferences } from "./notifications/preferences";
import { getDatabase } from "./db/index";

const OFFER_SEEN_KEY = "road_alerts_offer_seen";

export async function roadAlertsOfferSeen(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [OFFER_SEEN_KEY]
    );
    return row != null;
  } catch {
    return true; // if we cannot remember a "Not now", do not risk nagging
  }
}

export async function markRoadAlertsOfferSeen(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      OFFER_SEEN_KEY,
      String(Date.now()),
    ]);
  } catch {
    /* best effort */
  }
}

/** Turn road alerts on: make sure the push token is registered (asks for
 *  permission only if it was never answered), then save the switch, which
 *  syncs it to the server. */
export async function turnOnRoadAlerts(): Promise<void> {
  try {
    const token = await registerForPushNotifications();
    if (token) await registerPushToken(token).catch(() => {});
  } catch {
    /* the switch still saves; Settings shows it */
  }
  await setNotificationPreferences({ roadAlerts: true });
  await markRoadAlertsOfferSeen();
}

/** "Tue 6 Oct, 21:00" in UK time. */
export function formatAlertTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}
