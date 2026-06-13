-- EV charging support (13 June 2026).
--
-- vehicles.milesPerKwh: EV energy efficiency (electric analogue of MPG) for
-- cost-per-mile on electric vehicles.
-- users.electricityPencePerKwh: home electricity unit rate (p/kWh) for the EV
-- cost calc; null falls back to the UK default. Both nullable + additive =
-- online INPLACE change on MySQL 8, safe without downtime.
ALTER TABLE `vehicles` ADD COLUMN `milesPerKwh` DOUBLE NULL;
ALTER TABLE `users` ADD COLUMN `electricityPencePerKwh` DOUBLE NULL;
