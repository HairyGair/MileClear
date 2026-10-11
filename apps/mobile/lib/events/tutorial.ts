// The first-run tour's measurements (PROPOSALS 0.7), on the existing
// /user/event channel (same as lib/home/trackHomeTap and lib/rating). No new
// table: each one lands in app_events with its metadata.
//
//   tutorial.started          {direction, source, cohort}
//   tutorial.step             {stepId, index, ms}       one per screen left
//   tutorial.skipped          {stepId, index}
//   tutorial.completed        {ms, tier, driveFor, autoTrips}
//   tutorial.drive_for        {answer, vehicle}
//   tutorial.location_result  {before, after, choice}
//   tutorial.first_sort_note_shown / tutorial.split_note_shown
//   whats_new.shown / .dismissed / .tour / .skipped   {version}
//
// Never throws and never waits: a failed post is a lost measurement, not a
// broken screen.

import { apiRequest } from "../api/index";

export type TutorialEvent =
  | "tutorial.started"
  | "tutorial.step"
  | "tutorial.skipped"
  | "tutorial.completed"
  | "tutorial.drive_for"
  | "tutorial.location_result"
  | "tutorial.first_sort_note_shown"
  | "tutorial.split_note_shown"
  | "whats_new.shown"
  | "whats_new.dismissed"
  | "whats_new.tour"
  | "whats_new.skipped";

export function trackTutorial(type: TutorialEvent, metadata?: Record<string, unknown>): void {
  try {
    apiRequest("/user/event", {
      method: "POST",
      body: JSON.stringify({ type, metadata }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}
