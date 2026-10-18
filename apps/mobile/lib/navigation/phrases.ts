// What Directions say and show, word for word from the voice script in
// docs/navigation-1.4.0/DESIGN.md sections 3.2 and 3.3: miles and yards,
// "bear left", "take the second exit", sentence case, no em dashes.
//
// Built from the step's type, modifier, exit and street, never by lower-casing
// the server's text, so a road name is never mangled.

import type { NavigationStep } from "@mileclear/shared";
import { METRES_PER_MILE, METRES_PER_YARD } from "./geo";
import { spokenStreet } from "./streetSpeech";

const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** "1st", "2nd", "11th": the banner's form. */
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

/** "first", "second": the spoken form. */
export function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n - 1] ?? ordinal(n);
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Spoken distance (DESIGN 3.2, voice table). */
export function spokenDistance(metres: number): string {
  const miles = metres / METRES_PER_MILE;
  if (miles >= 1.75) return `${Math.round(miles)} miles`;
  if (miles >= 1.25) return "one and a half miles";
  if (miles >= 0.85) return "1 mile";
  if (miles >= 0.6) return "three quarters of a mile";
  if (miles >= 0.375) return "half a mile";
  if (miles >= 0.2) return "a quarter of a mile";
  const yards = metres / METRES_PER_YARD;
  return `${Math.max(50, Math.round(yards / 50) * 50)} yards`;
}

/**
 * The banner's distance (DESIGN 3.2, screen table): "12 mi", "3.2 mi",
 * "300 yd", "80 yd", or "Now" under 20 yards or 2 seconds away.
 */
export function displayDistance(metres: number, speedMps?: number | null): string {
  const yards = metres / METRES_PER_YARD;
  const miles = metres / METRES_PER_MILE;
  if (yards < 20 || (speedMps != null && speedMps > 1 && metres / speedMps < 2)) return "Now";
  if (miles >= 10) return `${Math.round(miles)} mi`;
  if (miles >= 0.2) return `${miles.toFixed(1)} mi`;
  if (yards >= 100) return `${Math.round(yards / 50) * 50} yd`;
  return `${Math.round(yards / 10) * 10} yd`;
}

function onto(step: NavigationStep): string {
  const s = spokenStreet(step.streetName);
  return s ? ` onto ${s}` : "";
}

/** The manoeuvre in the "In 300 yards, ..." form, lower case, with street. */
export function manoeuvrePhrase(step: NavigationStep, opts: { arriveName?: string | null } = {}): string {
  const m = step.modifier;
  switch (step.type) {
    case "turn":
      if (m === "slight_left") return `bear left${onto(step)}`;
      if (m === "slight_right") return `bear right${onto(step)}`;
      if (m === "sharp_left") return `take the sharp left${onto(step)}`;
      if (m === "sharp_right") return `take the sharp right${onto(step)}`;
      if (m === "straight") return `go straight on${onto(step)}`;
      if (m === "left") return `turn left${onto(step)}`;
      if (m === "right") return `turn right${onto(step)}`;
      return `turn${onto(step)}`;
    case "keep":
      if (m === "right" || m === "slight_right" || m === "sharp_right") return `keep right${onto(step)}`;
      if (m === "left" || m === "slight_left" || m === "sharp_left") return `keep left${onto(step)}`;
      return `keep straight on${onto(step)}`;
    case "roundabout":
      return step.exit && step.exit > 0
        ? `at the roundabout, take the ${ordinalWord(step.exit)} exit${onto(step)}`
        : `at the roundabout, take the exit${onto(step)}`;
    case "uturn":
      return "turn around when it is safe";
    case "continue":
      return `carry straight on${onto(step)}`;
    case "arrive":
      return opts.arriveName ? `you will arrive at ${opts.arriveName}` : "you will arrive at your destination";
    case "depart":
      return `head along${onto(step).replace(" onto", "")}`;
  }
}

