// Geocoding utility using expo-location (free, no API key needed)
// Provides reverse/forward geocoding + current location with in-memory cache

import * as Location from "expo-location";

export interface ResolvedLocation {
  lat: number;
  lng: number;
  address: string | null;
}

// In-memory cache keyed on rounded lat,lng (3 decimal places ~111m)
const geocodeCache = new Map<string, string>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export function formatAddress(geo: Location.LocationGeocodedAddress): string {
  const parts = [
    geo.streetNumber,
    geo.street,
    geo.city,
    geo.postalCode,
  ].filter(Boolean);
  return parts.join(", ") || "Unknown location";
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const key = cacheKey(lat, lng);
    const cached = geocodeCache.get(key);
    if (cached) return cached;

    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (results.length === 0) return null;

    const address = formatAddress(results[0]);
    geocodeCache.set(key, address);
    return address;
  } catch {
    return null;
  }
}

export async function forwardGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(address);
    if (results.length === 0) return null;
    return { lat: results[0].latitude, lng: results[0].longitude };
  } catch {
    return null;
  }
}

export async function getCurrentLocation(): Promise<ResolvedLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const lat = location.coords.latitude;
    const lng = location.coords.longitude;
    const address = await reverseGeocode(lat, lng);

    return { lat, lng, address };
  } catch {
    return null;
  }
}
