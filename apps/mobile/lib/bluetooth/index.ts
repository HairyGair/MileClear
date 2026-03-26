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
// Constants.executionEnvironment is unreliable in SDK 53+ — use appOwnership instead
const isExpoGo = Constants.appOwnership === "expo";
const isNativeBuild = !isExpoGo;

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

// ── Bluetooth trip lifecycle signals ──────────────────────────────────────
// During active recording, periodically check if the user is still connected
// to their vehicle's Bluetooth. If they were connected and then disconnect,
// that's a strong "trip ended" signal (engine off / left the car).

let wasConnectedAtRecordingStart = false;

/**
 * Snapshot the Bluetooth connection state when a recording begins.
 * Call this when auto-recording or a shift starts.
 * If connected to a known vehicle, we'll watch for disconnection.
 */
export async function markBluetoothStateAtStart(): Promise<void> {
  const connected = await checkBluetoothVehicleConnected();
  wasConnectedAtRecordingStart = connected != null;
}

/**
 * Check if a Bluetooth disconnection has occurred since recording started.
 * Returns true if the user WAS connected to a vehicle BT at start but
 * is no longer connected — a strong signal the trip has ended.
 * Returns false if BT wasn't connected at start (can't detect disconnect).
 */
export async function hasBluetoothDisconnected(): Promise<boolean> {
  if (!wasConnectedAtRecordingStart) return false;
  const connected = await checkBluetoothVehicleConnected();
  return connected == null;
}

/**
 * Reset the Bluetooth tracking state. Call when recording ends.
 */
export function resetBluetoothState(): void {
  wasConnectedAtRecordingStart = false;
}
