// Bluetooth vehicle detection for auto-confirming geofence trips (Premium)
// Checks if a known vehicle Bluetooth device is connected during a trip.
//
// Expo Go: BLE not available — always returns false (falls back to notification confirm)
// Native build: Checks bonded/connected peripherals against stored vehicle BT names
//
// Vehicle BT names are cached in tracking_state as JSON array (synced when vehicles load)

import { Platform } from "react-native";
import Constants from "expo-constants";
import { getDatabase } from "../db/index";

// Guard: BLE libraries crash in Expo Go
const isNativeBuild =
  Constants.executionEnvironment === "storeClient" ||
  Constants.executionEnvironment === "standalone";

let BleManager: any = null;
if (isNativeBuild) {
  try {
    BleManager = require("react-native-ble-manager").default;
  } catch {
    // Not installed or not linked
  }
}

let bleInitialized = false;

async function ensureBleStarted(): Promise<boolean> {
  if (!BleManager) return false;
  if (bleInitialized) return true;

  try {
    await BleManager.start({ showAlert: false });
    bleInitialized = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache vehicle Bluetooth names locally for background geofence checks.
 * Call this after fetching vehicles from the API.
 */
export async function cacheVehicleBluetoothNames(
  vehicles: Array<{ bluetoothName: string | null }>
): Promise<void> {
  const names = vehicles
    .map((v) => v.bluetoothName)
    .filter((n): n is string => !!n && n.trim().length > 0);

  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('vehicle_bt_names', ?)",
    [JSON.stringify(names)]
  );
}

/**
 * Check if any vehicle's Bluetooth device is currently connected.
 * Returns the device name if matched, or null if no match / BLE unavailable.
 *
 * Called by the geofencing engine when a trip is detected.
 * If matched, the trip is auto-confirmed (no notification needed).
 */
export async function checkBluetoothVehicleConnected(): Promise<string | null> {
  if (!isNativeBuild || !BleManager) return null;

  const started = await ensureBleStarted();
  if (!started) return null;

  try {
    // Get list of bonded (paired) peripherals
    const bonded: Array<{ name?: string; id: string }> =
      Platform.OS === "ios"
        ? await BleManager.getConnectedPeripherals([])
        : await BleManager.getBondedPeripherals();

    if (!bonded || bonded.length === 0) return null;

    // Get cached vehicle BT names from tracking_state
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'vehicle_bt_names'"
    );
    if (!row) return null;

    let vehicleBtNames: string[];
    try {
      vehicleBtNames = JSON.parse(row.value);
    } catch {
      return null;
    }
    if (!vehicleBtNames.length) return null;

    // Normalize for comparison
    const normalizedNames = vehicleBtNames.map((n) => n.toLowerCase().trim());

    // Check if any connected/bonded device matches
    for (const peripheral of bonded) {
      if (!peripheral.name) continue;
      const peripheralName = peripheral.name.toLowerCase().trim();
      if (normalizedNames.includes(peripheralName)) {
        return peripheral.name;
      }
    }

    return null;
  } catch (err) {
    console.warn("Bluetooth check failed:", err);
    return null;
  }
}

/**
 * Whether Bluetooth auto-confirm is available on this device.
 * Returns false in Expo Go or if BLE manager isn't installed.
 */
export function isBluetoothAvailable(): boolean {
  return isNativeBuild && BleManager != null;
}
