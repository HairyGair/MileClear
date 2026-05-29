# Trip-capture reliability audit — 29 May 2026

Multi-agent adversarial audit of the capture→record→finalize→sync→server pipeline. 7 dimensions, every finding re-verified against the real code. **22 confirmed real failure modes** (of 31 candidates). No "critical" survived verification; 7 HIGH, 10 MEDIUM, 5 LOW.

## The headline (why a week of trips vanished)
Three confirmed HIGH faults compound into exactly Anthony's experience:
1. **Terminated-while-parked → nothing can wake detection** but the (dead) anchor geofence; the backstop subscription doesn't survive app termination. *(native)*
2. **`upgradeDetectionAccuracy` stop→start can leave the location task dead** for the whole drive → 3-coords / sparse trace. *(native)*
3. **Then the sparse result is dropped as a phantom** by the client crow-flies guard and/or the server phantom detector — and once saved as a phantom, **dedup blocks the corrected re-POST**. *(separate)*

## ⚠️ The strategic trap the audit caught
The native engine fixes the *wake + capture* half (~11 findings). But **the phantom-drop + dedup layer will actively sabotage the native engine if we don't fix it too**:
- The server phantom detector drops genuine sparse-GPS drives — **and a fresh native engine will emit exactly that sparse shape** early on.
- The crow-flies guard drops real sparse drives before they reach the server.
- Dedup returns a previously-saved phantom, permanently blocking a corrected re-POST.

**So the native engine alone is NOT sufficient. We must de-fang the phantom/dedup layer (mostly OTA-able) before/with the native rollout, or it'll throw away the very trips the new engine captures.**

## Confirmed findings

### HIGH (7)
| # | Fix | Failure | Location |
|---|---|---|---|
|1|native|Terminated-while-parked: only the (possibly dead) geofence can wake; backstop dies with the app|detection.ts 2247-2270, 2769-2785|
|2|native|`upgradeDetectionAccuracy` stop→start leaves the task dead/stuck in 200m mode for the whole drive|detection.ts 2594-2651|
|3|native|Backstop gap: between iOS terminating at the anchor and next foreground, a background drive starts with NO subscription armed|detection.ts 2247-2270, 2125-2148|
|4|native|Crow-flies guard drops a REAL sparse drive as phantom before it reaches the server|detection.ts 909-922|
|5|**separate**|Server flags a real drive as phantom on <3 coords, then hides it from every user-facing read|api phantomTrip.ts 42-48; trips/index.ts 315-378|
|6|**separate**|Dedup returns a previously-saved PHANTOM, permanently blocking the corrected re-POST|api trips/index.ts 204-215|
|7|**separate**|Server phantom detector drops genuine sparse-GPS drives — the native engine will emit exactly this shape|api phantomTrip.ts 20-48|

### MEDIUM (10)
- *(native)* Anchor geofence evicted by iOS with no autonomous recovery while terminated — geofencing/index.ts 192-291
- *(separate)* Saved-location gate suppresses a real drive starting within radius+150m of a saved place — detection.ts 1872-1896
- *(separate)* `not_driving` cooldown blocks legitimate auto-start for 20 min across a genuinely new drive — detection.ts 1843-1870
- *(native)* Stale-resume gate finalizes a still-alive background drive as phantom on an old cached fix — detection.ts 1526-1556
- *(native)* Pre-recording 100m accuracy gate drops the slow residential start leg → crow-flies/short traces — detection.ts 1769-1792
- *(native)* Watch-mode promotion prune trusts watch_mode_started_at; stale/missing value deletes the early route — detection.ts 1945-1963
- *(native)* Finalization-mode 5m-drift subscription can mask a real resume as drift, losing the second leg start — detection.ts 1582-1666
- *(native)* Watch-mode timeout deletes all buffered coords of a real slow/stop-go drive — detection.ts 2408-2421
- *(native)* Stale-finalize aliveness check can truncate a live drive via a stale cached fix — detection.ts 605-621
- *(separate)* Phantom-flagged trips never re-evaluated after the fire-and-forget map-match could correct distance — api trips/index.ts 315-393

### LOW (5)
- *(native)* Stale getLastKnownPositionAsync (maxAge 10min) can force the backstop while already driving away — detection.ts 2219-2270
- *(separate)* Multi-stop merge discards the second leg's coords, corrupting the route — detection.ts 1055-1067; sync/actions.ts 150-197
- *(separate)* MIN_AUTO_TRIP_DISTANCE silently discards legitimate short drives — detection.ts 859-873
- *(separate)* Distance defaults to 0 when routing fails and end coords absent → 0-mile saved trip — api trips/index.ts 243-266
- *(separate)* Drive-detection toggle reports ON/healthy while location permission makes capture impossible — settings/tracking.tsx 19-46

## Ordered action plan

**Track A — immediate OTA + server (stop losing KNOWN-real drives; do FIRST, protects everyone now and unblocks the native engine):**
1. Don't phantom-drop a drive with strong real-travel evidence (backstop_missed_exit distance, anchor backfill, large start↔end displacement) — client crow-flies guard (#4) + server phantom detector (#5, #7).
2. Fix dedup so a corrected real trip can replace a previously-saved phantom (#6).
3. Re-evaluate phantom-flagged trips after map-match corrects distance (#10-server).
4. 0-mile routing-failure guard (#low-server).

**Track B — native location engine (react-native-background-geolocation):** resolves the ~11 *native* wake/capture/termination faults (#1,2,3, and the MEDIUM/LOW capture ones). The headline rebuild, feature-flagged, dev-build first.

**Track C — gate/UX tuning (with the native rollout):** saved-location + not_driving suppression, merge data loss, the "healthy but can't capture" toggle honesty.

**Sequencing:** Track A now (OTA/server, low risk, immediately stops trip loss) → Track B (the engine) → retire the old gates in Track C as the engine proves out.
