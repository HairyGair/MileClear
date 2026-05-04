// Weekly cron: roll up geofence radius observations into per-location-
// type percentile recommendations. Mobile reads the result on saved-
// location creation/edit so the default radius adapts to where users
// actually start driving from each kind of place.
//
// Server foundation. Mobile reporting + read is a separate (deliberate)
// change since it touches Priority 1 trip-recording / geofencing code.

import { prisma } from "../lib/prisma.js";
import { logEvent } from "../services/appEvents.js";

// Only refresh recommendations from observations younger than this. Older
// observations may reflect a stale GPS algorithm or pre-1.1.0 detection
// behaviour, and we don't want them anchoring the recommendation.
const OBSERVATION_FRESHNESS_DAYS = 90;

// Below this many observations the percentile is too noisy to trust;
// mobile falls back to the static 200m default.
const MIN_SAMPLE_SIZE = 50;

// Cap how far an observation can be before we throw it out as bad data.
// 2km from the saved pin to the first driving-speed coord almost
// certainly means the pin is wrong, not that the geofence needs to be
// 2km wide.
const MAX_DISTANCE_M = 2000;

const LOCATION_TYPES = ["home", "work", "depot", "custom"] as const;

function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = (sortedValues.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

export async function runGeofenceRadiusRecommendJob(): Promise<void> {
  const since = new Date(
    Date.now() - OBSERVATION_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
  );

  let updated = 0;
  let skippedNoSample = 0;

  for (const locationType of LOCATION_TYPES) {
    // Pull all observations for this type within the freshness window.
    // We do this in-process rather than via SQL-level percentile because
    // MySQL 8.0 lacks PERCENTILE_CONT in a stable form we can rely on,
    // and the dataset is small (≤100k rows in a year of operation).
    const observations = await prisma.geofenceRadiusObservation.findMany({
      where: {
        locationType,
        recordedAt: { gte: since },
        distanceMeters: { lte: MAX_DISTANCE_M },
      },
      select: { distanceMeters: true },
    });

    if (observations.length < MIN_SAMPLE_SIZE) {
      skippedNoSample++;
      continue;
    }

    const sorted = observations
      .map((o) => o.distanceMeters)
      .sort((a, b) => a - b);
    const p75 = Math.round(quantile(sorted, 0.75));

    await prisma.geofenceRadiusRecommendation.upsert({
      where: { locationType },
      create: {
        locationType,
        p75Meters: p75,
        sampleSize: observations.length,
      },
      update: {
        p75Meters: p75,
        sampleSize: observations.length,
        computedAt: new Date(),
      },
    });
    updated++;
  }

  logEvent("geofence_radius.recompute_completed", null, {
    updated,
    skippedNoSample,
    totalLocationTypes: LOCATION_TYPES.length,
  });

  console.log(
    `[geofenceRadiusRecommend] Updated ${updated} recommendation(s), skipped ${skippedNoSample} for insufficient sample size.`
  );
}
