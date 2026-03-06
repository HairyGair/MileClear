/**
 * Trip anomaly detection — pure logic, no side effects.
 * Detects unusual patterns in trip data and returns questions for the user.
 */

export interface TripAnomalyDef {
  type: string;
  question: string;
  options: string[];
}

interface AnomalyInsights {
  routeEfficiency?: number;
  numberOfStops?: number;
  timeStoppedSecs?: number;
  timeMovingSecs?: number;
}

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
