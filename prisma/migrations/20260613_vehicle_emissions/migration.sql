-- Vehicle emissions data for Clean Air Zone / ULEZ compliance (13 June 2026).
--
-- No public by-registration compliance API exists (TfL withdrew theirs in
-- 2022), so we compute compliance ourselves from the vehicle's Euro emissions
-- standard + fuel type via shared/assessCleanAirZones — the same method every
-- commercial ULEZ checker uses. These two columns persist the DVLA inputs so
-- compliance can be shown on the vehicle screen without a fresh DVLA call.
--
-- euroStatus is the primary signal; firstRegistration ("YYYY-MM") is the
-- fallback when euroStatus is blank (common for pre-2015 vehicles, the exact
-- non-compliant cohort). Both nullable + additive = online INPLACE change on
-- MySQL 8, safe to deploy without downtime. Existing vehicles are backfilled
-- by the weekly DVLA refresh cron.
ALTER TABLE `vehicles`
  ADD COLUMN `euroStatus` VARCHAR(20) NULL,
  ADD COLUMN `firstRegistration` VARCHAR(7) NULL;
