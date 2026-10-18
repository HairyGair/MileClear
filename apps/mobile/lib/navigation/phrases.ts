// What the navigator says and shows, in plain UK English: miles and yards,
// "bear left", "take the 2nd exit", sentence case, no em dashes.
//
// Built from the step's type, modifier, exit and street rather than by
// lower-casing the server's text, so "In half a mile, turn right onto Park
// Lane" never comes out as "in half a mile, Turn right" or mangles a road
// name that starts the sentence.

import type { NavigationStep } from "@mileclear/shared";
import { METRES_PER_MILE, METRES_PER_YARD } from "./geo";

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * A distance as a sat nav says it: "80 yards", "300 yards", "a quarter of a
 * mile", "half a mile", "three quarters of a mile", "1 mile", "1 and a half
 * miles", "4 miles".
 */
export function spokenDistance(metres: number): string {
  const yards = metres / METRES_PER_YARD;
  const miles = metres / METRES_PER_MILE;
  if (yards < 500) {
    const step = yards >= 100 ? 50 : 10;
    const y = Math.max(10, Math.round(yards / step) * step);
    return `${y} yards`;
  }
  if (miles < 0.4) return "a quarter of a mile";
  if (miles < 0.6) return "half a mile";
  if (miles < 0.85) return "three quarters of a mile";
  if (miles < 1.25) return "1 mile";
  const halves = Math.round(miles * 2) / 2;
  const whole = Math.floor(halves);
  if (halves !== whole) return `${whole} and a half miles`;
  return `${whole} miles`;
}

/** The banner's distance: "300 yd" under a quarter of a mile, "0.4 mi",
 *  "12 mi" from ten miles. */
export function displayDistance(metres: number): string {
  const yards = metres / METRES_PER_YARD;
  const miles = metres / METRES_PER_MILE;
  if (miles < 0.25) {
    const step = yards >= 100 ? 50 : 10;
    return `${Math.max(0, Math.round(yards / step) * step)} yd`;
  }
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** "turn right", "bear left", "keep left", "make a U-turn", "at the
 *  roundabout, take the 2nd exit", lower case, without the street. */
export function manoeuvreVerb(step: NavigationStep): string {
  const m = step.modifier;
  switch (step.type) {
    case "turn":
      if (m === "slight_left") return "bear left";
      if (m === "slight_right") return "bear right";
      if (m === "sharp_left") return "turn sharp left";
      if (m === "sharp_right") return "turn sharp right";
      if (m === "straight") return "go straight on";
      if (m === "left") return "turn left";
      if (m === "right") return "turn right";
      return "turn";
    case "keep":
      if (m === "left" || m === "slight_left" || m === "sharp_left") return "keep left";
      if (m === "right" || m === "slight_right" || m === "sharp_right") return "keep right";
      return "keep straight on";
    case "roundabout":
      return step.exit && step.exit > 0
        ? `at the roundabout, take the ${ordinal(step.exit)} exit`
        : "at the roundabout, go round";
    case "uturn":
      return "make a U-turn";
    case "continue":
      return "continue";
    case "arrive":
      return "you will arrive at your destination";
    case "depart":
      return "head off";
  }
}

function onto(step: NavigationStep): string {
  const name = step.streetName?.trim();
  if (!name) return "";
  if (step.type === "arrive" || step.type === "uturn") return "";
  return ` onto ${name}`;
}

/** The whole manoeuvre, lower case: "turn right onto Park Lane". */
export function manoeuvrePhrase(step: NavigationStep, opts: { street?: boolean } = {}): string {
  const street = opts.street ?? true;
  return manoeuvreVerb(step) + (street ? onto(step) : "");
}

/** "In half a mile, turn right onto Park Lane". */
export function inDistancePhrase(metres: number, step: NavigationStep): string {
  return `In ${spokenDistance(metres)}, ${manoeuvrePhrase(step)}`;
}

/**
 * At the manoeuvre: "Turn right now", "At the roundabout, take the 2nd exit",
 * "Make a U-turn now". The street is said only when nothing earlier for this
 * step said it.
 */
export function nowPhrase(step: NavigationStep, opts: { saidBefore: boolean }): string {
  const verb = manoeuvreVerb(step);
  const street = opts.saidBefore ? "" : onto(step);
  if (step.type === "roundabout") return capitalise(verb + street);
  return capitalise(`${verb} now${street}`);
}

/** "Continue for 3 miles" after a turn onto a long road. */
export function followPhrase(metres: number): string {
  return `Continue for ${spokenDistance(metres)}`;
}

/** ", then turn left": a second manoeuvre straight after the first. */
export function thenPhrase(step: NavigationStep): string {
  if (step.type === "arrive") return ", then you will arrive at your destination";
  return `, then ${manoeuvrePhrase(step, { street: false })}`;
}

export const ARRIVED_PHRASE = "You have arrived";
export const REROUTING_PHRASE = "Rerouting";

/** The banner's main line: "Turn right", "Take the 2nd exit", "Make a U-turn". */
export function bannerTitle(step: NavigationStep): string {
  if (step.type === "roundabout") {
    return step.exit && step.exit > 0 ? `Take the ${ordinal(step.exit)} exit` : "Go round the roundabout";
  }
  if (step.type === "arrive") return "Arrive at your destination";
  if (step.type === "continue") return "Continue";
  return capitalise(manoeuvreVerb(step));
}

/** The banner's second line: the street, or for a roundabout its context. */
export function bannerSubtitle(step: NavigationStep): string | null {
  const name = step.streetName?.trim() || null;
  if (step.type === "roundabout") return name ? `At the roundabout, onto ${name}` : "At the roundabout";
  if (step.type === "arrive") return null;
  return name;
}

/**
 * The arrow for a step, as a MaterialCommunityIcons name. UK roundabouts go
 * clockwise and a U-turn swings right, so both use the right-hand glyphs.
 */
export function arrowIcon(step: NavigationStep): string {
  const m = step.modifier;
  switch (step.type) {
    case "roundabout":
      return "rotate-right";
    case "uturn":
      return "arrow-u-right-top";
    case "arrive":
      return "flag-checkered";
    case "turn":
    case "keep":
      if (m === "left") return step.type === "keep" ? "arrow-top-left" : "arrow-left-top";
      if (m === "right") return step.type === "keep" ? "arrow-top-right" : "arrow-right-top";
      if (m === "slight_left") return "arrow-top-left";
      if (m === "slight_right") return "arrow-top-right";
      if (m === "sharp_left") return "arrow-left-bottom";
      if (m === "sharp_right") return "arrow-right-bottom";
      return "arrow-up";
    default:
      return "arrow-up";
  }
}

/** "20:42": 24-hour, as the rest of the app shows times (en-GB). */
export function arrivalClock(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** "1 hr 5 min", "12 min", "Under a minute". */
export function durationWords(seconds: number): string {
  if (seconds < 60) return "Under a minute";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}

/** "12.4 miles", "0.3 miles", "1 mile". */
export function milesWords(metres: number): string {
  const miles = metres / METRES_PER_MILE;
  const v = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  return `${v} ${v === 1 ? "mile" : "miles"}`;
}
