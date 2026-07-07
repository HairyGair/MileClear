-- Server-enforced push notification preferences (synced from mobile).
-- Null = all categories enabled (the historical behaviour).
ALTER TABLE `users` ADD COLUMN `pushPrefs` JSON NULL;
