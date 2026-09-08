import { Alert } from "react-native";
import { router } from "expo-router";
import { MAX_FREE_SAVED_LOCATIONS } from "@mileclear/shared";
import { getDatabase } from "../db/index";
import { apiRequest } from "../api/index";
import { fetchSavedLocationSuggestions } from "../api/savedLocations";
import { reviewPromptShownThisSession } from "../rating/index";

// Only 114 of 1,009 users had any saved location (Sep 2026), yet saved
// places are what name a driver's stops and stop drift at a known place
// being logged as a trip. The dashboard card is easy to scroll past, so
// this asks once, by name, after enough trips that the server's clusters
// are credible. Once ever: a second system alert on the same subject is
// nagging, and the card + list-screen CTA remain as the ongoing path.
const MIN_TRIPS = 10;
const MAX_NAMED_PLACES = 2;
const PROMPT_KEY = "saved_places_prompt_at";

// Same session guard as the rating prompt: a focus that fires twice in
// quick succession must not stack two alerts.
let promptShownThisSession = false;

function trackPromptEvent(type: string, metadata?: Record<string, unknown>): void {
  apiRequest("/user/event", {
    method: "POST",
    body: JSON.stringify({ type, metadata }),
  }).catch(() => {});
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Offer to save the user's most-visited unsaved places, by name.
 *
 * Guards, in order: not already shown this session; never shown before
 * on this device; 10+ local trips; no recording in progress; a free slot
 * to put a place in; at least one suggestion the server could name.
 * Every skip is logged so the admin funnel can see why the ask is rare.
 * Fire-and-forget, never throws.
 */
export async function maybeSuggestSavedPlaces(
  trigger: string,
  isPremium: boolean
): Promise<void> {
  try {
    if (promptShownThisSession || reviewPromptShownThisSession()) {
      trackPromptEvent("saved_places_prompt.skipped_session_dedup", { trigger });
      return;
    }

    const db = await getDatabase();

    const shownRow = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM tracking_state WHERE key = '${PROMPT_KEY}'`
    );
    if (shownRow) {
      // Deliberately unlogged: this is the steady state for everyone who has
      // seen it, and logging it on every focus would swamp the event table.
      return;
    }

    const tripRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM trips"
    );
    const tripCount = tripRow?.count ?? 0;
    if (tripCount < MIN_TRIPS) {
      trackPromptEvent("saved_places_prompt.skipped_min_trips", { trigger, tripCount });
      return;
    }

    const recordingRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    if (recordingRow?.value === "1") {
      trackPromptEvent("saved_places_prompt.skipped_recording_active", { trigger });
      return;
    }

    // Free users get the slots they have left; Pro has no cap but two
    // names is as many as an alert can carry without turning into a list.
    const savedRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM saved_locations"
    );
    const savedCount = savedRow?.count ?? 0;
    const remaining = isPremium
      ? MAX_NAMED_PLACES
      : MAX_FREE_SAVED_LOCATIONS - savedCount;
    if (remaining <= 0) {
      trackPromptEvent("saved_places_prompt.skipped_at_limit", { trigger, savedCount });
      return;
    }

    const res = await fetchSavedLocationSuggestions();
    const named = (res.data ?? [])
      .filter((s) => !!s.inferredName)
      .slice(0, Math.min(MAX_NAMED_PLACES, remaining));
    if (named.length === 0) {
      trackPromptEvent("saved_places_prompt.skipped_no_named_suggestions", {
        trigger,
        suggestionCount: res.data?.length ?? 0,
      });
      return;
    }

    // Written before the alert goes up so a crash mid-alert still counts as
    // "asked": the ask must be once ever, not once per lucky session.
    promptShownThisSession = true;
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
      [PROMPT_KEY, String(Date.now())]
    );
    const names = named.map((s) => {
      if (s.suggestedType === "home") return "Home";
      if (s.suggestedType === "work") return "Work";
      return s.inferredName as string;
    });
    trackPromptEvent("saved_places_prompt.shown", {
      trigger,
      tripCount,
      savedCount,
      offered: named.length,
      types: named.map((s) => s.suggestedType),
    });

    Alert.alert(
      `Save ${joinNames(names)}?`,
      `You've been ${named.length === 1 ? "there" : "to these places"} often. Saved places give your stops a name you recognise in the trip list, and help MileClear tell one place from another.`,
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => {
            trackPromptEvent("saved_places_prompt.not_now", { trigger });
          },
        },
        {
          text: named.length === 1 ? "Save it" : "Save them",
          onPress: () => {
            trackPromptEvent("saved_places_prompt.accepted", { trigger });
            try {
              router.push("/saved-locations-suggest" as never);
            } catch {}
          },
        },
      ]
    );
  } catch (err) {
    console.warn("[SavedPlacesPrompt] maybeSuggestSavedPlaces failed:", err);
  }
}
