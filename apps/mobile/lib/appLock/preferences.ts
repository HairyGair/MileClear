// App-lock preferences. Stored in the SQLite tracking_state table (key
// "app_lock_config") — deliberately NOT SecureStore: SecureStore items are
// kSecAttrAccessibleAfterFirstUnlock and can be unreadable mid-flight, and the
// lock preference must be readable the instant the app boots (incl. while the
// device is still locked) so the gate decision is never delayed. The preference
// is not a secret — the actual auth is the OS biometric/passcode prompt.
import { getDatabase } from "../db/index";

const CONFIG_KEY = "app_lock_config";

export interface AppLockConfig {
  enabled: boolean;
  // How long the app may sit backgrounded before it re-locks. 0 = lock every
  // time the app leaves the foreground.
  requireAfterMs: number;
}

export const DEFAULT_APP_LOCK_CONFIG: AppLockConfig = {
  enabled: false,
  requireAfterMs: 0,
};

export async function getAppLockConfig(): Promise<AppLockConfig> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [CONFIG_KEY]
    );
    if (!row) return { ...DEFAULT_APP_LOCK_CONFIG };
    return { ...DEFAULT_APP_LOCK_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_APP_LOCK_CONFIG };
  }
}

export async function setAppLockConfig(partial: Partial<AppLockConfig>): Promise<void> {
  const current = await getAppLockConfig();
  const updated = { ...current, ...partial };
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [CONFIG_KEY, JSON.stringify(updated)]
  );
}
