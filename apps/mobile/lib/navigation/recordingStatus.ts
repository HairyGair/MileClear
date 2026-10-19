// The "Recording" chip (DESIGN 1.4): read-only. One SELECT of the recorder's
// own state every few seconds; Directions never write it and never import
// the recorder's code (the forbidden-imports test checks).

import { useEffect, useState } from "react";
import { getDatabase } from "../db";
import { recordingChip, type RecordingChip } from "./rules";

const KEYS = ["auto_recording_active", "active_shift_id", "drive_pause_until", "drive_detection_enabled"];
const POLL_MS = 10_000;

export async function readRecordingChip(nowMs = Date.now()): Promise<RecordingChip> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM tracking_state WHERE key IN (${KEYS.map(() => "?").join(",")})`,
      KEYS
    );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return recordingChip(map, nowMs);
  } catch {
    return null;
  }
}

export function useRecordingChip(active: boolean): RecordingChip {
  const [chip, setChip] = useState<RecordingChip>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const read = () =>
      readRecordingChip().then((c) => {
        if (!cancelled) setChip(c);
      });
    void read();
    const id = setInterval(read, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);
  return chip;
}
