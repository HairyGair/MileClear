// Dev tool: simulate a trip without driving. Injects a synthetic GPS route into
// the detection buffer and runs the REAL finalize pipeline (distance, road-match,
// phantom guards, save, sync, display) — so we can test capture->save end to end
// on a real phone, repeatably, in seconds. It does NOT test wake/start detection
// (that needs real driving or an Xcode-Simulator GPX route), only everything
// downstream of "the engine has the coordinates".
//
// Admin-gated in the UI. Refuses to run while a real recording/shift is active.
import { getDatabase } from "../db/index";
import { finalizeAutoTrip, logDetectionEvent } from "./detection";

export interface SimulateResult {
  ok: boolean;
  message: string;
}

export async function simulateTrip(targetMiles: number): Promise<SimulateResult> {
  try {
    const db = await getDatabase();

    // Never clobber a genuine in-progress recording or shift.
    const rec = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    const shift = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    if (rec?.value === "1" || shift?.value) {
      return {
        ok: false,
        message: "A real recording or shift is active. End it first, then simulate.",
      };
    }

    // Build a synthetic route heading roughly NE from a Sunderland start, at a
    // steady ~29 mph with timestamps spanning the implied duration, ~12 fixes
    // per mile, slight jitter so it reads like a real trace.
    await db.runAsync("DELETE FROM detection_coordinates");
    const startLat = 54.906;
    const startLng = -1.3835;
    const bearing = (40 * Math.PI) / 180;
    const N = Math.max(12, Math.round(targetMiles * 12));
    const totalM = targetMiles * 1609.344;
    const stepM = totalM / (N - 1);
    const speedMs = 13.0; // ~29 mph
    const stepSec = stepM / speedMs;
    const now = Date.now();
    for (let i = 0; i < N; i++) {
      const dM = stepM * i;
      const dLat = (dM * Math.cos(bearing)) / 111320;
      const dLng =
        (dM * Math.sin(bearing)) / (111320 * Math.cos((startLat * Math.PI) / 180));
      const jitter = i % 2 === 0 ? 0.00002 : -0.00002;
      const ts = new Date(now - (N - 1 - i) * stepSec * 1000).toISOString();
      await db.runAsync(
        "INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?)",
        [startLat + dLat + jitter, startLng + dLng, speedMs, 8, ts]
      );
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('auto_recording_active', '1')"
    );
    logDetectionEvent("simulate_trip_started", { targetMiles, coords: N }).catch(() => {});

    // Snapshot trip ids, run the REAL finalize, find the new trip (if any).
    const beforeIds = new Set(
      (await db.getAllAsync<{ id: string }>("SELECT id FROM trips")).map((r) => r.id)
    );
    await finalizeAutoTrip();
    const rows = await db.getAllAsync<{ id: string; distance_miles: number; classification: string }>(
      "SELECT id, distance_miles, classification FROM trips"
    );
    const created = rows.find((r) => !beforeIds.has(r.id));

    if (created) {
      const miles = Number(created.distance_miles).toFixed(2);
      return {
        ok: true,
        message: `Saved a ${miles} mi trip (${created.classification}). Target was ${targetMiles} mi. Check your trip list.`,
      };
    }
    return {
      ok: false,
      message: `Finalize ran but no trip was saved — a guard dropped it (check the events for the drop reason). Target ${targetMiles} mi.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Simulation failed.",
    };
  }
}
