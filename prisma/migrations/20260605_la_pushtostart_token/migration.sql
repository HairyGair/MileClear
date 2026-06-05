-- Push-to-start Live Activity token (5 June 2026).
--
-- iOS refuses Activity.request() from the background, so the only way to make
-- the Dynamic Island / Live Activity appear on its own when ClearTrack detects
-- a drive (app not foregrounded) is an APNs `liveactivity` push-to-start. That
-- push targets a per-device "push-to-start" token (iOS 17.2+) which is distinct
-- from the Expo `pushToken`. Store it on the user so the server can send the
-- start push from /trips/signal-start.
--
-- Both columns nullable + additive, so this is an online (INPLACE) change on
-- MySQL 8 and safe to deploy without downtime. laTokenUpdatedAt lets us age out
-- stale tokens later. Column names match the Prisma field names so schema and
-- database stay in sync.
ALTER TABLE `users`
  ADD COLUMN `liveActivityPushToStartToken` VARCHAR(255) NULL,
  ADD COLUMN `laTokenUpdatedAt` DATETIME(3) NULL;