/** "In half a mile, turn right onto Park Lane". */
export function inDistancePhrase(metres: number, step: NavigationStep, opts: { arriveName?: string | null } = {}): string {
  return `In ${spokenDistance(metres)}, ${manoeuvrePhrase(step, opts)}`;
}

/** At the manoeuvre: "Turn left now onto Grange Road", "Now take the second exit onto ...". */
export function nowPhrase(step: NavigationStep, opts: { arriveName?: string | null } = {}): string {
  const m = step.modifier;
  const st = onto(step);
  switch (step.type) {
    case "turn":
      if (m === "slight_left") return `Bear left now${st}`;
      if (m === "slight_right") return `Bear right now${st}`;
      if (m === "sharp_left") return `Take the sharp left now${st}`;
      if (m === "sharp_right") return `Take the sharp right now${st}`;
      if (m === "straight") return "Go straight on now";
      if (m === "left") return `Turn left now${st}`;
      if (m === "right") return `Turn right now${st}`;
      return `Turn now${st}`;
    case "keep":
      if (m === "right" || m === "slight_right" || m === "sharp_right") return `Keep right now${st}`;
      if (m === "left" || m === "slight_left" || m === "sharp_left") return `Keep left now${st}`;
      return `Keep straight on now${st}`;
    case "roundabout":
      return step.exit && step.exit > 0 ? `Now take the ${ordinalWord(step.exit)} exit${st}` : `Now take the exit${st}`;
    case "uturn":
      return "Turn around when it is safe";
    case "continue":
      return `Carry straight on${st}`;
    case "arrive":
      return arrivedPhrase(opts.arriveName ?? null);
    case "depart":
      return capitalise(manoeuvrePhrase(step));
  }
}

/** The short form used after "then": "turn right", "take the first exit", "keep left". */
export function shortPhrase(step: NavigationStep): string {
  const m = step.modifier;
  switch (step.type) {
    case "turn":
      if (m === "slight_left") return "bear left";
      if (m === "slight_right") return "bear right";
      if (m === "sharp_left") return "take the sharp left";
      if (m === "sharp_right") return "take the sharp right";
      if (m === "straight") return "go straight on";
      if (m === "left") return "turn left";
      if (m === "right") return "turn right";
      return "turn";
    case "keep":
      if (m === "right" || m === "slight_right" || m === "sharp_right") return "keep right";
      if (m === "left" || m === "slight_left" || m === "sharp_left") return "keep left";
      return "keep straight on";
    case "roundabout":
      return step.exit && step.exit > 0 ? `take the ${ordinalWord(step.exit)} exit` : "take the exit";
    case "uturn":
      return "turn around";
    case "continue":
      return "carry straight on";
    case "arrive":
      return "you will arrive";
    case "depart":
      return "head off";
  }
}

export function thenPhrase(step: NavigationStep): string {
  return `, then ${shortPhrase(step)}`;
}

/** Spoken on Start (DESIGN 3.3, depart row). */
export function departPhrase(step: NavigationStep | null, nextDistance: number | null): string {
  const s = step ? spokenStreet(step.streetName) : null;
  if (!s) return "Follow the route on the screen";
  const along = s.startsWith("the ") ? s : s;
  if (nextDistance != null && nextDistance > 2 * METRES_PER_MILE) {
    return `Head along ${along}, then follow the road for ${Math.round(nextDistance / METRES_PER_MILE)} miles`;
  }
  return `Head along ${along}`;
}

/** After a manoeuvre, when the next one is over 2 miles away. */
export function followPhrase(streetName: string | null, metres: number): string {
  const s = spokenStreet(streetName);
  const miles = Math.round(metres / METRES_PER_MILE);
  return s ? `Follow ${s} for ${miles} miles` : `Follow the road for ${miles} miles`;
}

export function arrivedPhrase(name: string | null): string {
  return name ? `You have arrived at ${name}` : "You have arrived";
}

