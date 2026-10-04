-- Tax bill planner (4 Oct 2026): the driver's own answers for working out
-- their Self Assessment payment dates. JSON:
--   { "firstSelfEmployedTaxYear": "2026-27" | "earlier" | null,
--     "bills": { "2025-26": <pence>, ... } }
-- Bills are what HMRC's calculation said, keyed by tax year. NULL means
-- nothing entered, and the planner uses MileClear's own estimates.
-- Nullable column: no backfill.
ALTER TABLE `users` ADD COLUMN `taxPlanner` JSON NULL;
