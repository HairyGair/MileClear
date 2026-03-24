import { prisma } from "../lib/prisma.js";
import { haversineDistance } from "@mileclear/shared";

interface ClassificationResult {
  classification: "business" | "personal" | null;
  platformTag: string | null;
  /** Which saved location(s) matched, for logging */
  matchedLocations: string[];
}

/**
 * Auto-classify a trip based on saved locations and past trip patterns.
 *
 * Rules:
 * - If start OR end is near a work/depot location -> business
 * - If start AND end are both near home (and no work locations involved) -> personal
 * - If a shift is active -> business
 * - Otherwise, check past classified trips near the same endpoint for suggestions
 * - Returns null classification if no confident match
 */
export async function autoClassifyTrip(
  userId: string,
  startLat: number,
  startLng: number,
  endLat: number | null,
  endLng: number | null,
  shiftId?: string | null
): Promise<ClassificationResult> {
  const result: ClassificationResult = {
    classification: null,
    platformTag: null,
    matchedLocations: [],
  };

  // If trip is part of a shift, it's business
  if (shiftId) {
    result.classification = "business";
    // Try to suggest platform from recent shift trips
    const recentShiftTrip = await prisma.trip.findFirst({
      where: { userId, shiftId, platformTag: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { platformTag: true },
    });
    if (recentShiftTrip?.platformTag) {
      result.platformTag = recentShiftTrip.platformTag;
    }
    return result;
  }

  // Fetch user's saved locations
  const savedLocations = await prisma.savedLocation.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      locationType: true,
      latitude: true,
      longitude: true,
      radiusMeters: true,
    },
  });

  if (savedLocations.length === 0) return result;

  // Check which saved locations the start and end points are near
  const METERS_TO_MILES = 0.000621371;

  type MatchedLocation = typeof savedLocations[number];
  let startMatch: MatchedLocation | null = null;
  let endMatch: MatchedLocation | null = null;

  for (const loc of savedLocations) {
    const radiusMiles = loc.radiusMeters * METERS_TO_MILES;
    // Add a small buffer (50m) for GPS drift
    const effectiveRadius = (loc.radiusMeters + 50) * METERS_TO_MILES;

    const startDist = haversineDistance(startLat, startLng, loc.latitude, loc.longitude);
    if (startDist <= effectiveRadius) {
      startMatch = loc;
    }

    if (endLat != null && endLng != null) {
      const endDist = haversineDistance(endLat, endLng, loc.latitude, loc.longitude);
      if (endDist <= effectiveRadius) {
        endMatch = loc;
      }
    }
  }

  if (startMatch) result.matchedLocations.push(`start:${startMatch.name}(${startMatch.locationType})`);
  if (endMatch) result.matchedLocations.push(`end:${endMatch.name}(${endMatch.locationType})`);

  const startType = startMatch?.locationType ?? null;
  const endType = endMatch?.locationType ?? null;

  const workTypes = new Set(["work", "depot"]);

  // If either endpoint is a work/depot location -> business
  if ((startType && workTypes.has(startType)) || (endType && workTypes.has(endType))) {
    result.classification = "business";

    // Try to suggest platform tag from past trips near same locations
    result.platformTag = await suggestPlatformTag(userId, startLat, startLng, endLat, endLng);
    return result;
  }

  // If both are home -> personal (e.g. round trip from home)
  if (startType === "home" && endType === "home") {
    result.classification = "personal";
    return result;
  }

  // If start is home and end is unmatched (or vice versa), check past patterns
  if (startMatch || endMatch) {
    // We know at least one endpoint is a saved location but not work/depot
    // Fall through to pattern matching below
  }

  // Pattern matching: check past classified trips near end point
  if (endLat != null && endLng != null) {
    result.platformTag = await suggestPlatformTag(userId, startLat, startLng, endLat, endLng);
  }

  return result;
}

/**
 * Suggest a platform tag based on past classified trips near the same endpoints.
 */
async function suggestPlatformTag(
  userId: string,
  startLat: number,
  startLng: number,
  endLat: number | null,
  endLng: number | null
): Promise<string | null> {
  // Check end point first (more specific), then start
  const lat = endLat ?? startLat;
  const lng = endLng ?? startLng;

  // ~500m bounding box
  const latDelta = 0.0045;
  const lngDelta = 0.0045 / Math.cos((lat * Math.PI) / 180);

  const nearby = await prisma.trip.findMany({
    where: {
      userId,
      classification: "business",
      platformTag: { not: null },
      endLat: { gte: lat - latDelta, lte: lat + latDelta },
      endLng: { gte: lng - lngDelta, lte: lng + lngDelta },
    },
    select: { platformTag: true },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  if (nearby.length < 2) return null;

  // Count platform tags
  const counts: Record<string, number> = {};
  for (const t of nearby) {
    if (t.platformTag) {
      counts[t.platformTag] = (counts[t.platformTag] ?? 0) + 1;
    }
  }

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;

  // Only suggest if >50% agreement
  const confidence = top[1] / nearby.length;
  return confidence >= 0.5 ? top[0] : null;
}
