// "Open MileClear before you drive" (7 Oct 2026). Sarah Webb's phone was on
// 5% during an evening drive, then nothing reached us until she opened the app
// at 10:37 the next morning: the phone had almost certainly run flat, and after
// an iPhone restarts the app does not wake for drives until it is opened once.
// Both morning drives were missed. She had the 08:16 morning briefing on her
// lock screen the whole time.
//
// So on those mornings the briefing says that instead. Only for a phone that
// was at 10% or less and not charging at its last drive start: without the
// battery test ~30 phones a morning qualify, half of them back within three
// hours on their own (dry run 23 Sep - 7 Oct), which would be noise.

import { prisma } from "../lib/prisma.js";

export const QUIET_MIN_MS = 6 * 60 * 60 * 1000;
export const QUIET_LOOKBACK_MS = 26 * 60 * 60 * 1000;
export const LOW_BATTERY_PERCENT = 10;

export interface QuietSignal {
  batteryPercent: number | null;
  charging: boolean | null;
}

/** Pure: was the phone low enough, and unplugged, to have switched off? */
export function looksLikeFlatBattery(s: QuietSignal): boolean {
  return s.batteryPercent != null && s.batteryPercent <= LOW_BATTERY_PERCENT && s.charging === false;
}

export const PHONE_QUIET_TITLE = "Open MileClear before you drive";
export const PHONE_QUIET_BODY =
  "Your battery was nearly flat on your last drive and we haven't heard from your phone since. If it switched off, open MileClear once so today's drives record.";

/**
 * Users whose latest drive start (in the last 26h, at least 6h ago) came from
 * a phone at 10% or less and unplugged, with nothing from the phone since.
 * Server-written event families don't count as the phone talking.
 */
export async function findPhonesQuietAfterLowBattery(now: Date): Promise<Set<string>> {
  const lookback = new Date(now.getTime() - QUIET_LOOKBACK_MS);
  const cutoff = new Date(now.getTime() - QUIET_MIN_MS);
  const rows = await prisma.$queryRaw<
    Array<{ userId: string; batteryPercent: unknown; charging: unknown }>
  >`
    SELECT e.userId,
      JSON_EXTRACT(e.metadata, '$.batteryPercent') AS batteryPercent,
      JSON_EXTRACT(e.metadata, '$.charging') AS charging
    FROM app_events e
    JOIN (
      SELECT userId, MAX(createdAt) AS lastSignalAt
      FROM app_events
      WHERE type = 'trip.signal_start' AND createdAt > ${lookback}
      GROUP BY userId
    ) s ON s.userId = e.userId AND e.createdAt = s.lastSignalAt AND e.type = 'trip.signal_start'
    WHERE s.lastSignalAt < ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM app_events e2
        WHERE e2.userId = e.userId
          AND e2.createdAt > TIMESTAMPADD(MINUTE, 2, s.lastSignalAt)
          AND e2.type NOT LIKE 'notification.%'
          AND e2.type NOT LIKE 'alert.%'
          AND e2.type NOT LIKE 'watchdog.%'
          AND e2.type NOT LIKE 'billing.%'
      )
  `;
  const out = new Set<string>();
  for (const r of rows) {
    const pct = r.batteryPercent == null ? null : Number(r.batteryPercent);
    const ch = r.charging == null ? null : String(r.charging) === "true" || String(r.charging) === "1";
    if (looksLikeFlatBattery({ batteryPercent: Number.isFinite(pct) ? pct : null, charging: ch })) {
      out.add(r.userId);
    }
  }
  return out;
}
