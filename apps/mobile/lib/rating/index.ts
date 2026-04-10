import * as StoreReview from "expo-store-review";
import { Alert } from "react-native";
import { router } from "expo-router";
import { getDatabase } from "../db/index";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_TRIPS = 3;

/**
 * Attempt to show a review prompt.
 *
 * Flow:
 * 1. Guards: StoreReview available, 3+ trips, 7-day cooldown, not already reviewed.
 * 2. Shows a custom Alert with "Rate Now", "Already Did", "Not Now".
 * 3. "Rate Now" fires the native SKStoreReviewController dialog.
 * 4. "Already Did" sets a permanent flag - never asks again.
 * 5. "Not Now" dismisses - cooldown resets, asks again in 7 days.
 *
 * Fire-and-forget - never throws.
 */
export async function maybeRequestReview(trigger: string): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    const db = await getDatabase();

    // Permanent opt-out: user said "Already Did"
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

    // All guards passed - show custom prompt with sentiment routing.
    // Happy users go to the App Store, everyone else goes to feedback.
    Alert.alert(
      "Rate MileClear?",
      "Your feedback helps other drivers find us and helps us improve.",
      [
        {
          text: "Love it!",
          onPress: async () => {
            try {
              await StoreReview.requestReview();
              console.log(`[Rating] Native review dialog shown (trigger: ${trigger})`);
            } catch {}
          },
        },
        {
          text: "Could be better",
          onPress: () => {
            // Route to in-app feedback form instead of App Store
            try {
              router.push("/feedback-form" as any);
            } catch {}
            console.log(`[Rating] Routed to feedback form (trigger: ${trigger})`);
          },
        },
        {
          text: "Already rated",
          onPress: async () => {
            try {
              const d = await getDatabase();
              await d.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('review_given', '1')"
              );
              console.log("[Rating] User confirmed review given - will not ask again");
            } catch {}
          },
        },
        {
          text: "Not now",
          style: "cancel",
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
