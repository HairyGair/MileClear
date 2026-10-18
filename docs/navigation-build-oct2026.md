# In-app navigation: our own build (started 18 Oct 2026)

Anthony, 18 Oct 2026: "Yes, lets build our own!" Decision after `navigation-research-oct2026.md` (sections 13 to 15): no third-party navigation SDK. Our own self-hosted GraphHopper (Great Britain, OpenStreetMap) does the routing, the app does the guidance in TypeScript on top of react-native-maps and the GPS fixes our recorder already collects.

Why our own: nothing per trip (GraphHopper is ours), one GPS source by design (trip capture is priority 1), guidance logic ships over the air after one App Store build, full control of UK wording and roadworks.

## Rules that do not bend
- **Trip capture first.** Navigation must never change how trips are recorded. It reads the recorder's fixes; it never starts, stops, reconfigures or adds a listener to the location engine. `startNativeLocationEngine()` calls `removeAllListeners()`, so a second `onLocation` listener would be silently dropped: navigation gets fixes through a small in-app event fed from inside `handleNativeLocation` (the same place as the Scrandalous hook in `lib/tracking/nativeLocation.ts`).
- **Hidden until proven.** Only drivers the server says are enabled see it (admins and a tester list), until locked-phone drives on iPhone and Android show recording is unaffected.
- **No live traffic** in v1 (OpenStreetMap). Say so plainly; never imply traffic-aware ETAs.
- Plain UK English, miles and yards, no em dashes.

## Parts
1. **Routing server (GraphHopper on Pixelish).** Keep profile `car` exactly as today (CH, no turn costs) so manual-trip distances do not move. Add profile `car_nav`: turn restrictions on (`turn_costs: true`), CH edge-based. Refresh the GB OpenStreetMap extract (currently 9 May 2026). Build the new graph in a separate folder on a second localhost port, check it, then swap; the live instance keeps serving until the swap. Later: an LM profile for per-route closure avoidance, a monthly data refresh, and its own small VPS.
2. **API: `GET /navigation/route`** (contract below), in `apps/api/src/routes/navigation/`, using `GRAPHHOPPER_URL` and profile `GRAPHHOPPER_NAV_PROFILE` (default `car_nav`, falling back to `car` if the server does not know it). `/user/profile` gains `navigationEnabled`.
3. **App: the navigator** (`apps/mobile/lib/navigation/` + `app/navigate.tsx`).

## Contract: GET /navigation/route

Auth required. Enabled only when `NAVIGATION_ENABLED=1` and the user is an admin or listed in `NAVIGATION_USER_IDS` (comma-separated); otherwise 403 `{ error, code: "NAVIGATION_NOT_ENABLED" }`. Rate limit 30 a minute per user.

Query: `from=lat,lng` (required), `to=lat,lng` (required), `heading=0-359` (optional, the car's current heading, used to prefer routes that start in the direction of travel).

200:
```ts
{
  data: {
    routeId: string;              // uuid, for logging
    distanceMeters: number;
    durationSeconds: number;      // no live traffic
    geometry: Array<[number, number]>; // [lat, lng] in order
    steps: Array<{
      type: "depart" | "continue" | "turn" | "keep" | "roundabout" | "uturn" | "arrive";
      modifier?: "left" | "right" | "slight_left" | "slight_right" | "sharp_left" | "sharp_right" | "straight";
      exit?: number;              // roundabouts
      streetName: string | null;
      roadRef: string | null;     // road number from OSM ("A1", "A189"); many major roads have no name (added 19 Oct)
      towards: string | null;     // signposted destinations ("Sunderland, Washington"), "Non-motorway traffic" removed (added 19 Oct)
      text: string;               // plain UK English; a road with only a number reads "onto the A1", e.g. "Turn right onto Queen Victoria Road", "At the roundabout, take the 1st exit onto Claremont Road"
      distanceMeters: number;     // length of this step (from its manoeuvre to the next)
      durationSeconds: number;
      startIndex: number;         // index into geometry where this step's manoeuvre happens
      endIndex: number;
    }>;
    speedLimitsMph: Array<{ startIndex: number; endIndex: number; mph: number | null }>;
    dataDate: string;             // OpenStreetMap data date, "YYYY-MM-DD"
    engine: "graphhopper";
    profile: string;              // "car_nav" or "car" (no turn restrictions) for diagnostics
  }
}
```
Errors: 400 `{ code: "BAD_INPUT" }`; 404 `{ code: "NO_ROUTE" }` (GraphHopper found no route, e.g. a point off the road network or outside Great Britain); 503 `{ code: "ROUTING_UNAVAILABLE" }`.

GraphHopper `sign` mapping: -3 sharp_left, -2 left, -1 slight_left, 0 continue, 1 slight_right, 2 right, 3 sharp_right, 4 arrive, 5 via (treat as continue), 6 roundabout (use `exit_number`), -7 keep left, 7 keep right, -8/8/-98 uturn. `max_speed` detail is km/h: convert to mph and round to the nearest 5 (UK limits).

## App navigator (v1)
- **Core logic, pure and unit-tested** (`lib/navigation/`): snap a fix to the route (search forward from the last index), distance along the route, current and next step, distance to the next manoeuvre, announcement schedule, off-route detection (more than about 50 m from the route for 3 fixes in a row, allowing for GPS accuracy; or more than 150 m once), reroute throttling (at most every 10 s), arrival (within about 30 m of the destination, or past the final step).
- **Voice:** UK phrasing in yards and miles ("In half a mile, turn right onto Park Lane", "In 300 yards, at the roundabout, take the 2nd exit", "Turn right now"). Announce at about 1 mile on fast roads, half a mile, about 300 yards and at the turn, scaled by speed. `expo-speech` plus the iOS `audio` background mode and an audio session that ducks music (native: needs one App Store build).
- **Screens:** `app/navigate.tsx` (registered in the root `_layout.tsx`): pick a destination (saved locations, recent places, existing search), route preview (line on the map, miles, time, Start), guidance (map follows the car heading-up, next-turn banner with distance, street name, arrival time, speed limit when known, mute, End). Keep the screen awake while guiding.
- **Fixes:** from the in-app event fed by `handleNativeLocation`. While guiding, the recorder is normally running anyway; navigation must not start or change it. If no fix has arrived for a few seconds, show "Waiting for GPS".
- **Out of scope for v1:** live traffic, lane guidance, CarPlay/Android Auto, avoiding closures (v2: roadworks along the route from `roadCorridor.ts`, then avoidance through an LM profile), changing how trips are recorded.

## Status
- 18 Oct: plan agreed; server and app work started.
- 18 Oct: Anthony: this is **version 1.4.0**, built by a team (planner, UX designer, graphics designer, lead developer, test team) and it must work flawlessly. Team documents in `docs/navigation-1.4.0/` (PLAN.md, DESIGN.md, graphics/). Server endpoint merged 830ba880 (off).
