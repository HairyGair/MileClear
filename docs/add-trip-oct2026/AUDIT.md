# Add a past trip: audit (11 Oct 2026)

Branch `ui-set-oct`. Audit only, nothing in the app was changed.

Anthony's ask: many drivers turn to "Missing a trip?" instead of adding the trip themselves, so the add-trip page needs work.

## What production says (last 30 days, to 11 Oct 2026)

| Fact | Number |
|---|---|
| Trips added by hand | **1,917, by 354 drivers** |
| Of those, added through "Missing a trip?" | 38, by 19 drivers, from 84 reports |
| Added more than 24 hours after the drive (back-filling) | **1,173 (61%)** |
| Added within a day | 744 (39%) |
| Saved with no end time | 129 (7%) |
| Saved with no end place | 81 (4%) |
| Hand-added trips that overlapped a recorded one (server check, 14 days to 15 Sep) | 104 of 661 (16%) |

So the form is not the small path. It is the main way 354 drivers fix their records, and most of what they type is history, not today. The reporter is a smaller path used by drivers who are already annoyed. Both need to be easy, but the form is where the volume is.

## Screenshots

The "MileClear test" simulator was in use by another session during this audit (it reloaded the app and was part way through a "Save this place" test). I didn't drive it, so the screenshots in `before/` come from earlier passes on the same layout:

| File | What | Note |
|---|---|---|
| `00-trips-list-11oct` | Trips list, with the "+" in the header | 11 Oct |
| `01-form-fields-top-7oct` | The form's fields, top half | Taken in "Edit trip" on 7 Oct. The past-trip form uses the same fields and order. Labels have changed a little since ("Start" and "End" now, not "Start Location") |
| `02-form-fields-bottom-7oct` | Business / Personal, Category, Details open, Save | Same note. "Classify Later" is now "Sort later" |
| `03-reporter-11oct` | "Missing a trip?" sheet, empty | 11 Oct |

Code read: `app/trip-form.tsx` (manual mode, save guards, review card), `lib/trips/manualTimeRule.ts`, `components/MissingTripReporter.tsx`, `lib/trips/missingReportRule.ts`, `components/LocationPickerField.tsx`, `lib/location/recentPlaces.ts`, `components/DateTimePickerField.tsx`, `app/(tabs)/trips.tsx` ("+" sheet), the server's possible-duplicate check in `apps/api/src/routes/trips/index.ts`, `lib/sync/hydrate.ts`, and the web `apps/web/src/components/dashboard/trips/TripForm.tsx`.

---

## 1. The form today, step by step

### 1.1 Ways in

| From | What the driver taps | Lands on |
|---|---|---|
| Trips "+" | Sheet "Add a trip": "Start a trip now" or "Add a past trip · A drive you've already made" | Form, past-trip mode |
| Trips list footer | "Add a past trip" | Same |
| Home last-trip card | "Add a past trip" | Same |
| Mileage relief screen | "Add a past trip" | Same |
| Start Trip screen | "Log a past trip instead" (under the big Start button) | Same form, switches mode in place |
| A trip's From or To | "Start from here" / "Go to here" | Same, with one place filled |
| "We may have missed a drive" offer | "Add trip" | Same, both places and times filled |
| Tutorial | "Forgot? Add it by hand. Trips > Add a past trip." | (text only) |

Two names for one thing: "Add a past trip" everywhere, "Log a past trip instead" on Start Trip.

### 1.2 What the screen shows, top to bottom

Title "Add a past trip".

1. **"Track a trip live instead"** (amber link). The first thing on the page is a way to leave it.
2. **Start**: a card with the place, then three buttons: Current, Map, Search. **Filled with where the phone is now** when the form opens.
3. **Distance**: a big amber card, "--" with "Set both locations to auto-calculate", and "Enter distance manually". It sits **between Start and End**.
4. **"+ Add odometer readings (optional)"** (amber link), also between Start and End.
5. **End**: same card and three buttons, empty.
6. **Start time**: "Now" shortcut on the right, field shows **today's date and the time the form opened** ("11 Oct 2026 at 10:50").
7. **End time**: "Now" shortcut, "Tap to set". Once both places are set and the route is back, it fills itself with start + the route's drive time, until the driver sets it.
8. **Business or personal?**: three chips, Business, Personal, **Sort later (selected)**.
9. Category chips, only when Personal is picked (Commute, School run, ...).
10. **Details** (closed): Platform chips (gig drivers), Purpose chips (employee drivers), Vehicle, Notes, Project / client.
11. **Add trip** (amber).

That is five amber things on one screen before anything is filled in (the leave link, Current, the distance card, the odometer link, the Now shortcuts), against the house rule of one amber thing to press per view.

