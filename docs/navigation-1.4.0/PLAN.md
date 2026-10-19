# MileClear 1.4.0: in-app navigation, release plan

Planner, 18 Oct 2026 (saved by the lead; the planner ran read-only). Builds on docs/navigation-build-oct2026.md (spec, hard rules, API contract) and docs/navigation-research-oct2026.md sections 13 to 15. Anthony: "we need this to work flawlessly". Trip capture stays priority 1: navigation must never change how a trip is recorded or saved.

State at time of writing: main 830ba880 has GET /navigation/route (off unless NAVIGATION_ENABLED=1, then admins + NAVIGATION_USER_IDS). Branch `in-app-navigation` has lib/navigation/{geo,route,navigator,announcer,offRoute,phrases,fixBus}.ts, expo-speech in package.json, shared types; app/navigate.tsx, the nativeLocation hook and the audio mode were not there yet. 1.3.13 (iOS 95 / Android 8) is live; OTAs go to 7 runtimes.

**Lead's note (18 Oct, after this plan was written):** the Pixelish GraphHopper was already switched to a fresh 17 Oct OSM graph with profiles `car` (config unchanged) and `car_nav` (turn restrictions) before F3 below was raised. Decision pending with Anthony: keep it, or roll `car` back to the 9 May graph (one command, backups in ~/graphhopper/*.bak-20261018) and move navigation to its own VPS.

## 0. Findings that shape the plan

F1. **Navigation does not always get fixes from handleNativeLocation.**
- Early returns: pause active (`resolvePauseOnWake() === "sleep"`), Automatic trips off (`stopIfSwitchedOff`), and an iOS Live Activity "Not Driving" cancel.
- Android shift or Start Trip: `decideEnginePower` puts the engine in "low" (MEDIUM accuracy, 200 m distance filter). The trip's real fixes come from the expo-location task `mileclear-background-location` (lib/tracking/index.ts, TaskManager.defineTask at about line 870). iOS keeps the engine at normal power for a shift.
- At rest the engine is stationary: the first fix after setting off can come 100 to 300 m in, often past the first turn.
- Automatic trips off: the engine is stopped, so there are no fixes at all.

Plan: (a) `offerFix()` at the very top of handleNativeLocation, before any early return (read-only, so safe there); (b) a second `offerFix()` in the expo-location task handler; (c) a navigation-owned **foreground-only bridge** (expo-location `watchPositionAsync`, never BGGeo) that runs only while app/navigate.tsx is focused and no recorder fix has arrived for 4 s, and stops as soon as recorder fixes flow. The bridge never runs in the background and never touches tracking_state. This is decision D1 and must pass the capture-safety review and the A/B drives (section 4). If the review rejects it, the fallback is: guidance needs Automatic trips on, and the screen says "Waiting for GPS" until the recorder wakes.

F2. **Reroutes and U-turns.** The CH speed-up mode ignores `heading`. A reroute from a moving car can begin "Make a U-turn". Plan: server adds an LM profile (`car_nav_lm`, turn costs on) used when `heading` is sent (reroutes, and the first route if the car is moving faster than 5 mph), with `heading_penalty`. CH stays for previews from rest.

F3. **GraphHopper also feeds trip data.** The Pixelish instance serves manual-trip road distances (`routing.ts`, route_cache) and the post-save `/match` map-matching, which can raise `Trip.distanceMiles` (matched more than stored x 1.05). A rebuild, a data refresh or nav load on that box can move trip mileage or slow saves. Plan: **a separate navigation GraphHopper on its own VPS from day one**, with car_nav + car_nav_lm, fresh OSM, refreshed monthly; Pixelish `car` left as it is.

