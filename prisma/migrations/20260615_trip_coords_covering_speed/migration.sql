-- Covering index for the /community-insights speed-by-hour query (15 June 2026).
--
-- That query joins trip_coordinates -> trips over a ~20-mile geo box and
-- computes AVG(speed) grouped by hour. The trips side is already optimal (geo
-- index added 3 June). The cost is the coordinate side: the existing
-- (tripId, recordedAt) index LOCATED the rows but `speed` was not in it, so
-- MySQL did a separate row fetch per matching coordinate to read speed —
-- ~50k row lookups for a busy city box. Warm that is ~313ms; cold or under
-- concurrent load it is the 5s+ (historically up to 85s) seen in slow_request
-- logs and the original DB-pool-exhaustion stall.
--
-- Adding `speed` to the index makes the read index-only (no row fetches). The
-- 3-column index is a strict superset of (tripId, recordedAt) — it serves every
-- query the old one did (incl. route-replay ORDER BY recordedAt per trip) — so
-- the old index is dropped as redundant. trip_coordinates is the highest-insert
-- table (~847k rows), so we avoid carrying two overlapping indexes.
--
-- Create-then-drop so there is never a window without a (tripId, recordedAt)
-- index. Both are online operations in MySQL 8; LOCK=NONE is asserted so the
-- statement fails loudly rather than silently blocking reads/writes if the
-- engine ever cannot do it lock-free.
ALTER TABLE `trip_coordinates`
  ADD INDEX `trip_coordinates_tripId_recordedAt_speed_idx` (`tripId`, `recordedAt`, `speed`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `trip_coordinates`
  DROP INDEX `trip_coordinates_tripId_recordedAt_idx`,
  ALGORITHM=INPLACE, LOCK=NONE;
