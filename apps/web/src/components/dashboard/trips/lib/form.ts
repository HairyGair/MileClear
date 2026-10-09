// Validation and payloads for the trip form. Pure, so the rules can be unit tested.
import { localToIso } from "./days";

export interface FormValues {
  fromLabel: string;
  toLabel: string;
  date: string;
  startTime: string;
  endTime: string;
  distance: string;
  classification: "" | "business" | "personal" | "unclassified";
  odometerStart: string;
  odometerEnd: string;
}

export type FormErrors = Partial<Record<"from" | "to" | "date" | "startTime" | "endTime" | "distance" | "classification", string>>;

export const MAX_DISTANCE_MILES = 2000;

export function validateTrip(v: FormValues, opts: { requireClassification: boolean; now?: Date }): FormErrors {
  const e: FormErrors = {};
  const now = opts.now ?? new Date();
  if (!v.fromLabel.trim()) e.from = "Add where the trip started.";
  if (!v.toLabel.trim()) e.to = "Add where the trip ended.";
  if (!v.date) e.date = "Choose the day of the trip.";
  if (!v.startTime) e.startTime = "Add the start time.";
  if (!v.endTime) e.endTime = "Add the end time.";
  if (v.date && v.startTime && v.endTime) {
    const s = new Date(localToIso(v.date, v.startTime)).getTime();
    const en = new Date(localToIso(v.date, v.endTime)).getTime();
    if (en < s) e.endTime = "End time can't be before the start time.";
    else if (s > now.getTime()) e.startTime = "Start time can't be in the future.";
  }
  const miles = parseFloat(v.distance);
  if (!v.distance.trim() || !Number.isFinite(miles) || miles <= 0) e.distance = "Add the distance in miles.";
  else if (miles > MAX_DISTANCE_MILES) e.distance = "That's over the 2,000 mile limit.";
  if (opts.requireClassification && (v.classification === "" || v.classification === "unclassified")) {
    e.classification = "Choose Business or Personal.";
  }
  return e;
}

/** Warning (never blocks saving) when the odometer difference is more than 20% off the distance. */
export function odometerWarning(startText: string, endText: string, distanceText: string): string | null {
  const a = parseFloat(startText);
  const b = parseFloat(endText);
  const d = parseFloat(distanceText);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(d) || d <= 0) return null;
  const diff = b - a;
  if (Math.abs(diff - d) / d <= 0.2) return null;
  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-GB");
  return `Your odometer difference is ${fmt(diff)} mi but the trip measures ${fmt(d)} mi. Check the readings.`;
}
