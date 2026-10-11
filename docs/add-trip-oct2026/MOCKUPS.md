# Add a past trip: mockups (11 Oct 2026)

Phone size 390 x 844 pt, dark theme from `apps/mobile/lib/theme.ts`, Plus Jakarta Sans and the app's icon font (Ionicons). Each mockup is an SVG plus a 2x PNG, drawn by `mockups/build_add.py` (shared parts in `mockups/lib.py`, copied from the More and Trips pass) and turned into PNGs by `mockups/render.sh` with headless Chrome. The SVGs name the fonts but don't embed them, so open the PNGs to see them as intended.

Demo values only: "Demo", Toyota Prius, saved places Home (12 Kenton Lane), Depot (Team Valley) and Office, a gig driver on Uber Eats. In the mockups today is Sun 11 Oct 2026 and the driver is back-filling Sat 3 Oct. No real driver.

House rules carried over: sentence case, one card per group, grey icons, one amber thing to press per view, Business = soft amber with a briefcase, Personal = slate with a person, numbers in white bold, places written "Home to Depot". The overlap line is amber-tinted (a "check this"), not red: nothing is broken.

Today's screens: `before/` (see `AUDIT.md`).

## Direction A: "From, To, When" (recommended)

| File | State | What to look at |
|---|---|---|
| `mockups/a-empty` | Just opened | From and To start empty with Home, Depot, Office and a search button as chips. When has Today, Yesterday, Pick a day, then "Set off at · Choose a time" (no "now"). A line says miles and arrival are worked out. Business and Personal with nothing chosen, "Not sure? Leave it and it goes in To sort." The button says what's missing |
| `mockups/a-filled` | Ready to save | "Home · 12 Kenton Lane" to "Depot · Team Valley" with a swap button. Sat 3 Oct picked, set off 08:35, and a grey line "Also on Sat 3 Oct: 1 trip, 13:20 to 13:45" so the driver sees the day. "12.4 miles by road · Arrives about 09:01 · Change". Business chosen shows "Which app · Uber Eats". "More details · Toyota Prius · no note". One amber button |
| `mockups/a-day-picker` | "Pick a day" | A calendar, Monday first, with a dot under days that already have trips, so the empty days (here Sun 4 Oct) stand out. Future days greyed, today ringed. "Use Sat 3 Oct" |
| `mockups/a-overlap` | Save tapped, a trip overlaps (a separate example: the same morning had a recording the phone saved late) | The When card shows "You already have a trip at 08:40 · Open"; the sheet says "MileClear already has a trip around then", shows the recorded "Home to Tesco Extra · 08:40 to 09:05 · 9.3 mi · Recorded by your phone, saved later", then "Yours: Home to Depot · 08:35 · 12.4 mi". Buttons: "It's the same drive" (amber, closes without saving), "Open that trip to fix it", "Add mine as well" |
| `mockups/a-saved` | Saved | Today's review card with the trip, its chip and where the miles came from, plus **"Add the next trip · From Depot, Sat 3 Oct, after 09:01"** (amber) and **"Add the way back · Depot to Home, same day"**. Done |
| `mockups/a-next` | "Add the next trip" tapped | Title "Add the next trip". From is Depot, the day is still Sat 3 Oct, the time hint says "after 09:01", Business and Uber Eats carried over. To offers Home and a recent place first. "Sat 3 Oct so far: 2 trips, 08:35 and 13:20" |
| `mockups/a-offline` | No signal | A grey line "No signal. The trip saves on your phone." Saved places still work. The miles line becomes a box: "No signal, so we couldn't work out the road distance" |

## Direction B: "Fill in a day" (for comparison, not recommended now)

| File | State | What to look at |
|---|---|---|
| `mockups/b-day` | One day | "Saturday 3 October", what MileClear already has ("Home to Tesco Extra · 08:40 to 09:05 · recorded · 9.3 mi"), the gap ("Nothing from 09:05 to the end of the day"), then the stops in order with a rough "left about" time and the miles per leg, "Add a stop", Business or personal for all, "Add 3 trips" |

## Notes for building

- **Place chips**: saved places in the order Home, Work, Depot, then by name (the order `LocationPickerField` already uses), then up to two recent places from `selectPickerPlaces`, then a search button that opens today's search. Chips scroll sideways if there are more than fit.
- **Day chips**: Today, Yesterday, then the picked day if it's older. "Pick a day" opens the calendar sheet. The calendar's dots come from the phone's trips for the shown month plus, for months older than the phone holds, one server call for trip counts per day.
- **Set off at**: an hour and minute wheel (iOS `mode="time"`; Android the clock dialog), capped at now when the day is today.
- **Worked-out line**: the route call the form already makes (`fetchServerRouteDistance`); the end is `defaultEndFor(start, routedMinutes)`, and with typed miles `endTimeFor` from the reporter. "Change" opens the miles box and an "Arrived at" time.
- **Overlap**: the reporter's `findOverlappingTrip` on the phone's trips for the day, plus a server read for days older than 90. Shown in the When card as soon as day and time are set, and as the sheet at Save if the driver hasn't opened it.
- **Settle first**: on open, run the reporter's `finalizeStaleAutoRecordings` and `processSyncQueue` in the background, without a spinner.
- **Accessibility**: each chip is a button with its full label ("From: Home, saved place"); the selected day chip says "selected"; the overlap line is announced when it appears; the worked-out line reads "12.4 miles by road, arrives about 09:01, double tap to change". The disabled button's label says what's missing. Text sizes follow the app's caps (`fontScaleCap`); at the largest sizes the chips wrap onto two lines rather than shrink.

## Rebuilding the mockups

```
cd docs/add-trip-oct2026/mockups
python3 build_add.py && ./render.sh
```
