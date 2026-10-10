// Recordings that ended without a new trip: log the reason on the phone and
// send it to the server as a `trip.recording_dropped` app event. See
// recordingDropRule.ts for why. Never throws, never blocks the caller: the
// send is fire-and-forget and waits in an SQLite outbox when it cannot go.

import { Platform } from "react-native";
import { scrubCoordinateString } from "@mileclear/shared";
import { getDatabase } from "../db/index";
import {
  buildDropEvent,
  OUTBOX_BATCH,
  OUTBOX_CAP,
  OUTBOX_MAX_AGE_MS,
  type DropInput,
} from "./recordingDropRule";

export const RECORDING_DROPPED_EVENT = "trip.recording_dropped";

/**
 * Record one dropped recording: a `recording_dropped` line in the phone's
 * logs (so it is in the dump and the 24-hour tracking log) and an event in
 * the outbox, then try to send the outbox in the background.
 */
export async function noteRecordingDropped(input: DropInput): Promise<void> {
  try {
    const ev = buildDropEvent(input, Date.now(), Platform.OS);
    // `detail` can carry a raw error message (reason "error"), and a geocode
    // or routing failure can quote the coordinates it was given. Unlike the
    // dump, /user/events stores metadata as sent. Only the string is
    // scrubbed: the whole-object scrub would also blank the fix counts
    // (`coords`, `nativeCoords`), which are not locations.
    if (ev.detail) ev.detail = scrubCoordinateString(ev.detail);
    try {
      // Lazy: detection imports this module.
      const { logDetectionEvent } = await import("./detection");
      await logDetectionEvent("recording_dropped", ev as unknown as Record<string, unknown>);
    } catch {}
    await enqueueOutboxEvent(RECORDING_DROPPED_EVENT, ev as unknown as Record<string, unknown>);
    void flushEventOutbox();
  } catch {
    // Telemetry must never reach the trip pipeline.
  }
}

async function enqueueOutboxEvent(type: string, metadata: Record<string, unknown>): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("INSERT INTO event_outbox (type, metadata, created_at) VALUES (?, ?, ?)", [
    type,
    JSON.stringify(metadata),
    Date.now(),
  ]);
  await db.runAsync(
    "DELETE FROM event_outbox WHERE id <= (SELECT id FROM event_outbox ORDER BY id DESC LIMIT 1 OFFSET ?)",
    [OUTBOX_CAP]
  );
}

let flushing = false;

/**
 * Send what is waiting, oldest first, one batch per call. Safe to call from
 * anywhere and as often as you like: a second call while one is running
 * returns at once, an empty outbox costs one SELECT, and a failed send leaves
 * the rows for next time. Returns how many were sent.
 */
export async function flushEventOutbox(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM event_outbox WHERE created_at < ?", [Date.now() - OUTBOX_MAX_AGE_MS]);
    const rows = await db.getAllAsync<{ id: number; type: string; metadata: string }>(
      "SELECT id, type, metadata FROM event_outbox ORDER BY id ASC LIMIT ?",
      [OUTBOX_BATCH]
    );
    if (rows.length === 0) return 0;
    const events: Array<{ type: string; metadata: Record<string, unknown> }> = [];
    for (const r of rows) {
      try {
        events.push({ type: r.type, metadata: JSON.parse(r.metadata) as Record<string, unknown> });
      } catch {
        // An unreadable row is dropped below with the rest of the batch.
      }
    }
    if (events.length > 0) {
      const { apiRequest } = await import("../api/index");
      try {
        await apiRequest("/user/events", { method: "POST", body: JSON.stringify({ events }) });
      } catch (err) {
        // A definite 4xx (malformed batch) would fail the same way for ever:
        // drop the batch. Anything else (offline, 5xx, a token problem in the
        // background) keeps it for the next try.
        const { isDefiniteClientRejection } = await import("../sync/errors");
        if (!isDefiniteClientRejection(err)) throw err;
      }
    }
    const maxId = rows[rows.length - 1].id;
    await db.runAsync("DELETE FROM event_outbox WHERE id <= ?", [maxId]);
    return events.length;
  } catch {
    return 0;
  } finally {
    flushing = false;
  }
}
