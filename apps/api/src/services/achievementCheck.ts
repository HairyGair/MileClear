// Run the badge check after money arrives (an earning saved, an invoice
// marked paid), so an earnings badge lands when the money does rather than
// at the next trip. Fire-and-forget: never slows or fails the request that
// called it. Badges are only ever added, never taken away.

import { checkAndAwardAchievements } from "./gamification.js";

export function checkAchievementsSoon(userId: string): void {
  checkAndAwardAchievements(userId)
    .then(async (fresh) => {
      if (fresh.length === 0) return;
      // Loaded on demand: the notifications module pulls in every job.
      const { sendAchievementPush } = await import("../jobs/notifications.js");
      await sendAchievementPush(userId, fresh);
    })
    .catch(() => {});
}
