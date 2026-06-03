# Runbook: apply the `trips` geo index (migration `20260603_trips_geo_index`)

**Status:** prepared, **not yet applied to production.** Apply when convenient - there's no urgency (the `/community-insights` cache + single-flight fix already stopped the API stalls; this index is the belt-and-braces follow-up that makes each cold query fast too).

## What it does
Adds one index: `CREATE INDEX trips_startLat_startLng_idx ON trips(startLat, startLng)`.
This lets the `/community-insights` area queries find "trips near here" via the index instead of full-scanning the table.

## Why it's low risk
- `trips` is tiny: **~3,500 rows / 6 MB**. The index builds in milliseconds.
- Adding a secondary index in MySQL 8 is an **online (INPLACE)** operation - it does **not** block reads or writes.
- No application code depends on it; **no app restart and no `db:generate` needed.**
- `trip_coordinates` (the larger table, ~126k rows) already has its `(tripId, recordedAt)` index, so nothing is touched there.

## Apply (run on the server)
```bash
cd ~/mileclear-app && git pull

# 1. Confirm this is the only pending migration
npx pnpm --filter @mileclear/api exec prisma migrate status --schema ../../prisma/schema.prisma

# 2. Apply it
npx pnpm --filter @mileclear/api db:deploy
```
That's it. No `pm2 restart` required.

## Verify
```bash
# Index exists:
#   SHOW INDEX FROM trips;            -> expect a row for trips_startLat_startLng_idx
# Planner uses it (key should be trips_startLat_startLng_idx, not NULL):
#   EXPLAIN SELECT 1 FROM trips
#     WHERE startLat BETWEEN 54.6 AND 55.3 AND startLng BETWEEN -2.0 AND -1.1;
```
A cold `/community-insights` call for a fresh grid cell should drop from ~3s toward well under a second.

## Rollback (instant, safe)
```sql
DROP INDEX `trips_startLat_startLng_idx` ON `trips`;
```
Then remove the `@@index([startLat, startLng])` line from `prisma/schema.prisma` and the migration folder if you want the schema to match, or just leave the index dropped - the app behaves identically either way.
