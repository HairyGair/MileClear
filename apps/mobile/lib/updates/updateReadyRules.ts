// Pure rules for the "new version ready" banner (lib/updates/updateReady.ts),
// kept apart so the test runner can import them without React Native.

export const CHECK_EVERY_MS = 30 * 60 * 1000;

/** Is it time to ask the server again? */
export function shouldCheckForUpdate(lastCheckMs: number | null, nowMs: number): boolean {
  return lastCheckMs == null || nowMs - lastCheckMs >= CHECK_EVERY_MS;
}

export interface BannerState {
  updateWaiting: boolean;
  recording: boolean;
  /** The driver tapped Later for this waiting update. */
  dismissed: boolean;
}

export function showUpdateBanner(s: BannerState): boolean {
  return s.updateWaiting && !s.recording && !s.dismissed;
}