F4. **Audio.** expo-speech alone does not duck music, ignores the iOS audio session category, and has no Android audio focus. We need a small native module (`modules/nav-voice`, iOS + Android):
- iOS: AVAudioSession `.playback`, mode `.voicePrompt`, options `.duckOthers` + `.interruptSpokenAudioAndMixWithOthers`; activate before each prompt; deactivate with `.notifyOthersOnDeactivation` after onDone; observe interruptions.
- Android: AudioFocusRequest `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` with `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE`; release on done; detect calls via focus loss.
- Plus the `audio` UIBackgroundMode. Native, so 1.4.0 is a store build.

F5. **Destination search terms.** The app's autocomplete is Google Places (`/geocode/autocomplete`). Places content may only be used with a Google map, and iOS react-native-maps here is Apple Maps. Public Nominatim forbids autocomplete. Recommended: self-host Photon (OSM geocoder, GB extract) on the nav VPS for the navigate screen's search, alongside saved places, recent places and postcodes.io. Places stays everywhere else. Open question Q2.

F6. **OTA reach.** Main's bundle goes to all 7 runtimes. Navigation code must load expo-speech and nav-voice lazily (guarded `requireNativeModule`, like modules/car-audio/index.ts). The entry shows only when `navigationEnabled && isNavVoiceAvailable()`. Older binaries never show it.

F7. **App Review.** A reviewer outside Great Britain gets NO_ROUTE. Review notes must explain GB-only coverage, include the demo account (in the allowlist) and a 60-second screen recording of a real drive.

## 1. Scope

### Must-have for 1.4.0 (v1)
1. **Destination:** saved places (Home/Work first), recent trip ends, search (Photon or Places, Q2), UK postcodes. No typing while moving faster than 5 mph (search locks to saved/recent chips).
2. **Route preview:** line on the map, miles, free-flow time with "No live traffic" said plainly, arrival time, Start. Map data date in small print.
3. **Voice turn-by-turn in UK English:** yards and miles, roundabout exits as ordinals, "then" chaining, "now" prompts; banner with distance, street, arrival time, speed limit when known; mute.
4. **Rerouting:** off-route detection per spec, "Rerouting" once, new route with heading (F2), at most 1 per 10 s, backoff on failure.
5. **Arrival:** "You have arrived" (or "Your destination is on the left/right" if known); guidance ends by itself; recording carries on as normal.
6. **Works with the phone locked**, iOS and Android, while the recorder delivers fixes; screen kept awake while open.
7. **Resume after the app is killed:** within 30 min, if not arrived, offer "Carry on to <place>?" on next open. Stored on the phone only.
8. **Honest failure states:** no GPS, no route, server down, outside Great Britain, permission gaps. Each has a one-line message and "Open in Apple Maps / Google Maps" (lib/location/directions.ts).
9. **Read-only recording status** on the guidance screen ("Recording this drive" / "Not recording yet"). Nothing on the navigate screen starts, stops or changes recording.
10. **Safety:** first-use note ("Keep your eyes on the road. Follow road signs; directions can be wrong."), large tap targets, no interaction needed while driving.

### Non-goals for 1.4.0
Live traffic and traffic-aware ETAs; lane guidance; CarPlay / Android Auto; avoiding closures; multi-stop routes; alternatives; offline routing; walking/cycling; navigation on the Live Activity; automatic business/personal classification from the destination; any change to trip recording.

### Roadworks warnings: a "should", cut first
Route preview shows "2 roadworks reported on this route" (tap for a list) from a new server call reusing roadCorridor.ts and the Street Manager / National Highways / TfL feeds against the route line (max 50 points). No voice, no avoidance. About 1.5 days, JS + API only, so it can ship later by OTA.

### Riding along in 1.4.0 (already on main, JS only)
First-week payoff line (56dfd25d, help 4152fc2f); notification second chance (8a602060); Android "denied but still askable" fix (3a750abe). These also reach existing runtimes by OTA. What's New mentions them in one line.

## 2. Workstreams, order and hand-offs

Order: server and design start day 1 in parallel with dev core; graphics follows design; dev screens follow DESIGN.md; test harness starts day 2; real drives start once a dev build has nav-voice + fix taps.

