// iOS Background App Refresh status. When this is "denied" or "restricted",
// iOS will NOT run MileClear in the background at all — so trip recording fails
// no matter how good the detection engine is. The fleet diagnostics found 11
// active users in this state (3 Jun 2026), so we surface a dashboard prompt.
import * as BackgroundFetch from "expo-background-fetch";

export type BackgroundRefreshStatus =
  | "available"
  | "denied"
  | "restricted"
  | "unknown";

export async function getBackgroundRefreshStatus(): Promise<BackgroundRefreshStatus> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Available) return "available";
    if (status === BackgroundFetch.BackgroundFetchStatus.Denied) return "denied";
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) return "restricted";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** True when iOS will not run the app in the background (recording will fail). */
export function isBackgroundRefreshBlocked(status: BackgroundRefreshStatus): boolean {
  return status === "denied" || status === "restricted";
}
