-- User heartbeat telemetry fields
ALTER TABLE `users`
  ADD COLUMN `lastHeartbeatAt` DATETIME(3) NULL,
  ADD COLUMN `bgLocationPermission` VARCHAR(32) NULL,
  ADD COLUMN `notificationPermission` VARCHAR(32) NULL,
  ADD COLUMN `trackingTaskActive` BOOLEAN NULL,
  ADD COLUMN `appVersion` VARCHAR(32) NULL,
  ADD COLUMN `buildNumber` VARCHAR(32) NULL,
  ADD COLUMN `osVersion` VARCHAR(32) NULL;

-- Trip GPS quality summary (JSON blob) + classification feedback flag
ALTER TABLE `trips`
  ADD COLUMN `gpsQuality` JSON NULL,
  ADD COLUMN `classificationAutoAccepted` BOOLEAN NULL;
