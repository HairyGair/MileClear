import * as StoreReview from "expo-store-review";
import { Alert } from "react-native";
import { router } from "expo-router";
import { getDatabase } from "../db/index";
import { apiRequest } from "../api/index";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_TRIPS = 3;

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
 * 1. Guards: StoreReview available, 3+ trips, 7-day cooldown, not already reviewed.
 * 2. Shows a custom Alert with "Love it!", "Could be better", "Already rated", "Not now".
 * 3. "Love it!" fires the native SKStoreReviewController dialog.
 * 4. "Could be better" routes to the in-app feedback form.
 * 5. "Already rated" sets a permanent flag - never asks again.
 * 6. "Not now" dismisses - cooldown resets, asks again in 7 days.
 *
 * Every action is logged to the API so the admin can see rating funnel stats.
 * Fire-and-forget - never throws.
 */
export async function maybeRequestReview(trigger: string): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    const db = await getDatabase();

    // Permanent opt-out: user said "Already rated"
    const reviewedRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'review_given'"
    );
    if (reviewedRow?.value === "1") return;

    // Check trip count
    const tripRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM trips"
    );
    if (!tripRow || tripRow.count < MIN_TRIPS) return;

    // Check cooldown (7 days)
    const lastRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'last_review_prompt_at'"
    );
    if (lastRow) {
      const lastPrompt = parseInt(lastRow.value, 10);
      if (Date.now() - lastPrompt < COOLDOWN_MS) return;
    }

    // All guards passed - log that the prompt is being shown
    trackRatingEvent("rating.prompt_shown", { trigger });

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
          onPress: () => {
            trackRatingEvent("rating.not_now", { trigger });
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