### 1.3 What happens on "Add trip"

The guards run in this order, each as an iOS alert:

1. No start place: "Missing location".
2. No end place and no miles: "Where did it end? Add where the trip ended, or type the miles, then save." (new today, blocks)
3. **Time never touched: "Did it start at 10:50 today? That is just the time you opened the form..."** with "Change time" / "Save anyway".
4. No miles: "This trip has no distance. It'll be saved with 0 miles." / "Save anyway".
5. No vehicle (and the driver has one): "No vehicle selected" / "Save without".
6. Odometer disagrees with the route by more than 20%: "Check" / "Save anyway".
7. Start after end: "Check the times".

Then the trip is written to the phone and queued to upload, and a review card shows the miles, "Business / Personal / Sort later", where the miles came from, and "Done". Done goes back. There is no "add another".

**Nothing checks whether MileClear already has a trip at that time.** The reporter does (section 2), the form doesn't. The server marks a possible double afterwards, but only when **both ends are within half a mile** of the other trip, so the Saturday case below is never caught.

### 1.4 One back-filled day, as a driver lives it

A driver who joined on 30 Aug types in Saturday 1 Aug: home to the depot, three drops, back home. Four trips.

| Step | Taps (about) | What goes wrong |
|---|---|---|
| Open Trips, "+", "Add a past trip" | 3 | |
| Start is already "where I am now" (their sofa, 11 Oct). Clear it or tap Search, pick "Home" from saved places | 2 to 3 | The default is wrong for every back-filled trip (61% of them) |
| End: Search, type "depot", pick | 3 + typing | Has to scroll past the distance card and odometer link to reach End |
| Start time: tap, a **spinner with date and time in one wheel** opens on today. Spin the date wheel back 71 days, then hour, then minute, Done | 6 to 70 flicks | The date wheel is one row per day, so August is a long spin. On Android it's a calendar then a clock, which is better |
| End time: filled from the route, if the route came back first. If the driver set the time before picking End, the end picker **opens on today** and they spin back 71 days again | 0 or the same again | |
| Business | 1 | "Sort later" was already selected, so a hurried driver leaves it |
| Platform: open Details, scroll chips | 2 to 3 | Hidden behind "Details" |
| Add trip, review card, Done | 2 | Lands back on Trips. Trip 2 starts from zero: Start is "where I am now" again, the time is "now" again, the date wheel is back on 11 Oct |
| Repeat 3 more times | | Four trips is roughly 60 taps and four trips through the date wheel, all on the same day |

The driver gives up, or reaches for "Missing a trip?" because it looks shorter (it is: section 2).

---

## 2. The reporter today, step by step

"Missing a trip? Tell us" sits under To sort and at the foot of the list.

1. Sheet: **"Missing a trip?"** "Tell us where you went and when. We'll check what happened, and you can add the trip straight away."
2. If recording was paused at the time, a line says so with "Resume recording".
3. **From** (empty), **To** (empty), each with Current, Map, Search.
4. **"When did you set off? (roughly)"**: **empty**, "Tap to set". No "Now".
5. "Anything else? (optional)".
6. **Send** (disabled until From, To and a time are set).
7. On Send it checks whether a drive is recording right now, then **finishes any drive still saving and uploads the queue (up to 8 s)**, and if a trip lands it asks "A trip just finished saving... Is that the one you were missing?"
8. "Thanks, we've got it... Want to add the trip now?" with the route summary and **Add this trip**.
9. Works out the road miles. If it can't: "How many miles?" with a box.
10. **Checks for a trip already at that time** ("You already have a trip at that time. Home to Depot, from 08:40 on Sat 3 Oct. Add this one as well?").
11. "Trip added · 9.3 miles · ...ready for you to mark as business or personal."

### 2.1 Why the reporter feels easier

| | Form | Reporter |
|---|---|---|
| Questions on screen | 11 blocks, 5 amber marks | 4 fields, 1 button |
| Order | Start, Distance, Odometer, End, Start time, End time, classification | From, To, When |
| Words | "Start", "End", "Start time", "End time", "Distance" | "From", "To", "When did you set off? (roughly)" |
| Time | Prefilled with now (wrong for 61% of trips), plus a separate end time | Empty, one time, "roughly" is allowed |
| Miles | A big "--" card that asks to be filled | Worked out after; asked for only when it fails |
| Business or personal | Asked now, with "Sort later" preselected | Not asked. Goes to To sort |
| Already have that trip? | Never checked | Checks, and lets late trips land first |
| A person will look at it | No | Yes, which is reassuring when the app has already let you down |

