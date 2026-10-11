# Add a past trip: proposals (11 Oct 2026)

Follows `AUDIT.md` (problems P1 to P15 are from its section 3). No code changed. Mockups: `MOCKUPS.md` and `mockups/`.

What the form is for, in one line: **a driver tells us where they went and roughly when; MileClear works out the rest, checks it doesn't already have that trip, and makes the next one quicker.**

Demo values everywhere (no real driver): "Demo", Toyota Prius, saved places Home, Depot and Office, a gig driver on Uber Eats who also drives for an employer.

---

## 0. What every direction shares

These fix the worst problems and are worth doing whichever direction is picked.

### 0.1 Ask what the driver remembers, in that order
**From, To, When.** Same words as the reporter (P14). Miles come after, worked out. Business or personal after that. Everything else under "More details". "Track a trip live instead" leaves the top of the page (P7); the Start Trip screen already has "Log a past trip instead", and the "+" sheet offers both.

### 0.2 From starts empty, with one-tap places (P5)
From and To show **saved places and recent places as chips** on the card itself (Home, Depot, Office, plus the two most used recent ends), with Search, Map and "Where I am" behind them. "Where I am" is filled in only when the trip is today and the form was opened within an hour of a trip ending, which is the only time it's likely to be right.

### 0.3 When is a day, then a time (P4, P6)
**Day chips**: Today, Yesterday, the day before (by name, "Thu 9 Oct"), and "Pick a day" (a calendar, not a wheel). Then **"Set off at"** with an hour and minute wheel only. Nothing is selected until the driver picks; there is no "now" to undo. **The end is worked out from the route** ("Arrived about 09:01 · from the road route") and can be changed with one tap. With no route (offline, or typed miles), the end is start + typed miles at 30 mph, same as the reporter's rule, and says so.

### 0.4 Check before saving: "MileClear already has a trip around then" (P1, P2)
Two parts, both before the trip is written:

1. **Let late trips land first.** When the form opens, quietly do what the reporter does: finish any drive still saving and upload the queue (no waiting; it runs while the driver types).
2. **Look for a trip at that time.** As soon as the day and time are set, look on the phone and, for days older than the phone holds (90 days), on the server. Any trip that **overlaps in time**, whatever its ends, shows under When as a quiet line, and if it's still there at Save, as a sheet:

