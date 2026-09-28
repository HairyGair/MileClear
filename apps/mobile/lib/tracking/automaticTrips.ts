// The Automatic trips switch, shared by the dashboard row and Settings >
// Tracking & Locations, so both flip the one setting the same way
// (tracking_state.drive_detection_enabled; see detectionOffRule.ts for what
// off now means). Detection is imported lazily, as every screen does, because
// it pulls in the whole native tracking stack.

import { getLocationPermissionStatus, requestOrFixBackgroundLocation } from "../permissions/location";

/** The switch alone: a pause still reads on. */
export async function readAutomaticTrips(): Promise<boolean> {
  const { isDriveDetectionSwitchOn } = await import("./detection");
  return isDriveDetectionSwitchOn();
}

/**
 * Turn Automatic trips on or off. Turning on without "Always" / "Allow all the
 * time" location asks for it first, through the same flow the dashboard's
 * permission cards use, because the switch alone cannot record anything in
 * the background. The switch goes on whatever the answer: the permission
 * cards keep asking, and the driver's choice is stored either way.
 */
export async function setAutomaticTrips(on: boolean): Promise<void> {
  if (on) {
    try {
      const status = await getLocationPermissionStatus();
      if (status.tier !== "always") await requestOrFixBackgroundLocation();
    } catch {
      // Expo Go or no permission module: the switch still goes on.
    }
  }
  const { setDriveDetectionEnabled } = await import("./detection");
  await setDriveDetectionEnabled(on);
}
