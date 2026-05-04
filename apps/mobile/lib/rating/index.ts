import * as StoreReview from "expo-store-review";
import { Alert } from "react-native";
import { router } from "expo-router";
import { getDatabase } from "../db/index";
import { apiRequest } from "../api/index";

// Cooldown progression after "Not now" dismissals. Escalates so a
// dismisser isn't pestered, and after MAX_NOT_NOW_DISMISSALS we stop
// asking entirely (we've now had three goes — back off and let the
// manual Profile → Rate MileClear button be the path).
const COOLDOWN_MS_DAY = 24 * 60 * 60 * 1000;
const COOLDOWN_PROGRESSION_DAYS = [14, 30]; // 1st Not Now: 14d. 2nd: 30d. 3rd: permanent stop.
const MAX_NOT_NOW_DISMISSALS = 3;
const MIN_TRIPS = 5;

// Prevents the prompt from stacking multiple times in a single app session -
// e.g. if the user triggers it from the dashboard focus AND then classifies
// a trip within a few seconds. Not persisted; resets on app restart.
let promptShownThisSession = false;

/** Fire-and-forget event log to the API for admin visibility. */
function trackRatingEvent(type: string, metadata?: Record<string, unknown>): void {
  apiRequest("/user/event", {
    method: "POST",
    body: JSON.stringify({ type, metadata }),
  }).catch(() => {});
}

/**
 * Attempt to show a review prompt.
 *
 * Flow:
 * 1. Guards: StoreReview available, 3+ trips, 3-day cooldown, not already reviewed,
 *    no prompt this session.
 * 2. Every failed guard now logs a rating.skipped_* event so the admin funnel
 *    can see WHY we're not asking users - previously we'd just bail silently,
 *    leaving us blind to the real reason the prompt rate was low.
 * 3. Shows a custom Alert with "Love it!", "Could be better", "Already rated", "Not now".
 * 4. "Love it!" fires the native SKStoreReviewController dialog.
 * 5. "Could be better" routes to the in-app feedback form.
 * 6. "Already rated" sets a permanent flag - never asks again.
 * 7. "Not now" dismisses - cooldown resets, asks again in 3 days.
 *
 * Every action is logged to the API so the admin can see rating funnel stats.
 * Fire-and-forget - never throws.
 */
export async function maybeRequestReview(trigger: string): Promise<void> {
  try {
    if (promptShownThisSession) {
      trackRatingEvent("rating.skipped_session_dedup", { trigger });
      return;
    }

    const available = await StoreReview.isAvailableAsync();
    if (!available) {
      trackRatingEvent("rating.skipped_unavailable", { trigger });
      return;
    }

    const db = await getDatabase();

    // Permanent opt-out: user said "Already rated"
    const reviewedRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'review_given'"
    );
    if (reviewedRow?.value === "1") {
      trackRatingEvent("rating.skipped_already_rated", { trigger });
      return;
    }

    // Check trip count
    const tripRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM trips"
    );
    const tripCount = tripRow?.count ?? 0;
    if (tripCount < MIN_TRIPS) {
      trackRatingEvent("rating.skipped_min_trips", { trigger, tripCount });
      return;
    }

    // Don't interrupt an active trip-recording session. The prompt
    // would feel like a notification getting in the way, not a polite
    // ask. We can't know from JS whether the user is mid-drive, but
    // we can check whether a recording is active.
    const recordingRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    if (recordingRow?.value === "1") {
      trackRatingEvent("rating.skipped_recording_active", { trigger });
      return;
    }

    // Per-user "Not now" budget. After MAX_NOT_NOW_DISMISSALS the
    // prompt stops asking forever. The Profile → Rate MileClear path
    // remains as a manual escape hatch.
    const notNowRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'rating_not_now_count'"
    );
    const notNowCount = notNowRow ? parseInt(notNowRow.value, 10) : 0;
    if (notNowCount >= MAX_NOT_NOW_DISMISSALS) {
      trackRatingEvent("rating.skipped_max_dismissals", { trigger, notNowCount });
      return;
    }

    // Escalating cooldown after each "Not now". Prevents asking again
    // within the cooldown window for the user's current dismissal tier.
    const lastRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'last_review_prompt_at'"
    );
    if (lastRow) {
      const lastPrompt = parseInt(lastRow.value, 10);
      const elapsedMs = Date.now() - lastPrompt;
      const cooldownDays = COOLDOWN_PROGRESSION_DAYS[Math.min(notNowCount, COOLDOWN_PROGRESSION_DAYS.length - 1)] ?? 30;
      const cooldownMs = cooldownDays * COOLDOWN_MS_DAY;
      if (elapsedMs < cooldownMs) {
        trackRatingEvent("rating.skipped_cooldown", {
          trigger,
          elapsedHours: Math.round(elapsedMs / 3_600_000),
          cooldownDays,
          notNowCount,
        });
        return;
      }
    }

    // All guards passed - log that the prompt is being shown
    promptShownThisSession = true;
    trackRatingEvent("rating.prompt_shown", { trigger, tripCount });

    // Show custom prompt with sentiment routing.
    // Happy users go to the App Store, everyone else goes to feedback.
    Alert.alert(
      "Rate MileClear?",
      "Your feedback helps other drivers find us and helps us improve.",
      [
        {
          text: "Love it!",
          onPress: async () => {
            trackRatingEvent("rating.love_it", { trigger });
            try {
              await StoreReview.requestReview();
              trackRatingEvent("rating.native_dialog_requested", { trigger });
            } catch {}
          },
        },
        {
          text: "Could be better",
          onPress: () => {
            trackRatingEvent("rating.could_be_better", { trigger });
            try {
              router.push("/feedback-form" as any);
            } catch {}
          },
        },
        {
          text: "Already rated",
          onPress: async () => {
            trackRatingEvent("rating.already_rated", { trigger });
            try {
              const d = await getDatabase();
              await d.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('review_given', '1')"
              );
            } catch {}
          },
        },
        {
          text: "Not now",
          style: "cancel",
          onPress: async () => {
            trackRatingEvent("rating.not_now", { trigger });
            try {
              const d = await getDatabase();
              const row = await d.getFirstAsync<{ value: string }>(
                "SELECT value FROM tracking_state WHERE key = 'rating_not_now_count'"
              );
              const next = (row ? parseInt(row.value, 10) : 0) + 1;
              await d.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('rating_not_now_count', ?)",
                [String(next)]
              );
            } catch {}
          },
        },
      ]
    );

    // Update cooldown regardless of which button they tap
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_review_prompt_at', ?)",
      [String(Date.now())]
    );
  } catch (err) {
    // Never throw - rating is non-critical
    console.warn("[Rating] maybeRequestReview failed:", err);
  }
}
