// Measuring the new Home: a `home.tap` event for each thing a driver taps
// (Oct 2026). metadata is {target, mode, state}, where state is the status
// line's kind at the time ("fine", "cant_record", ...), so a tap can be read
// against what Home was saying.
//
// Fire and forget: never awaited, never throws, never blocks the tap. To keep
// the event log sensible, the same target is sent at most once every 2 seconds
// (a double tap counts once) and a session sends at most 60 in total.

export type HomeTapTarget =
  | "hero"
  | "last_trip"
  | "classify_business"
  | "classify_personal"
  | "last_trip_footer"
  | "status_line"
  | "status_action"
  | "start_trip"
  | "start_shift"
  | "mode_pill"
  | "door_road"
  | "door_tax"
  | "door_insights"
  | "door_earnings"
  | "door_badges"
  | "door_fuel"
  | "door_help"
  | "door_hide"
  | "first_trip_add_past"
  // ask_<id> and ask_dismiss_<id>, e.g. ask_pro, ask_dismiss_vehicle
  | `ask_${string}`
  | `ask_dismiss_${string}`;

export const MIN_GAP_MS = 2000;
export const MAX_PER_SESSION = 60;

export interface HomeTapEvent {
  target: HomeTapTarget;
  mode: "work" | "personal";
  state: string;
}

export function createTapTracker(
  send: (type: string, metadata: HomeTapEvent) => void,
  now: () => number = () => Date.now()
) {
  const last = new Map<string, number>();
  let sent = 0;
  return function track(target: HomeTapTarget, mode: "work" | "personal", state: string): boolean {
    const t = now();
    const key = `${target}|${mode}|${state}`;
    const prev = last.get(key);
    if (prev !== undefined && t - prev < MIN_GAP_MS) return false;
    if (sent >= MAX_PER_SESSION) return false;
    last.set(key, t);
    sent++;
    try {
      send("home.tap", { target, mode, state });
    } catch {
      // never block the tap
    }
    return true;
  };
}
