-- Remember where the device said a trip started, when something later moves it.
--
-- POST /trips dedups on (userId, startedAt, startLat, startLng). Three things
-- move a start after that key is formed: the wake-lag extension, the leading
-- edge-phantom trim, and (from today) the driver editing it. Once moved, a
-- retried create carrying the original coordinates stops matching and writes a
-- duplicate of the same drive. Keeping the original lets the dedup match either.
ALTER TABLE `trips`
  ADD COLUMN `originalStartLat` DOUBLE NULL,
  ADD COLUMN `originalStartLng` DOUBLE NULL;
