/**
 * Trip anomaly detection — pure logic, no side effects.
 * Detects unusual patterns in trip data and returns questions for the user.
 * Also detects location-specific slow zones and stops for community intelligence.
 */

export interface TripAnomalyDef {
  type: string;
  question: string;
  options: string[];
}

export interface LocationQuestion {
  type: "slow_zone" | "long_stop" | "sudden_slowdown";
  question: string;
  options: string[];
  lat: number;
  lng: number;
  placeName: string | null;
  durationMins: number;
  avgSpeedMph: number;
}

export interface SlowZone {
  type: "slow_zone" | "long_stop" | "sudden_slowdown";
  lat: number;
  lng: number;
  durationMins: number;
  avgSpeedMph: number;
  startIdx: number;
  endIdx: number;
}

interface AnomalyInsights {
  routeEfficiency?: number;
  numberOfStops?: number;
  timeStoppedSecs?: number;
  timeMovingSecs?: number;
}

interface Crumb {
  lat: number;
  lng: number;
  speed: number | null; // m/s from GPS
  recordedAt: string;
}

const MS_TO_MPH = 2.23694;
const SLOW_THRESHOLD_MS = 4.47; // ~10 mph
const STOP_THRESHOLD_MS = 1.5; // ~3.4 mph
const MIN_SLOW_DURATION_SECS = 180; // 3 minutes
const MIN_STOP_DURATION_SECS = 180; // 3 minutes
const MAX_LOCATION_QUESTIONS = 3;

/**
 * Detect anomalies in a completed trip.
 * Returns an array of anomaly definitions (most significant first).
 */
export function detectAnomalies(
  distanceMiles: number,
  durationSecs: number,
  insights: AnomalyInsights | null
): TripAnomalyDef[] {
  const anomalies: TripAnomalyDef[] = [];

  // Very short trip
  if (distanceMiles < 0.3 && durationSecs > 120) {
    anomalies.push({
      type: "very_short",
      question: "This was a very short trip. Worth keeping?",
      options: ["Short delivery", "Parking relocation", "Wrong destination", "Discard it"],
    });
  }

  // Very long trip
  if (distanceMiles > 100) {
    anomalies.push({
      type: "very_long",
      question: "That was a long haul! What type of trip?",
      options: ["Long distance delivery", "Commute", "Road trip", "Intercity transfer", "Other"],
    });
  }

  if (insights) {
    // Indirect route
    if (insights.routeEfficiency != null && insights.routeEfficiency > 4.0) {
      anomalies.push({
        type: "indirect_route",
        question: "Your route was quite indirect. What happened?",
        options: ["Multiple deliveries", "Detour/road closure", "Got lost", "Exploring", "Other"],
      });
    }

    // Many stops
    if (
      insights.numberOfStops != null &&
      insights.numberOfStops > 5 &&
      distanceMiles < 10
    ) {
      anomalies.push({
        type: "many_stops",
        question: "You had quite a few stops. What was happening?",
        options: ["Multiple drop-offs", "Heavy traffic", "Picking up orders", "Errands", "Other"],
      });
    }

    // Long idle
    if (
      insights.timeStoppedSecs != null &&
      insights.timeMovingSecs != null &&
      durationSecs > 300 // trip longer than 5 min
    ) {
      const totalTime = insights.timeStoppedSecs + insights.timeMovingSecs;
      if (totalTime > 0 && insights.timeStoppedSecs / totalTime > 0.4) {
        anomalies.push({
          type: "long_idle",
          question: "You were stationary for a while. Everything OK?",
          options: ["Waiting for order", "Break/rest", "Traffic jam", "Loading/unloading", "Other"],
        });
      }
    }
  }

  return anomalies;
}

/**
 * Detect slow zones and long stops from GPS breadcrumbs.
 * Finds stretches where speed was consistently low or the driver was stopped,
 * excluding the first/last 2 minutes of the trip (expected slow near start/end).
 */
