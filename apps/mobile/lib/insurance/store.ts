// The insurance miles setting, kept on this phone in tracking_state like the
// weekly goal and Home's hidden rows, one per account (a second driver signing
// in on the same phone does not inherit it). Best-effort: a failed read is
// "not set", a failed write is swallowed, so Home never breaks on a storage
// error. `insuranceVersion` goes up on every save or remove, so Home can tell
// the setting changed while it was away.

import { parseSetting, type InsuranceMilesSetting } from "./miles";

export const INSURANCE_MILES_KEY = "insurance_miles";

const keyFor = (userId: string) => `${INSURANCE_MILES_KEY}:${userId}`;

let version = 0;
export function insuranceVersion(): number {
  return version;
}

async function db() {
  const mod = await import("../db/index");
  return mod.getDatabase();
}

export async function getInsuranceMiles(userId: string | null | undefined): Promise<InsuranceMilesSetting | null> {
  if (!userId) return null;
  try {
    const d = await db();
    const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [
      keyFor(userId),
    ]);
    return parseSetting(row?.value);
  } catch {
    return null;
  }
}

export async function setInsuranceMiles(
  userId: string | null | undefined,
  setting: InsuranceMilesSetting | null
): Promise<void> {
  if (!userId) return;
  version += 1;
  try {
    const d = await db();
    if (setting === null) {
      await d.runAsync("DELETE FROM tracking_state WHERE key = ?", [keyFor(userId)]);
    } else {
      await d.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
        keyFor(userId),
        JSON.stringify(setting),
      ]);
    }
  } catch {
    // best-effort
  }
}
