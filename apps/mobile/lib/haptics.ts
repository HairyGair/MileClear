// Haptics — centralised vibration patterns for consistent feel across the app.
//
// Before this module: every button used inline Haptics.notificationAsync(...)
// or Haptics.impactAsync(...) with whatever feedback type seemed right at the
// time, leading to inconsistent feel (some "save" actions buzzed loudly, some
// gently). This wraps them into named patterns:
//
//   selection — light tick for chip taps, toggles, picker selections
//   light     — single light bump for non-critical state changes
//   success   — double tick for save / classify / shift end
//   warning   — medium-impact for "are you sure" moments
//   error     — strong notification haptic for failures
//
// Usage (no hook required since these are fire-and-forget):
//   import { haptic } from "../lib/haptics";
//   haptic("selection");

import * as Haptics from "expo-haptics";

export type HapticPattern = "selection" | "light" | "success" | "warning" | "error";

/** Fire a haptic by named pattern. Silently no-ops on unsupported devices. */
export function haptic(pattern: HapticPattern): void {
  // Fire-and-forget. We never await — haptic latency must not block the UI.
  switch (pattern) {
    case "selection":
      Haptics.selectionAsync().catch(() => {});
      return;
    case "light":
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return;
    case "success":
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    case "warning":
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    case "error":
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
  }
}