export function detectSlowZones(crumbs: Crumb[], tripAvgSpeedMph: number): SlowZone[] {
  if (crumbs.length < 10 || tripAvgSpeedMph < 10) return [];

  const zones: SlowZone[] = [];
  const tripStart = new Date(crumbs[0].recordedAt).getTime();
  const tripEnd = new Date(crumbs[crumbs.length - 1].recordedAt).getTime();
  const BUFFER_MS = 120_000; // Ignore first/last 2 mins (start/end of trip)

  let segStart = -1;
  let segType: "slow_zone" | "long_stop" | null = null;

  for (let i = 0; i < crumbs.length; i++) {
    const t = new Date(crumbs[i].recordedAt).getTime();
    // Skip start/end buffer
    if (t - tripStart < BUFFER_MS || tripEnd - t < BUFFER_MS) {
      if (segStart >= 0) {
        finaliseSegment(segStart, i - 1);
        segStart = -1;
        segType = null;
      }
      continue;
    }

    const speed = crumbs[i].speed;
    if (speed == null) continue;

    const isStopped = speed < STOP_THRESHOLD_MS;
    const isSlow = speed >= STOP_THRESHOLD_MS && speed < SLOW_THRESHOLD_MS;

    if (isStopped || isSlow) {
      const currentType: "slow_zone" | "long_stop" = isStopped ? "long_stop" : "slow_zone";
      if (segStart < 0) {
        segStart = i;
        segType = currentType;
      }
      // If type changes within a segment, keep the more severe (long_stop)
      if (currentType === "long_stop" && segType === "slow_zone") {
        segType = "long_stop";
      }
    } else {
      if (segStart >= 0) {
        finaliseSegment(segStart, i - 1);
        segStart = -1;
        segType = null;
      }
    }
  }

  // Close any open segment
  if (segStart >= 0) {
    finaliseSegment(segStart, crumbs.length - 1);
  }

  function finaliseSegment(start: number, end: number) {
    if (end <= start) return;
    const durSecs =
      (new Date(crumbs[end].recordedAt).getTime() -
        new Date(crumbs[start].recordedAt).getTime()) /
      1000;

    const minDur =
      segType === "long_stop" ? MIN_STOP_DURATION_SECS : MIN_SLOW_DURATION_SECS;
    if (durSecs < minDur) return;

    // Calculate midpoint and avg speed
    const midIdx = Math.floor((start + end) / 2);
    let speedSum = 0;
    let speedCount = 0;
    for (let j = start; j <= end; j++) {
      if (crumbs[j].speed != null) {
        speedSum += crumbs[j].speed! * MS_TO_MPH;
        speedCount++;
      }
    }

    zones.push({
      type: segType!,
      lat: crumbs[midIdx].lat,
      lng: crumbs[midIdx].lng,
      durationMins: Math.round(durSecs / 60),
      avgSpeedMph: speedCount > 0 ? Math.round(speedSum / speedCount) : 0,
      startIdx: start,
      endIdx: end,
    });
  }

  // Sort by duration descending, take top N
  zones.sort((a, b) => b.durationMins - a.durationMins);
  return zones.slice(0, MAX_LOCATION_QUESTIONS);
}

// Options for location-specific questions
const SLOW_ZONE_OPTIONS = [
  "Heavy traffic",
  "Roadworks",
  "Accident or breakdown",
  "Road closure/diversion",
  "School traffic",
  "Event or market",
  "Weather conditions",
  "Busy road",
  "Other",
];

const LONG_STOP_OPTIONS = [
  "Delivery or pickup",
  "Break or rest",
  "Waiting for passenger/order",
  "Traffic jam",
  "Loading/unloading",
  "Parked up",
  "Other",
];

/**
 * Build location questions from detected slow zones.
 * Place names must be filled in async via reverse geocoding.
 */
export function buildLocationQuestions(zones: SlowZone[]): LocationQuestion[] {
  return zones.map((z) => {
    const isStop = z.type === "long_stop";
    return {
      type: z.type,
      question: isStop
        ? `You stopped for ${z.durationMins} minutes. What were you doing?`
        : `You were slow for ${z.durationMins} minutes. What was happening?`,
      options: isStop ? LONG_STOP_OPTIONS : SLOW_ZONE_OPTIONS,
      lat: z.lat,
      lng: z.lng,
      placeName: null,
      durationMins: z.durationMins,
      avgSpeedMph: z.avgSpeedMph,
    };
  });
}

/**
 * Update question text to include a place name.
 */
export function setLocationQuestionPlace(
  q: LocationQuestion,
  placeName: string
): LocationQuestion {
  const isStop = q.type === "long_stop";
  return {
    ...q,
    placeName,
    question: isStop
      ? `You stopped near ${placeName} for ${q.durationMins} minutes. What were you doing?`
      : `You were slow near ${placeName} for ${q.durationMins} minutes. What was happening?`,
  };
}
