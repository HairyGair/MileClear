// X-MileClear-* fraud-prevention header injection.
//
// HMRC mandates Gov-Client-* headers on every MTD API call. The server
// builds those headers from a request's X-MileClear-* headers (see
// apps/api/src/services/hmrc/requestContext.ts). This module owns the
// mobile side: capture device + app context once at startup, attach to
// every outbound request.
//
// We deliberately use vanilla react-native APIs (Platform, Dimensions,
// PixelRatio) rather than expo-device, so this works in Expo Go and
// doesn't add a native build dependency. Where data is unavailable
// (e.g. exact iPhone model without expo-device) the server has sensible
// fallbacks — see requestContext.ts.

import { Platform, Dimensions, PixelRatio, NativeModules } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";

const DEVICE_ID_KEY = "mileclear_device_id";

// Background-readable, device-only keychain accessibility — mirrors the auth
// token storage (lib/api/index.ts). Without this the device ID is stored as
// WHEN_UNLOCKED (the default), so a background task that runs while the phone
// is LOCKED (finalize, sync, native-engine boot) can't read it: the read
// throws, we fall back to a transient per-session ID, and the API call goes
// out with an unstable device identifier. With AFTER_FIRST_UNLOCK the value is
// readable in the background once the device has been unlocked since boot.
const KEYCHAIN_OPTS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let cachedHeaders: Record<string, string> | null = null;
let cachedDeviceId: string | null = null;

/**
 * Get-or-create a UUID device identifier persisted in SecureStore. Acts
 * as the equivalent of Apple's identifierForVendor — stable per app
 * install, reset when the user uninstalls. Used by HMRC for fraud
 * detection (a single device submitting for many users is a red flag).
 */
async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) {
      cachedDeviceId = existing;
      // Migrate installs whose ID predates KEYCHAIN_OPTS (stored as the default
      // WHEN_UNLOCKED). Re-store once this session with background-readable
      // accessibility so future locked-context reads succeed. Fire-and-forget.
      SecureStore.setItemAsync(DEVICE_ID_KEY, existing, KEYCHAIN_OPTS).catch(() => {});
      return existing;
    }
  } catch {
    // SecureStore can throw in background contexts on iOS; fall through
    // and generate a transient ID this session.
  }
  const id = Crypto.randomUUID();
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id, KEYCHAIN_OPTS);
  } catch {
    // ignore — caller still gets the generated id
  }
  cachedDeviceId = id;
  return id;
}

/** Derive an iOS-style timezone offset string in HMRC's required UTC±HH:MM. */
function getTimezoneOffset(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

function getTimezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  } catch {
    return "Europe/London";
  }
}

/**
 * Try to read the device language. SettingsManager is iOS-only;
 * AppLocale is Android-only. Fall back to "en-GB" so we always send
 * something valid.
 */
function getLanguage(): string {
  try {
    if (Platform.OS === "ios") {
      const settings = (NativeModules as { SettingsManager?: { settings?: { AppleLocale?: string; AppleLanguages?: string[] } } }).SettingsManager;
      const fromAppleLocale = settings?.settings?.AppleLocale;
      const fromAppleLanguages = settings?.settings?.AppleLanguages?.[0];
      const raw = fromAppleLocale ?? fromAppleLanguages;
      if (raw) return raw.replace("_", "-");
    } else if (Platform.OS === "android") {
      const config = (NativeModules as { I18nManager?: { localeIdentifier?: string } }).I18nManager;
      if (config?.localeIdentifier) return config.localeIdentifier.replace("_", "-");
    }
  } catch {
    // ignore
  }
  return "en-GB";
}

function appVersion(): string {
  return (Constants.expoConfig?.version ?? "0.0.0").toString();
}

/**
 * Build the fraud-prevention headers once and cache. Headers that change
 * per-request (publicIpTimestamp) are added at attach time.
 */
async function buildBaseHeaders(): Promise<Record<string, string>> {
  if (cachedHeaders) return cachedHeaders;

  const deviceId = await getOrCreateDeviceId();
  const screen = Dimensions.get("screen");
  const scale = PixelRatio.get();
  const platformOs = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

  const headers: Record<string, string> = {
    "X-MileClear-Platform": platformOs,
    "X-MileClear-Device-Id": deviceId,
    "X-MileClear-OS-Version": String(Platform.Version),
    "X-MileClear-Device-Manufacturer": Platform.OS === "ios" ? "Apple" : "Unknown",
    "X-MileClear-Device-Model": "Unknown", // expo-device would give the exact model; not installed
    "X-MileClear-Screen-Width": String(Math.round(screen.width)),
    "X-MileClear-Screen-Height": String(Math.round(screen.height)),
    "X-MileClear-Scaling-Factor": String(Math.round(scale)),
    "X-MileClear-Colour-Depth": "24",
    "X-MileClear-Language": getLanguage(),
    "X-MileClear-Timezone": getTimezoneName(),
    "X-MileClear-Timezone-Offset": getTimezoneOffset(),
    "X-MileClear-App-Version": appVersion(),
  };

  cachedHeaders = headers;
  return headers;
}

/**
 * Build the X-MileClear-* headers for a single outbound request.
 * Cheap on the hot path — most fields are cached, only the public-IP
 * timestamp changes per call.
 */
export async function getClientContextHeaders(): Promise<Record<string, string>> {
  const base = await buildBaseHeaders();
  return {
    ...base,
    "X-MileClear-Public-IP-Timestamp": new Date().toISOString(),
  };
}

/** Test-only: clear caches between tests. */
export function resetClientContextCache(): void {
  cachedHeaders = null;
  cachedDeviceId = null;
}
