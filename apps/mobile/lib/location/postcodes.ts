// Postcodes.io API client — free UK postcode API, no key needed
// Used as fallback/supplement for expo-location reverse geocoding

const BASE_URL = "https://api.postcodes.io";
const TIMEOUT_MS = 3000;

interface PostcodeResult {
  postcode: string;
  adminDistrict: string;
  lat: number;
  lng: number;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reverse geocode coordinates to nearest UK postcode.
 * Returns postcode + admin district, or null on failure.
 */
export async function reverseGeocodePostcode(
  lat: number,
  lng: number
): Promise<{ postcode: string; adminDistrict: string } | null> {
  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/postcodes?lon=${lng}&lat=${lat}&limit=1`
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.result || data.result.length === 0) return null;

    const r = data.result[0];
    return {
      postcode: r.postcode,
      adminDistrict: r.admin_district || r.admin_county || "",
    };
  } catch {
    return null;
  }
}

/**
 * Look up a UK postcode to get coordinates + area info.
 * Returns lat/lng + postcode + admin district, or null on failure.
 */
export async function lookupPostcode(
  postcode: string
): Promise<PostcodeResult | null> {
  try {
    const encoded = encodeURIComponent(postcode.trim());
    const res = await fetchWithTimeout(`${BASE_URL}/postcodes/${encoded}`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.result) return null;

    const r = data.result;
    return {
      postcode: r.postcode,
      adminDistrict: r.admin_district || r.admin_county || "",
      lat: r.latitude,
      lng: r.longitude,
    };
  } catch {
    return null;
  }
}
