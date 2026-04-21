-- Record which Apple IAP environment (Sandbox vs Production) a webhook was
-- verified against. Helps distinguish TestFlight tester activity from real
-- customer activity when triaging "no_user" events.

ALTER TABLE `apple_iap_webhook_logs`
  ADD COLUMN `environment` VARCHAR(20) NULL;
