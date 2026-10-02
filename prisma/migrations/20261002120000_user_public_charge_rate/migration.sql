-- The driver's own public rapid charging price (pence per kWh) for the EV
-- running-cost comparison on the fuel tab and the Monday EV summary push.
--
-- 2 Oct 2026. NULL means "use the default" (DEFAULT_PUBLIC_RAPID_PENCE_PER_KWH,
-- Zapmap's August 2026 rapid/ultra-rapid pay-as-you-go average). There is no
-- free national feed of public charger prices to fill this from, so it is an
-- editable assumption. Nullable column: no backfill.
ALTER TABLE `users` ADD COLUMN `publicChargePencePerKwh` DOUBLE NULL;