### Server
- S1 Nav VPS (Hetzner; CX22 4 GB may be tight for edge-based CH + LM for GB, so measure; likely CX32 8 GB, about GBP 7/mo, Q3). Java 21 + GraphHopper 8.0, closed to everything except the API host (WireGuard or SSH tunnel), no public port.
- S2 Graph: fresh GB OSM, profiles car_nav (CH, turn costs) and car_nav_lm (LM, turn costs). Record build time and RAM.
- S3 API: GRAPHHOPPER_NAV_URL (separate from GRAPHHOPPER_URL); LM + `heading` when heading is sent; timeouts 4 s CH, 6 s LM; fall back to `car` only with `profile: "car"` returned. Rollout + kill switch: NAVIGATION_ROLLOUT = off | list | all, plus NAVIGATION_MIN_BUILD.
- S4 Photon (if Q2 = Photon) on the same VPS, `/navigation/search?q=&lat=&lng=` through the API, rate limited.
- S5 Roadworks-on-route endpoint (the "should").
- S6 Monthly refresh: download, build into graph-YYYYMM on a second port, smoke suite (30 fixed GB routes within 3% of last month; 10 known banned turns near Newcastle/Sunderland avoided; 5 roundabout exit counts incl. a mini-roundabout; Tyne Tunnel route), swap by symlink + restart, keep last month's graph for a 1-command rollback, Discord alert on failure.
- S7 Monitoring: /health/navigation; events navigation.route / route_failed by code; latency p50/p95; reroute share; admin tiles; alert if errors above 5% over 10 min or p95 above 1.5 s.
- **Done:** car_nav/LM live on the VPS; smoke suite green; Pixelish `car` unchanged (100 recorded manual-distance pairs and 30 /match replays identical before and after); p95 under 800 ms CH and under 1.5 s LM at 5 req/s; one refresh and one rollback rehearsed.

### UX designer (DESIGN.md)
Destination sheet, preview, guidance, every failure/permission state, resume prompt, first-use note, settings, entry point (hidden by flag). **Done:** every state in section 3 has a screen and copy, reviewed by the lead and Anthony.

### Graphics designer (graphics/)
Manoeuvre icons (UK clockwise roundabouts, exits 1 to 6+, mini-roundabout, U-turn, arrive, depart), car puck, route line styles, UK speed-limit roundel, 2 store screenshots per size, Play feature graphic. **Done:** crisp at 1x to 3x, light and dark; screenshots at all required sizes.

### Lead developer
- Dev1 fix taps (top of handleNativeLocation, the expo-location task, the bridge D1, a source tag for diagnostics).
- Dev2 nav-voice native module iOS + Android + guarded JS wrapper; `audio` background mode.
- Dev3 navigator hardening: no off-route during a gap or while accuracy is above 50 m; the first 2 fixes after a gap of more than 10 s cannot trigger a reroute; reroute backoff 10/20/40 s.
- Dev4 screens per DESIGN.md, root _layout.tsx registration, keep-awake, resume.
- Dev5 search (Photon or Places).
- Dev6 telemetry: counts only, never places.
- Dev7 version 1.4.0: iOS buildNumber 96 / runtime 1.4.0-build96, Android versionCode 9 / runtime 1.4.0-build9 (check the next free numbers).
- Hard rule enforced by a test: nothing in lib/navigation/ or app/navigate.tsx imports from lib/tracking except via fixBus; forbidden names (startNativeLocationEngine, applyEnginePower, startQuickTripTracking, finalizeAutoTrip, BGGeo, startLocationUpdatesAsync) fail the test.
- **Done:** tsc, eslint, vitest green in the main checkout; capture-safety review with no blockers; all section 3 criteria pass in simulator replays.

