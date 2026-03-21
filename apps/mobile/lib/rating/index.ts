import * as StoreReview from "expo-store-review";
import { getDatabase } from "../db/index";

const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_LIFETIME_PROMPTS = 3;
const MIN_TRIPS = 3;

/**
 * Attempt to show the native App Store rating dialog.
 * Rate-limited: 90-day cooldown, max 3 lifetime prompts, requires >= 3 trips.
 * Fire-and-forget — never throws.
 */
export async function maybeRequestReview(trigger: string): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    const db = await getDatabase();

    // Check trip count
    const tripRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM trips"
    );
    if (!tripRow || tripRow.count < MIN_TRIPS) return;

    // Check lifetime prompt count
    const countRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'review_prompt_count'"
    );
    const promptCount = countRow ? parseInt(countRow.value, 10) : 0;
    if (promptCount >= MAX_LIFETIME_PROMPTS) return;

    // Check cooldown
    const lastRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'last_review_prompt_at'"
    );
    if (lastRow) {
      const lastPrompt = parseInt(lastRow.value, 10);
      if (Date.now() - lastPrompt < COOLDOWN_MS) return;
    }

    // All guards passed — request review
    await StoreReview.requestReview();

    // Update tracking state
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_review_prompt_at', ?)",
      [String(Date.now())]
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('review_prompt_count', ?)",
      [String(promptCount + 1)]
    );

    console.log(`[Rating] Review prompt shown (trigger: ${trigger}, count: ${promptCount + 1})`);
  } catch (err) {
    // Never throw — rating is non-critical
    console.warn("[Rating] maybeRequestReview failed:", err);
  }
}