> **MileClear already has a trip around then**
> Home to Tesco Extra · 9.3 mi · 08:40 to 09:05 · recorded by your phone
> [ It's the same drive ] [ Open that trip ] [ Add mine as well ]

"It's the same drive" closes the form without saving and opens the existing trip so the driver can fix it (move the start, change the miles). "Add mine as well" saves and, if it was a recording, keeps the server's possible-double mark so it shows on Trips as today.

A warning, never a block: some drivers really do make two trips in that window (a recording that cut a drive in two).

### 0.5 Business or personal, with nothing preselected (P8, P9)
Two big choices, **Business** and **Personal**, nothing picked. Not choosing is fine: the button says "Add trip" and a quiet line says "Not sure? Leave it and it goes in To sort." Picking Business shows **Which app** (gig) or **Purpose** (employee) straight away as one row each that opens a list, not a wall of chips. Picking Personal shows Category the same way.

### 0.6 Miles are worked out and shown as a fact, not a field (P7, P12)
One line: **"12.4 miles by road"** with "Change" on the right. When the route can't be worked out, the line becomes a miles box: "Type the miles · we couldn't work out the road distance (no signal)". Odometer readings move into More details.

### 0.7 After saving, the next one is quicker (P3, P10)
The review card gains two buttons:
- **Add the way back** (To becomes From, From becomes To, same day, set off after this one arrived).
- **Add the next trip** (From is this trip's To, same day, set off after this one arrived).
"Done" stays.

### 0.8 Offline says what will happen (P12)
Saved places and recent places work without signal (they're on the phone). Search says "No signal. Pick a saved or recent place, or try again." The saved card says "Saved on your phone. It uploads when you're back online." The overlap check uses the phone's trips only, and says nothing when it can't check further back.

### 0.9 Measure it (P13)
The form logs: opened (from where), each guard shown and its answer, saved (days back, miles source routed or typed, time set or not, classification chosen or left, overlap shown and answer), and left without saving. See section 5.

### 0.10 Shared with the reporter
The reporter keeps its job (tell us a trip was missed, so we can find out why) but uses the **same From / To / When card** and the same overlap check. Its last step, "Add this trip", becomes the form's review card, so the trip it adds can be marked Business or Personal there and then (P14, and audit 2.2).

---

## 1. Direction A: "From, To, When" (recommended)

**Point of view:** the reporter's shape is right. Make the form one short card that asks three things, works out the miles and end time, and checks for a trip already there. Back-filling is made quick by chaining ("Add the next trip"), not by a separate mode.

### A.1 The screen

| # | Block | Shows | Notes |
|---|---|---|---|
| 1 | Title "Add a past trip" | | Back button. No "Track live" link |
| 2 | **From** | Chips: Home, Depot, Office, recent; "Search" | Picked place shown as "Home · 12 Kenton Lane" with "Change" |
| 3 | **To** | Same | A small swap button between From and To |
| 4 | **When** | Day chips (Today, Yesterday, Thu 9 Oct, Pick a day), then "Set off at 08:35" | Wheel for hour and minute only |
| 5 | Worked-out line | "12.4 miles by road · arrived about 09:01" with "Change" | Appears once From, To and When are set. Tapping "Change" opens miles and arrival time |
| 6 | Overlap line (only when it applies) | "MileClear already has a trip around then: Home to Tesco Extra, 08:40 to 09:05 · Open" | Amber outline, not red: it's not broken |
| 7 | **Business or personal?** | Business, Personal; nothing selected | Which app / Purpose / Category appear under the choice |
| 8 | More details (closed) | Car (Toyota Prius), Note, Project or client, Odometer | One line shows what's set: "Toyota Prius · no note" |
| 9 | **Add trip** | The one amber button | Disabled until From, To (or typed miles) and When are set; says what's missing ("Add when you set off") |

### A.2 How A fixes the problems

| Problem | Fix |
|---|---|
| P1, P2 duplicates and late trips | 0.4, at the moment the time is set and again at Save |
| P3 one at a time | "Add the next trip" and "Add the way back", with the day and place carried over |
| P4 date in a wheel | Day chips and a calendar |
| P5 start = here | From empty with place chips |
| P6 time = now | Nothing until picked |
| P7 order, amber | From, To, When, then one line of miles, one amber button |
| P8, P9 classification | Nothing preselected; app and purpose shown with the choice |
| P10 round trips | "Add the way back" |
| P11 missing ends | The end time is always worked out; To is required unless miles are typed |
| P12 offline | 0.8 |
| P13 | 0.9 |
| P14 | 0.10 |

### A.3 How each driver sees A

| | Business chosen shows | Notes |
|---|---|---|
| G gig | Which app (Uber Eats, Deliveroo, ...) | Most back-fill a whole day: "Add the next trip" is their main button |
| E employee | Purpose (Client meeting, Site visit, ...) | Often a round trip: "Add the way back" |
| B both | Which app, then Purpose | |
| C company car | Purpose; no app | Car fixed to the company car |
| P just me | Business or personal is hidden; Category shown as "What for? (optional)" | |

### A.4 Risks
- Chips for places only help drivers with saved places. Recent places cover the rest; a driver with no trips yet sees Search only.
- The server check for old days is a new call (trips in a window). It should be cheap (the server already does the same query after saving).
- Changing the reporter's last step touches a flow that works. It can wait for a second release.

### A.5 Build size
**Medium, about 4 to 5 days**, by OTA. Most of it is a new top half of the manual form (place chips, day chips, worked-out line), the overlap check (the reporter's `findOverlappingTrip` plus a server read for older days), the review card buttons, and the events. The save path, routing and guards stay.

---

## 2. Direction B: "Fill in a day"

**Point of view:** most hand trips are history, and history comes a day at a time. Let the driver pick a day, see what MileClear already has for it, and add the missing stops in order, saving several trips at once.

### B.1 The screen
1. **Which day?** Day chips and a calendar.
2. **What MileClear has for Sat 3 Oct**: the day's trips as rows in time order (grey, recorded or added), with gaps between them shown as "Nothing from 09:05 to 13:20".
3. **Add the stops you made**: Home, then "+ next stop" (Depot, Tesco, Home), each with a rough "left at" time. Miles for each leg are worked out.
4. Business or personal once, for all of them (each can be changed after).
5. **Add 3 trips**.

### B.2 Strengths
- Duplicates are visible before anything is typed: the driver sees the recorded 9.3-mile trip and doesn't type it again.
- One date pick and one classification for a whole day.

### B.3 Risks
- New and bigger: a second way to add trips next to the single form, and drivers have to choose.
- Times between stops are guesses; four "roughly" times on one screen may get skipped, putting every leg at the same time.
- The 39% adding a single trip from today don't need it.

### B.4 Build size
**Large, about 8 to 10 days.** New screen, multi-trip save, day timeline with gaps (some of it exists in the missed-journeys scanner).

---

## 3. Direction C: "Same form, safer"

**Point of view:** keep today's layout and fix the things that cause bad records.

- Reorder to Start, End, Start time, End time, Distance, classification (odometer into Details).
- Start time empty, not now. Start place empty.
- Add the overlap check (0.4) and the settle-first step.
- Remove "Sort later" as the preselected chip.
- Remove "Track a trip live instead" from the top.

### C.1 Risks
- Doesn't make the form feel easier, which is Anthony's complaint. The wheel, the three-button place cards and the one-trip-at-a-time loop stay.

### C.2 Build size
**Small, about 1 to 2 days.**

---

## 4. Recommendation

**Direction A**, in two releases:

1. **First (this release if it fits, otherwise the next OTA):** the shared fixes that change records, not just looks: the overlap check and settle-first step (0.4), the time starting empty with day chips (0.3), From starting empty with place chips (0.2), "Sort later" not preselected (0.5), the events (0.9). This is C plus the day chips, and it stops the double counting.
2. **Second:** the full A layout (the worked-out line, Business with app and purpose, More details), "Add the next trip" and "Add the way back", and the reporter's last step using the same card.

**Direction B later, only if the numbers say so:** if after A more than a third of hand trips are still added in runs of three or more for the same day, build "Fill in a day" as a button on the review card ("Add the rest of Sat 3 Oct") rather than as a separate door.

Why not B first: it's twice the build, it solves back-filling but not the single-trip case, and A's "Add the next trip" gives most of its benefit (same day, place carried over) for a fraction of the work.

---

## 5. How we'll know it worked

Baseline is the last 30 days to 11 Oct (from `AUDIT.md`). Measure 30 days after each release.

| Measure | Today | Goal | How |
|---|---|---|---|
| Hand trips later marked as a possible double of a recording | 16% (104 of 661, 14 days to 15 Sep) | under 5% | Server `trip.possible_duplicate` with `newIsManual`; plus the new overlap answers |
| Overlap sheet: "It's the same drive" | (new) | Track; tells us how many doubles we stopped | New event |
| Hand trips with no end time | 129 of 1,917 (7%) | under 1% | Trips table |
| Hand trips with no end place | 81 (4%) | under 2% (typed-miles trips only) | Trips table |
| Hand trips left as "Sort later" | not measured yet | down by a third | Event at save: classification chosen or left |
| Forms opened but left without saving | not measured | under 30% | New events |
| Time from open to save, one trip | not measured | under 45 s median | New events |
| Back-filling: trips added from the review card ("next" or "way back") | (new) | over a third of back-filled trips | New event |
| "Missing a trip?" reports | 84 in 30 days | Fewer per active driver; the ones left are real misses | `trip.report_missing` |
| Support emails asking us to add a trip | count by hand from the Inbox | down | Inbox |

---

## 6. Decisions for Anthony

**A. Which direction?** A ("From, To, When", recommended), B ("Fill in a day"), or C ("Same form, safer").

**B. Two releases or one?** Ship the record-changing fixes first (overlap check, empty time with day chips, empty From, no preselected "Sort later", events) and the new layout second (recommended), or wait and ship it all together.

**C. The "already have a trip" check: warn or block?** Warn with "It's the same drive" as the first button (recommended), or refuse to save a trip that overlaps a recording.

**D. Should it look on the server for older days?** Yes, for days the phone doesn't hold (older than 90 days) (recommended), or the phone only (quicker to build, misses most of a back-filled August).

**E. Where does From start?** Empty with place chips, filling "Where I am" only for a trip today just after a trip ended (recommended), or always empty, or "where I am" as now.

**F. Business or personal with nothing chosen.** Nothing preselected and "Not sure? Leave it and it goes in To sort" (recommended), or keep "Sort later" preselected, or require a choice like the web form.

**G. The end time.** Always worked out from the route with "Change" (recommended), or keep a separate "End time" field.

**H. "Add the next trip" and "Add the way back" on the saved card.** Both (recommended), only one, or neither.

**I. "Track a trip live instead" at the top of the form.** Remove it (recommended; the "+" sheet and Start Trip already offer both), or move it to the bottom.

**J. The reporter.** Give it the same From / To / When card and end on the form's saved card so the trip can be marked Business or Personal there (recommended, second release), or leave it as it is.

**K. Odometer readings.** Move into More details (recommended), or keep on the main card.

**L. The web form.** Leave it (it's already close to A) and only add the overlap check (recommended), or bring it fully in line with the app afterwards.