### Test team
Owns the replay harness (GPX from route geometry: speed bands, noise, missed turns, tunnels, roundabouts), simulator/emulator runs, the review checklist, and the real-drive matrix. Adversarial reviewers (read-only): R1 "can this lose or change a real drive?"; R2 "can this say the wrong thing at the wrong time?"; R3 "what happens on an old runtime / missing native module?". **Done:** every section 3 criterion has a recorded result; zero open P1/P2.

## 3. Acceptance criteria

Trip capture (blocking):
- AC1 Simulator: the same GPX replayed 3 times with navigation off and 3 times on gives the same trip count, distance within 0.01 mi, start/end within 5 s, coordinate count within 2%.
- AC2 Real drives: two phones of the same OS in the same car, one navigating, one not, over 10 drives on each OS: same trip count, distance within 1%, no new `trip.recording_dropped`, `gap_stop_finalize` or `detection_skipped` patterns, identical engine power transitions.
- AC3 Starting, cancelling, arriving and killing guidance mid-drive never starts, ends or splits a trip; Live Activity unchanged.
- AC4 offerFix under 1 ms per fix with a listener, a no-op without one; a navigator exception never reaches handleNativeLocation (fault-injection test).
- AC5 Bridge (if D1 accepted): stops within 2 s of the screen losing focus and of recorder fixes flowing; never runs in the background.

Voice timing (distance to the manoeuvre when speech starts):
- 20 to 30 mph: "near" at 150 to 250 m; "now" at 25 to 60 m and at least 3 s before.
- 40 to 50 mph: half mile at 0.45 to 0.55 mi; near at 320 to 400 m; now at least 3.5 s before.
- 60 to 70 mph: 1 mile at 0.9 to 1.1 mi; half mile; near 400 to 450 m; now at least 4 s before.
- Spoken distance within 15% (or 30 m) of the real one; no prompt cut off; no two prompts within 2 s; manoeuvres closer than 150 m chained with "then"; nothing said after arrival.

Rerouting:
- "Rerouting" within 8 s of passing a missed junction at 20 mph or more (p95), within 15 s below 20 mph; new first instruction within 12 s at p95.
- No reroute begins with a U-turn unless the road is a dead end; never more than 1 request per 10 s; no reroute at a tunnel exit while on route.

Arrival within 30 m (+ accuracy); a round trip back to the start does not "arrive" at the first fix.

States:
- No signal / tunnel: "Waiting for GPS" after 5 s with no fix; banner holds the last step; resumes without reroute (Tyne Tunnel drive).
- No route: "We couldn't find a road route there" + open in Maps; outside GB: "Navigation covers Great Britain".
- Server down: preview offers Try again + open in Maps; mid-guidance keeps the current route, says once "Can't get a new route right now", backs off.
- Kill switch mid-session: finish the current route, no new routes, entry disappears on the next profile fetch.
- App killed mid-guidance: recording unaffected; resume offer within 30 min.
- Calls / Siri: no prompts during a call; afterwards only the next due prompt. Music ducks during a prompt; spoken podcasts pause and resume.
- iOS silent switch on: prompts still play. Volume zero: banner works, mute icon shows.
- Bluetooth car audio and CarPlay connected but unused: prompts from the car speakers, first word not clipped.
- Android OEM killers (Samsung, Xiaomi, OnePlus): locked guidance continues 30 min; if killed, recording as today and the resume offer appears.
- Permissions: location denied, While using only / no background, precise off, motion denied, notifications off: each has a defined message, nothing crashes; While using works with the screen on and says it needs Always for a locked phone.
- Personal vs Work mode, shift running, Start Trip running, pause running, Automatic trips off: recording and classification exactly as without navigation.
- Old runtimes (95, 93, 90, Android 8, 6): no entry point, no crash on OTA.

Battery: locked phone, 60-minute drive: navigation adds no more than 3 percentage points over recording alone. Screen on: measure and state it in help; no thermal warning in 60 minutes in a car mount.