The reporter asks only what the driver remembers (where and roughly when) and does the rest. That is the shape the form should have. The one thing the form must keep that the reporter doesn't need is the extra detail for work trips (business or personal, app, purpose), and that can come after.

### 2.2 Where the reporter itself is weaker

- One trip per report. A driver missing a whole day files the same sheet four times.
- "Roughly" times are saved as the trip's times, with "Times are approximate" in the note.
- Always saves as "Sort later" with the primary car, so the driver has to open each trip again.
- It opens a support thread for something that is often not a fault (a drive before they installed the app, a day they forgot to turn it on).

---

## 3. Problems, ranked by how much they hurt a driver

| # | Problem | Who it hits | Evidence |
|---|---|---|---|
| P1 | **No check for a trip MileClear already has.** A drive the phone recorded late (the phone woke up hours later) gets typed in again. The server only flags it if both ends match within half a mile, so a 9.3-mile recorded trip and four short hand-added legs on the same Saturday sit side by side, double counted | Everyone, worst for back-fillers | 104 of 661 hand trips overlapped a recorded one in 14 days (15 Sep); the Saturday driver; the reporter already has the check |
| P2 | **The form doesn't wait for late trips.** The reporter finishes anything still saving and uploads first; the form doesn't, so the moment a driver notices "it missed my trip" is exactly when the recording may be seconds away | Drivers whose phone saves late | Archie Cooper's trip landed 17 s after his report, Dempsey Chimwara's after 4.5 min (reporter code notes) |
| P3 | **Back-filling is one trip at a time from zero.** Start resets to "here", time resets to "now", date wheel resets to today | 61% of hand trips | 1,173 of 1,917 more than a day late |
| P4 | **The date is buried in a time spinner.** One wheel for date and time on iOS; the end picker opens on today if it hasn't filled itself yet | Same | |
| P5 | **Start defaults to where the phone is now** | Every back-filled trip, and any trip added after getting home | |
| P6 | **Start time defaults to now** and is only questioned at Save. Better than before today, but the driver still has to undo a guess | Everyone | 129 with no end time; "time stuck to when the screen opened" until today |
| P7 | **Wrong order and too much on screen.** Distance and odometer sit between Start and End; five amber marks; the first line is a way out ("Track a trip live instead") | Everyone | |
| P8 | **"Sort later" is preselected.** The quickest path files a trip as unsorted, so the driver sorts it again on Trips. Fine as a choice, not as the default the driver didn't pick | Work drivers | Trips To sort counts (46% unclassified fleet-wide, 15 Sep) |
| P9 | **App and Purpose are hidden under "Details"**, and Platform is shown even before Business is chosen | Gig and employee drivers | |
| P10 | **No round trip.** Home to depot and back is two full forms with the ends swapped by hand | Delivery drivers, carers, commuters | |
| P11 | **Missing ends.** No end place or no end time still gets through when miles are typed | Everyone | 81 no end place, 129 no end time |
| P12 | **Offline is unclear.** Place search and road miles need signal. Offline, search shows nothing, the miles say "Couldn't calculate route" in amber, and the save note doesn't say the trip is waiting to upload | Drivers in poor signal | |
| P13 | **No record of how the form is used.** It logs no events at all, so we can't see how many open it and give up, or how far back they go | Us | No events in `trip-form.tsx` |
| P14 | **Two doors, two different forms.** The form and the reporter ask the same things in different words and behave differently (empty time vs now, overlap check vs none) | Everyone | |
| P15 | **The web form is already closer to the right shape than the app's.** Not this audit's subject, but worth copying: From, To, then Date, Start time, End time in one row, start time empty and required, "by road" miles, classification has no default | Web users | `TripForm.tsx` |

## 4. Smaller things noticed

- "Distance" and "Enter distance manually" in amber, and the hint "Couldn't calculate route - try again or enter distance manually" uses a dash and the word "manually" twice.
- Saved places and recent places only appear once Search is tapped. Most hand trips start or end at Home or a saved place; they could be one tap on the card itself.
- Recent places come from the last 120 trips on the phone; the phone only fetches the last 90 days (up to 100 trips) from the server. Fine for back-filling August, not for last tax year.
- The review card after saving is a nice moment, but it ends the flow. For back-fillers it should be the start of the next trip.
- The vehicle alert ("No vehicle selected... won't count towards that vehicle's mileage") fires for a driver with one car who opened Details and set it to None by mistake; the primary car is already the default, so this is rare. Keep.
- Category chips (Commute, School run) appear only after Personal is tapped and push the page down. Fine, but they belong with "More details".
- iPad: the form is a full-width scroll; no issue found in code, not checked on a device.
