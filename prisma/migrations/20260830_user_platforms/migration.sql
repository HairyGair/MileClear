-- Which platform(s) each account uses, and where it signed up from.
--
-- platformsSeen is a sorted, comma-joined set ("android,ios"). Backfilled from
-- the heartbeat's osVersion ("ios 18.5" / "android 14"), which is the only
-- platform signal we had until now, so existing users get their current
-- platform; "both" can only be learned from here on.
ALTER TABLE `users`
  ADD COLUMN `platformsSeen` VARCHAR(32) NULL,
  ADD COLUMN `signupPlatform` VARCHAR(16) NULL,
  ADD COLUMN `signupLocation` VARCHAR(120) NULL;

UPDATE `users`
SET `platformsSeen` = SUBSTRING_INDEX(`osVersion`, ' ', 1)
WHERE `osVersion` IS NOT NULL AND `osVersion` <> ''
  AND SUBSTRING_INDEX(`osVersion`, ' ', 1) IN ('ios', 'android');