## 4. Test strategy
- **Unit + property tests (vitest, pure lib/navigation):** snap index never goes backwards by more than accuracy; each tier said at most once per step; no off-route with 20 m noise at 20 m accuracy; throttle respected; duplicates, zero-length steps, loops, U-shaped routes, close manoeuvres, null street names; phrases (yards rounding, 1st to 6th, no em dashes, UK spellings); golden files from 50 real GB server routes; forbidden-imports test.
- **Simulator drives:** iOS `xcrun simctl location <udid> start --speed=<m/s> --interval=1 <lat,lng> ...` from route geometry, with deviations for missed turns; Android emulator GPX/KML routes at 1x and 2x. Each scenario with navigation on and off (AC1). Dev and release builds.
- **Adversarial reviews:** R1 (fixBus placement, expo-location hook, bridge), R2 (announcer/offRoute), R3 (OTA safety); fixer loop until no blockers.
- **Real-drive matrix (dev build, then TestFlight / Play internal):**

| # | Who | Phone | Setup | Route |
|---|---|---|---|---|
| 1 | Anthony | iPhone | locked, music over Bluetooth | Newcastle to Sunderland incl. roundabouts |
| 2 | Anthony | iPhone | CarPlay connected, not used | A1 / A19 at 70 mph |
| 3 | Anthony | iPhone | Tyne Tunnel, deliberate missed turn | local |
| 4 | Anthony | iPhone + second phone | AC2 pair drive x5 | normal work drives |
| 5 | Anthony | iPhone | start mid-drive, cancel, kill app | town |
| 6 | Android tester | Samsung | locked, 30+ min, battery saver on | any |
| 7 | Android tester | Xiaomi / other | locked, missed turn | any |
| 8 | 5 to 10 allowlisted drivers | mixed | normal working week | real |

## 5. Release plan
1. **Builds:** 1.4.0 iOS build 96 (runtime 1.4.0-build96), Android versionCode 9 (runtime 1.4.0-build9). Older runtimes keep getting OTAs from main with navigation hidden (F6). Build from a clean main.
2. **Stages:** Stage 0 admins on the dev build; Stage 1 TestFlight + Play internal to the allowlist for at least 7 days (gates AC1 to AC5 and the matrix); Stage 2 submit, then Apple phased release (7 days) and Play staged rollout (10%, 50%, 100%) with NAVIGATION_ROLLOUT=all for builds 96 / 9 and later. Kill switch NAVIGATION_ROLLOUT=off; JS rollback for the 1.4.0 runtimes only.
3. **App Review:** guideline 2.5.4, the audio background mode is for spoken navigation prompts only; safety note and no typing while moving; no Android mention in metadata; disclose the gradual rollout and that the demo account has it on; notes on GB-only coverage and how to preview a GB route.
4. **Privacy:** routing and search requests send start, destination and current position to MileClear's own servers; the server logs counts only; GraphHopper/Photon access logs off or rotated within 7 days; no third party gets the route. Check the App Store nutrition labels and the Play Data safety form.
5. **What's New (draft):**

    Turn-by-turn navigation, built in.
    • Navigate to a saved place, a recent place or anywhere you search. See the route, then go.
    • Spoken directions in UK English, in miles and yards, with your phone locked. Music dips for each direction.
    • Missed a turn? It finds a new way.
    • Your trips record exactly as before, whether you navigate or not.
    • Routes use OpenStreetMap and don't include live traffic.
    • New drivers see what their first trips could be worth, and get a second chance to switch on notifications.

6. **Store screenshots:** 2 new (preview, guidance) per required size.
7. **Help:** assistantHelp.ts entries (How do I navigate; Does it use traffic; Waiting for GPS; Does navigating change my trips; No route found; Voice not speaking; Great Britain only; Battery) + QUESTION_BANK; packages/shared help; web help; release notes; GairWare changelog; docs/apple-submission-1.4.0-build-96.md.
8. **Comms:** update email on Anthony's go after the phased release reaches 100%.
9. **Rollback:** server off switch; previous graph; JS republish for the 1.4.0 runtimes; worst case 1.4.1 without navigation; older runtimes unaffected throughout.

