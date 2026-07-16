-- Route geometry on the routing cache: Google-encoded polyline (precision 5).
-- Null on legacy rows; self-healed by routing.ts on next lookup.
ALTER TABLE `route_cache` ADD COLUMN `encodedPolyline` TEXT NULL;