export const REROUTE_FAILED_PHRASE = "Can't find a new route yet";

/** The banner's action line (DESIGN 3.3, last column). */
export function bannerAction(step: NavigationStep): string {
  const m = step.modifier;
  switch (step.type) {
    case "turn":
      if (m === "slight_left") return "Bear left";
      if (m === "slight_right") return "Bear right";
      if (m === "sharp_left") return "Sharp left";
      if (m === "sharp_right") return "Sharp right";
      if (m === "straight") return "Straight on";
      if (m === "left") return "Turn left";
      if (m === "right") return "Turn right";
      return "Turn";
    case "keep":
      if (m === "right" || m === "slight_right" || m === "sharp_right") return "Keep right";
      if (m === "left" || m === "slight_left" || m === "sharp_left") return "Keep left";
      return "Straight on";
    case "roundabout":
      return step.exit && step.exit > 0 ? `${ordinal(step.exit)} exit` : "Roundabout";
    case "uturn":
      return "Turn around";
    case "continue":
      return "Straight on";
    case "arrive":
      return "Arrive";
    case "depart":
      return "Head along";
  }
}

/** The street as shown (full, brackets and all), or null. */
export function bannerStreet(step: NavigationStep, arriveName?: string | null): string | null {
  if (step.type === "arrive") return arriveName ?? null;
  return step.streetName?.trim() || null;
}

/** Which glyph to draw (graphics/manoeuvres file name without .svg). */
export type GlyphName =
  | "depart"
  | "continue"
  | "turn-left"
  | "turn-right"
  | "slight-left"
  | "slight-right"
  | "sharp-left"
  | "sharp-right"
  | "keep-left"
  | "keep-right"
  | "uturn"
  | "roundabout"
  | "roundabout-exit-1"
  | "roundabout-exit-2"
  | "roundabout-exit-3"
  | "roundabout-exit-4"
  | "roundabout-exit-5"
  | "roundabout-exit-6"
  | "arrive";

export function glyphFor(step: NavigationStep): GlyphName {
  const m = step.modifier;
  switch (step.type) {
    case "depart":
      return "depart";
    case "continue":
      return "continue";
    case "arrive":
      return "arrive";
    case "uturn":
      return "uturn";
    case "roundabout":
      return step.exit && step.exit >= 1 && step.exit <= 6
        ? (`roundabout-exit-${step.exit}` as GlyphName)
        : "roundabout";
    case "keep":
      return m === "right" || m === "slight_right" || m === "sharp_right" ? "keep-right" : "keep-left";
    case "turn":
      if (m === "left") return "turn-left";
      if (m === "right") return "turn-right";
      if (m === "slight_left") return "slight-left";
      if (m === "slight_right") return "slight-right";
      if (m === "sharp_left") return "sharp-left";
      if (m === "sharp_right") return "sharp-right";
      return "continue";
  }
}

/** The banner's whole meaning for VoiceOver / TalkBack (DESIGN 5). */
export function bannerAccessibilityLabel(
  step: NavigationStep,
  metres: number,
  then: NavigationStep | null,
  arriveName?: string | null
): string {
  const main = step.type === "arrive" ? inDistancePhrase(metres, step, { arriveName }) : inDistancePhrase(metres, step);
  return `${main}.${then ? ` Then ${shortPhrase(then)}.` : ""}`;
}

/** "14:32": 24-hour, as the rest of the app shows times (en-GB). */
export function arrivalClock(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** "18 min", "1 hr 5 min", "Under a minute". */
export function durationWords(seconds: number): string {
  if (seconds < 60) return "Under a minute";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}

/** "11.2 mi", "0.3 mi", "12 mi". */
export function milesShort(metres: number): string {
  const miles = metres / METRES_PER_MILE;
  return miles < 10 ? `${(Math.round(miles * 10) / 10).toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-05-09" -> "9 May 2026" (the map data date in the info sheet). */
export function dataDateWords(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}