## 6. Risks (ranked)
1. Trip capture regression. Mitigations: read-only taps behind setTimeout(0), forbidden-imports test, R1, AC1 to AC5, staged rollout, kill switch.
2. No fixes in some states (F1). Three sources + "Waiting for GPS" + clear messages.
3. Wrong directions (OSM gaps, roundabout exit counts, mini-roundabouts). Turn costs, smoke suite, golden files, honest wording.
4. Reroute U-turns / reroute storms (F2). LM with heading, gap rules, throttle + backoff.
5. Voice not heard (audio session, silent switch, missing en-GB voice on some Android phones, Bluetooth clipping). nav-voice module; fall back to any English voice plus a chime; banner always works.
6. App Review rejection. Notes, demo account, video, disclosure.
7. Shared GraphHopper and trip data (F3). Separate VPS.
8. OTA crash on old runtimes (F6). Guarded native loads, R3, a smoke test of the main bundle on runtime 95.
9. Search terms (F5). Photon.
10. Android OEM killing. Matrix, resume offer.
11. Battery / heat with the screen on. Measure, keep-awake only while guiding, dim map at night.
12. Expectations (no traffic). Say it in the preview and help.

## 7. Anthony's decisions (18 Oct 2026)
- **Q1 Pro only.** Directions is a Pro feature. Server: NAVIGATION_ROLLOUT=off | list | pro (e66e70d1). Free drivers don't see it during the test phase.
- **Q2 Photon: yes, unless it doesn't work** (Google Places stays as the fallback).
- **Q3 Stay on Pixelish.** Navigation runs as its own GraphHopper instance (pm2 `graphhopper-nav`, 8991, about 2.3 GB) apart from the trip-distance/map-matching instance (8989); monthly rebuilds at night. Revisit only if James or load says so.
- **Q4 CarPlay: not yet.** Get it working properly first.
- **Q5 Every Pro driver can test it, clearly told it's a test phase:** a "Test" badge on Directions, a one-time note ("Directions is new and still being tested. Follow road signs, and tell us anything that goes wrong."), and a "Report a problem with Directions" link. Our own safety checks (reviews, simulator drives, Anthony's paired drives) still come before Pro drivers get it.

## 7a. Original open questions
- Q1 Free for everyone or Pro-only? (Recommend free in 1.4.0: our cost is a fixed VPS; revisit after a month of usage.)
- Q2 Navigation search: self-host Photon (about 2 extra days) or accept Places? (Recommend Photon.)
- Q3 A small VPS for navigation (about GBP 7 to 10 a month)?
- Q4 CarPlay: file the navigation entitlement request with Apple now (free, weeks of wait) so 1.5 can use it? (Recommend yes; no code in 1.4.0.)
- Q5 Your driving week for drives 1 to 5, and two Android testers with Samsung/Xiaomi.

## 8. Timeline (one developer with Claude, working days)

| Days | Work |
|---|---|
| 1 to 3 | Server S1 to S3; Dev1 fix taps + R1 review; DESIGN.md |
| 3 to 5 | Dev2 nav-voice; replay harness; Photon S4 |
| 4 to 6 | Graphics |
| 5 to 9 | Dev4 screens, Dev3 hardening, Dev5 search, Dev6 telemetry |
| 9 to 10 | Simulator AC runs, R2/R3 reviews, fixes |
| 10 | Dev build to Anthony + testers |
| 10 to 13 | Fixes from the first real drives; roadworks if on time; S6/S7 |
| 13 | 1.4.0 build 96 / 9 to TestFlight + Play internal |
| 13 to 20 | Real-drive matrix + allowlist week; help, privacy, screenshots, submission doc |
| 21 | Submit for App Review |
| 23 to 30 | Phased release to 100% |

About 4.5 weeks to submission and 6 weeks to everyone. Any AC1 to AC5 failure resets the clock from that point.
