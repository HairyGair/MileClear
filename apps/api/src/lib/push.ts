import { prisma } from "./prisma.js";
import { isPushQuietHours } from "../services/pushQuietHoursRule.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  /** iOS silent push. Triggers content-available=1 in APNS, which wakes the
   *  JS runtime briefly even when the app is fully suspended. Used by the
   *  recording-watchdog to drain stuck recordings without showing the user
   *  a notification. Pair with no title/body/sound. iOS limits to ~3/hour
   *  per app. */
  _contentAvailable?: boolean;
}

export interface PushSendOptions {
  /** Send even between 21:00 and 08:00 UK time. Only for a push answering
   *  something a person just did (a support reply, their own shift ending),
   *  an admin tool, or an alert to admins. Reminders never set this. */
  ignoreQuietHours?: boolean;
}

/**
 * Quiet hours (28 Sep 2026: a shift-only driver was sent a streak reminder at
 * about 04:18 UK time). A visible push is held back between 21:00 and 08:00 UK
 * time unless the caller opts out; a silent content-available push shows the
 * driver nothing, so it always goes. A held push is simply not sent: a job that
 * dedups on "already sent today" must check isPushQuietHours() BEFORE it
 * records the send, so the driver still gets it later in the day.
 */
function heldForQuietHours(message: ExpoPushMessage, options?: PushSendOptions): boolean {
  if (options?.ignoreQuietHours) return false;
  if (message._contentAvailable) return false;
  return isPushQuietHours();
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Send a single push notification via the Expo Push API.
 * Returns the ticket from Expo. Errors are logged but not thrown so
 * callers are never blocked by notification failures.
 */
export async function sendPushNotification(
  message: ExpoPushMessage,
  options?: PushSendOptions
): Promise<ExpoPushTicket | null> {
  if (heldForQuietHours(message, options)) return null;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      console.error(`[push] Expo API responded ${res.status}`);
      return null;
    }

    const json = (await res.json()) as { data: ExpoPushTicket };
    return json.data ?? null;
  } catch (err) {
    console.error("[push] Failed to send notification:", err);
    return null;
  }
}

/**
 * Send multiple push notifications in batches of 100 (Expo's recommended limit).
 * Returns all tickets in order.
 */
export async function sendPushNotifications(
  messages: ExpoPushMessage[],
  options?: PushSendOptions
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];
  if (process.env.NODE_ENV === "test") return []; // never page a real device from a test

  // Held pushes get an error ticket in place so callers that line tickets up
  // with their messages by index still can.
  const held = messages.map((m) => heldForQuietHours(m, options));
  const toSend = messages.filter((_, i) => !held[i]);
  const sentTickets = await sendPushBatches(toSend);
  let next = 0;
  return messages.map((_, i) =>
    held[i]
      ? { status: "error" as const, message: "quiet_hours" }
      : sentTickets[next++] ?? { status: "error" as const, message: "no_ticket" }
  );
}

async function sendPushBatches(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];
  const CHUNK_SIZE = 100;
  const tickets: ExpoPushTicket[] = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        console.error(`[push] Expo batch API responded ${res.status} for chunk ${i}`);
        // Fill with error tickets so index alignment is preserved
        tickets.push(...chunk.map(() => ({ status: "error" as const, message: "http_error" })));
        continue;
      }

      const json = (await res.json()) as { data: ExpoPushTicket[] };
      tickets.push(...(json.data ?? []));
    } catch (err) {
      console.error(`[push] Batch send failed for chunk starting at ${i}:`, err);
      tickets.push(...chunk.map(() => ({ status: "error" as const, message: "network_error" })));
    }
  }

  return tickets;
}

/**
 * Convenience helper: look up the user's push token from the database
 * and send a notification if they have one registered.
 *
 * Returns null if the user has no push token, the push was held for quiet
 * hours, or on any error.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: PushSendOptions
): Promise<ExpoPushTicket | null> {
  if (!options?.ignoreQuietHours && isPushQuietHours()) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });

  if (!user?.pushToken) return null;

  return sendPushNotification({
    to: user.pushToken,
    title,
    body,
    sound: "default",
    data,
  }, options);
}
