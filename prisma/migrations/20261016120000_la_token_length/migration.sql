-- Widen the Live Activity push-to-start token (16 October 2026).
--
-- The heartbeat accepts a token of up to 256 characters, but the column held
-- only 255, so a 256-character token made the WHOLE heartbeat fail with a 500
-- every time (26 failures in the week to 16 Oct, one driver plus a simulator).
-- That also dropped the recording-watchdog fields the heartbeat carries.
-- Widening a nullable VARCHAR is an online change on MySQL 8.
ALTER TABLE `users`
  MODIFY COLUMN `liveActivityPushToStartToken` VARCHAR(512) NULL;
