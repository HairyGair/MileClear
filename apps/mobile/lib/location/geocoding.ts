// Geocoding utility using expo-location (free, no API key needed)
// Provides reverse/forward geocoding + current location with in-memory cache
// Falls back to Postcodes.io for UK postcode resolution

import * as Location from "expo-location";
import { reverseGeocodePostcode, lookupPostcode } from "./postcodes";

export interface ResolvedLocation {
  lat: number;
  lng: number;
  address: string | null;
}

// UK postcode regex — matches formats like SW1A 1AA, EC2A 4NE, M1 1AA, etc.
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

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

    // Try expo-location first (has street-level detail)
    let address: string | null = null;
    let hasPostcode = false;

    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        address = formatAddress(results[0]);
        hasPostcode = !!results[0].postalCode;
      }
    } catch {
      // expo-location failed, will fall back to Postcodes.io below
    }

    // If expo-location returned an address without a postcode, try to append one
    if (address && !hasPostcode) {
      const postcodeResult = await reverseGeocodePostcode(lat, lng);
      if (postcodeResult?.postcode) {
        address = `${address}, ${postcodeResult.postcode}`;
      }
    }

    // If expo-location failed entirely, fall back to Postcodes.io
    if (!address) {
      const postcodeResult = await reverseGeocodePostcode(lat, lng);
      if (postcodeResult) {
        address = postcodeResult.adminDistrict
          ? `${postcodeResult.adminDistrict}, ${postcodeResult.postcode}`
          : postcodeResult.postcode;
      }
    }

    if (address) {
      geocodeCache.set(key, address);
    }
    return address;
  } catch {
    return null;
  }
}

export async function forwardGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // If input looks like a UK postcode, use Postcodes.io (faster + more accurate)
    if (UK_POSTCODE_REGEX.test(address.trim())) {
      const result = await lookupPostcode(address);
      if (result) {
        return { lat: result.lat, lng: result.lng };
      }
      // Fall through to expo-location if Postcodes.io fails
    }

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
