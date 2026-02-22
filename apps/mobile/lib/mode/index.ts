import { getDatabase } from "../db/index";

export type AppMode = "work" | "personal";

const MODE_KEY = "app_mode";

export async function getAppMode(): Promise<AppMode> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [MODE_KEY]
  );
  return row?.value === "personal" ? "personal" : "work";
}

export async function setAppMode(mode: AppMode): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [MODE_KEY, mode]
  );
}
