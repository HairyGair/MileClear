import { prisma } from "./prisma.js";

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
  message: ExpoPushMessage
): Promise<ExpoPushTicket | null> {
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
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
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
 * Returns null if the user has no push token or on any error.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<ExpoPushTicket | null> {
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
  });
}
