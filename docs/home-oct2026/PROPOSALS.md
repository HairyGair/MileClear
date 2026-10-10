# Home screen: proposals (10 Oct 2026)

Follows `AUDIT.md`. No code. Three layouts, then a recommendation, then decisions for Anthony.

Screen: iPhone 17, 402 x 874 pt. Under the status bar (about 60 pt), the header (56 pt) and the tab bar (83 pt), the first screen has about **675 pt** of content before any scrolling. Side margins 20 pt, gap between blocks 12 pt. Heights below are targets for the mockups.

---

## 0. Parts every layout shares

These are defined once here, and the layouts arrange them.

### 0.1 Header (56 pt)
Logo + "MileClear" on the left, unchanged. On the right: a **compact mode pill** (Work | Personal, 2 segments, 30 pt high, about 132 pt wide), then the avatar (36 pt).
- The pill **replaces the big toggle and the (i) button**. The Work explainer moves to a "What's the difference?" link at the bottom of the Recording sheet (0.2) and still opens by itself on a driver's first visit to Work.
- **Company drivers** and anyone who has never had a Work trip still see the pill, so they can switch. Their default mode is unchanged.

### 0.2 Status line (one row, 48 pt, full width, tappable)
This one row replaces the big toggle area, the Automatic trips row, the recording banner, the sync banner, the trip status strip, the red blocker card, the setup checklist card, the Low Power card and the "We improved your trip data" banner. It shows **one** message, the highest one in this list that applies:

| Priority | State | Dot / colour | Text (example) | Tap |
|---|---|---|---|---|
| 1 | Recording a trip now | Green, pulsing | "Recording · 3.1 mi · 6 min" | Live trip screen |
| 2 | Can't record (no location, Background App Refresh off, Always lost) | Red | "Trips aren't recording. Tap to fix" | Runs the same fix as today's red card |
| 3 | Trips failed to sync | Red | "2 trips couldn't upload. Tap to retry" | Sync status |
| 4 | Paused | Amber | "Paused until 18:00" + **Resume** button on the right | Resume (button); the row opens the Recording sheet |
| 5 | Automatic trips switched off | Grey | "Automatic trips off. Only Start Trip records" | Recording sheet |
| 6 | Low Power Mode / Battery Saver | Amber | "Low Power Mode is on. Drives may not record" | Short explainer sheet |
| 7 | Setup not finished | Amber | "Finish setting up · 2 of 4 done" | Today's checklist, as a sheet |
| 8 | All fine | Green, still | "Recording automatically" | Recording sheet |

**Recording sheet (new, bottom sheet):** the Automatic trips switch; "Pause recording" with today's choices; "Not working? Tell us"; "What's the difference between Work and Personal?". Nothing in it is new except the container.

The one-time "We improved your trip data" message becomes a priority-7.5 status message ("We recovered 12.4 miles on 3 trips"). It shows on one visit, and tapping it opens Trips.

### 0.3 Hero figure (the driver's own number)
One large figure, a label above it, one supporting line under it. Tapping the card opens the tab that explains the figure. There's no streak badge (it moves to Insights) and no "upgrade to export" line (that moves to the ask slot, 0.7).

| Driver | Label | Big figure | Line under | Tap |
|---|---|---|---|---|
| Gig, Both (Work mode) | MILEAGE CLAIM · 2026-27 | £139.33 | "182 business miles this week" | Tax tab |
| Employee (Work) | MILEAGE CLAIM · 2026-27 | £ at the employer's rate (as today) | "182 business miles this week" | Tax tab |
| Company driver (Work) | BUSINESS MILES · 2026-27 | 1,204 mi | "182 this week" | Tax tab (Records) |
| Any driver, Personal mode | OCTOBER | 205 miles | "182 this week · 5 trips this month" | Insights, Month |
| Early in the tax year (today's rule) | MILEAGE CLAIM · 2025-26 | last year's £ | "2026-27 so far: £X" | Tax tab |
| New driver, no trips | (no hero; see 0.4 "New driver") | | | |
| Claim under £50 (today's "miles lead" rule) | SINCE 6 APRIL | 2,140 miles | "£31 claim so far" | Tax tab |

The figures come from the same source as today (the tax-year stats). "This week" uses the Monday-to-Sunday week that Insights uses, so the two screens can't disagree.

### 0.4 Last trip card (new, the main new idea)
About 112 pt tall. Shows the most recent trip, and it is where a driver classifies it.

```
[mini map 56x56]  Today 17:40 · 12.4 mi                  [Synced ✓]
                  Home → Sunderland Depot
                  [ Business ][ Personal ]      (one tap, amber = chosen)
──────────────────────────────────────────────────────────
3 more trips to sort                                          >
```

| State | What it shows | Taps |
|---|---|---|
| Just finished (saved in the last 12 h) | Title "Just now" / "2 h ago", miles, route, sync chip (Saving / Synced / Waiting for signal / Needs attention), Business/Personal choice. If it was sorted automatically: the choice is pre-set with a small "Auto" tag | Card → trip summary. Choice → saves straight away (works offline). Chip "Needs attention" → sync status |
| Older trip, already sorted | One compact line (64 pt): "Yesterday 17:40 · 8.2 mi · Business", with no choice buttons | Card → trip summary |
| Unsorted trips waiting | Footer row "N more trips to sort >" (only when N ≥ 1) | Footer → Trips, filtered to unsorted |
| Missed journeys suspected | Footer row instead: "We may have missed a drive yesterday >" | Footer → Trips inbox |
| Recording right now | Unchanged (the status line shows the live trip) | |
| Shift trip | Adds "Shift" chip; route as above | |
| **New driver, no trips** | Becomes "Your first trip" (120 pt): "Just drive. MileClear starts recording when you pass 15 mph." Under it, two links: "Add a past trip" and "How it works" | Links → manual trip, Help |
| Personal-only driver (has never had a Business trip) | No Business/Personal buttons unless the trip is unsorted | |
| Company driver | Choice shown (they classify too) | |

Today's 15-second "Trip saved" card in Personal mode and the trip status strip both disappear into this card.

### 0.5 Trip buttons (56 pt)
- **Start Trip:** primary amber.
- **Start Shift:** outline, next to it. **Only for gig and Both drivers in Work mode** (shifts are a gig idea; 152 of 626 drivers ever used them). Everyone else gets Start Trip full width.
- There's no Pause link here; Pause lives in the Recording sheet, and while paused the status line carries Resume.
- **While a shift is running**, Home stays today's dedicated shift screen (clock, live map, End Shift), with the status line added above it. This screen works well, so it is not redesigned.

### 0.6 Door rows ("teasers")
These are plain list rows, 52 pt each, with an icon, one sentence, and a chevron. **There are three at most.** Each one is a door to another screen and says something that screen holds. None of them is a copy of a card. When a door has nothing honest to say, the row is skipped and the next one moves up. There is never a zero.

| Door | Says (examples) | Tap | Shown to |
|---|---|---|---|
| Road alert (only when active, always first, amber icon) | "A19 closed northbound until 22:00" | Alert detail | Anyone in the trial |
| Tax | Today's one-line tax summary, unchanged (decision L). 1 Dec to 31 Jan: "Ready for 31 January? 2 things to sort · 52 days" | Tax tab / SA checklist | Gig, Both, Employee (relief line). Not company, not Personal |
| Insights | Work: "This week: 5 trips, £58 claim built". Pro adds "up 12% on last week". Personal: "This week: 182 miles, longest 41 mi on Monday". On Mondays until 12:00: "Last week: 182 mi, £58. See your week" | Insights, on Week (or last week on Mondays) | Everyone |
| Earnings | "£412 earned this week · £1.20 a mile" (only if earnings exist this week) | Earnings | Gig, Both |
| Badges | "Next badge: Explorer, 22 miles away" | Achievements | Everyone (Personal first) |
| Fuel | "Diesel 139.9p at Tesco Silksworth, 1.2 mi" | Fuel | Personal mode; Work mode only if the driver has logged fuel |

Choosing the three for each driver:
- **Work, Gig/Both:** Tax, Insights, Earnings (Badges if there are no earnings).
- **Work, Employee:** Tax, Insights, Badges.
- **Work, Company driver:** Insights, Badges, Fuel.
- **Personal mode:** Insights, Badges, Fuel.

A road alert, when present, takes the first row and pushes the last one off.

### 0.7 Ask slot (one row, 64 pt, dismissible)
**Only one ask on Home at a time**, always below the door rows and never above the trip buttons. It is a slim row (icon, title, one line, X), not a big card. When it's dismissed, the next eligible ask waits until the next day. In priority order:

1. "Where did you hear about MileClear?" (first 30 days; opens today's question as a sheet)
2. Add your vehicle (no vehicle)
3. Odometer readings for work (Work, today's conditions)
4. Does your employer pay your mileage? Invite your manager (Employee/Both, today's conditions)
5. Shift suggestion: "Looks like a shift: 4 trips, 16:10 to 22:35. Grade it" (gig/Both)
6. Save places you visit often (also stops the separate pop-up alert)
7. Pro (free drivers with 5+ trips; today's rotating lines, minus the one that repeats the hero £)
8. Invite a friend, get Pro free
9. Android beta (retire when the public Play release ships)

The setup checklist is **not** an ask. It lives in the status line, because it affects recording.

### 0.8 What leaves Home and where it lives

| Today on Home | New home | Already exists there? |
|---|---|---|
| Automatic trips switch, "Not working? Tell us" | Recording sheet (status line); Settings > tracking | Settings yes; sheet new |
| Pause recording | Recording sheet; Resume on the status line | New container |
| Work explainer (i) | Recording sheet link; auto first visit unchanged | Yes |
| Quick actions: Shifts, Expenses, Vehicles, Fuel, Badges, Save spot | More tab (all listed there today); Badges + Fuel also as door rows; Save spot also on trip summary ("Save place") | Yes |
| Quick action Insights (Work) | Insights door row; More tab > Insights | Yes |
| Streak "Nd" badge | Insights (Coming up / Records) | Yes |
| Hero meta "0.0 mi today · trips this year" | Insights, Week | Yes |
| Recent Journeys map | Trips (map per row) + Insights Go deeper "Your routes"; full-screen journey map from Trips header | **Journey map needs a Trips entry point** (small build) |
| Today's tax line | Door row (same text) | Yes |
| Ready for 31 January? | Tax door row in season | Yes |
| Personal: Monthly mileage card | Hero | n/a |
| Personal: Your driving today | Hero line + Insights | Yes |
| Personal: Milestone | Badges door row; Insights Coming up | Yes |
| More: Business mileage by month | Insights Month (with previous/next) | Check Insights lets you step back months; if not, add it |
| More: Weekly earnings goal | Insights Coming up | Yes |
| More: Today recap + share | Insights share (Week) | Yes (Today dropped by decision D) |
| More: Activity heatmap | Insights "When you drive" | Yes, same data |
| More: Drivers near you | Insights | Yes, same data |
| More: How you compare (UK) | **Insights Go deeper row "How you compare"** | **No, needs adding** |
| More: Working calendar | **Shifts screen (top), or Insights Go deeper** | **No, needs adding** |
| More: This month in MileClear | **Insights, bottom, days 1 to 10** | **No, needs adding** |
| More: Community insights (Pro) | **Insights Go deeper row** | **No, needs adding** |
| More: Driving patterns (Personal) | Insights "When you drive" + Go deeper "Your routes" | Mostly; "most visited places" needs checking |
| More: Auto-note nudge | Last trip card → trip summary note | Yes |
| More: Smart insight carousel | Retired. Unsorted → last trip footer; streak at risk → push already exists; export tip → Tax; upgrade → ask slot | Yes |
| More: Suggestions (places, referral, Android) | Ask slot; referral also More tab | Yes |
| "Customise this dashboard" | See section 4 | |

Nothing a driver relies on disappears. The four rows marked "needs adding" have to ship in the same release as the new Home, or those cards stay reachable from a temporary "More on Insights" link.

---

## 1. Layout A: "Calm list" (recommended)

A single column with the same order every time. It answers four questions top to bottom: am I recording, what's my number, how do I start, what just happened. Then it opens doors.

| # | Slot | Height | Notes |
|---|---|---|---|
| 1 | Header with mode pill | 56 | 0.1 |
| 2 | Status line | 48 | 0.2 |
| 3 | Hero figure | 132 | 0.3. Label 12 pt caps, figure 44 pt, line 15 pt |
| 4 | Trip buttons | 56 | 0.5 |
| 5 | Last trip card | 112 (64 compact) | 0.4 |
| 6 | Door rows ×3 | 156 | 0.6, one rounded group with hairlines between rows |
| 7 | Ask slot | 64 | 0.7, below the fold on most phones |
| 8 | Bottom padding | | No Customise link, no More expander |

**On the first screen** (675 pt): status, hero, buttons, last trip and the three doors add up to 48 + 132 + 56 + 112 + 156 + 4 gaps × 12 = **552 pt**, so everything except the ask fits with room to spare. On an iPhone SE the doors fold.

### A by state (Work, gig driver)

| State | Status | Hero | Buttons | Last trip | Doors | Ask |
|---|---|---|---|---|---|---|
| All fine, mid-week | Green "Recording automatically" | £139.33, "182 business miles this week" | Start Trip, Start Shift | Yesterday's trip, compact | Tax, Insights, Earnings | Next eligible, or none |
| Something wrong | Red "Trips aren't recording. Tap to fix" | Unchanged | Unchanged | Unchanged | Unchanged | Hidden while red (one problem at a time) |
| Just finished a drive | Green | Figure already includes it | Unchanged | "Just now · 12.4 mi", Business/Personal, sync chip, "2 more to sort" | Unchanged | Unchanged |
| New driver, no trips | Amber "Finish setting up · 1 of 4" or green | **Hidden** | Start Trip (full width; Start Shift appears after the first trip) | "Your first trip" card | Insights skipped (nothing yet); Tax only if relevant; "How MileClear works" (Help) as the one door | "Where did you hear" / vehicle |
| End of week (Sun 18:00 to Mon 12:00) | Unchanged | Unchanged | Unchanged | Unchanged | Insights row becomes "Last week: 182 mi, £58. See your week" and moves to first | Unchanged |

### A by mode and driver type (all-fine state)

| | Hero | Buttons | Last-trip choice | Doors |
|---|---|---|---|---|
| Work · Gig | Claim £ | Trip + Shift | Yes | Tax, Insights, Earnings |
| Work · Both | Claim £ | Trip + Shift | Yes | Tax, Insights, Earnings |
| Work · Employee | Claim £ (employer rate) | Trip | Yes | Tax (relief), Insights, Badges |
| Work · Company driver | Business miles | Trip | Yes | Insights, Badges, Fuel |
| Personal · anyone | Month miles | Trip | Only if unsorted | Insights, Badges, Fuel |

**Counts, first screen (Work, gig, all fine)**

| | Today | A |
|---|---|---|
| Blocks | 7 (toggle, auto row, hero, buttons, pause, quick actions, half a tax line) | 5 (status, hero, buttons, last trip, doors) |
| Tap targets (excluding the tab bar) | 15 | 14 (pill ×2, avatar, status, hero, Start Trip, Start Shift, last trip, Business, Personal, to-sort footer, 3 doors) |
| Amber "do this" buttons | 4 (Trip, Shift, switch, "Tell us") | 1 (Start Trip), with Shift as an outline |
| Numbers | 7 (incl. "0.0 mi today", trips this year) | 8, and each one is a different fact with a label: claim, tax year, week miles, last trip time, last trip miles, to-sort count, tax days left, week £ in a door |
| Zeros possible | Yes (0.0 today, £0.00) | No (rows with nothing to say are skipped) |

Personal, first screen: 5 blocks, 11 taps, 7 numbers (today: 6 blocks, 13 taps, 6 numbers, one of them "0.0").

The tap count barely drops. What drops is competition: one amber button instead of four, and every tap leads somewhere different, where today four buttons lead to screens that also sit in the More tab.

---

## 2. Layout B: "Buttons first, tiles"

For drivers who open the app to drive. Start Trip sits at the top, and the figures are tiles.

| # | Slot | Height | Notes |
|---|---|---|---|
| 1 | Header with mode pill | 56 | |
| 2 | Status line | 48 | |
| 3 | Trip buttons | 64 | Taller; first thing under the status |
| 4 | Last trip card | 112 | Same as 0.4 |
| 5 | Two figure tiles side by side | 104 | Work: "Claim 2026-27 £139" · "This week 182 mi". Company: "Business miles 1,204" · "This week 182". Personal: "October 205 mi" · "This week 182 mi". Each tile → Tax / Insights |
| 6 | Four door tiles, 2 × 2 | 2 × 84 | Icon, label and one number: Trips "3 to sort", Insights "+12%" (Pro) or "5 trips", Tax "113 days" / Fuel "139.9p", Badges "22 mi to go". A tile with nothing honest shows the label only |
| 7 | Ask slot | 64 | |

States follow A. In the new-driver state, the tiles are replaced by "Your first trip" and a "How it works" tile.

**First screen:** 48 + 64 + 112 + 104 + 168 + 4 × 12 = 544 pt, so everything except the ask fits. **6 blocks, about 16 taps, about 11 numbers.**

- **Good:** it is quickest to start a trip, and it looks like a dashboard. The tiles draw well.
- **Weak:** the figures shrink to tile size, so "your claim" stops being the headline the Work mode is built around. Four numbers without sentences is the noise problem again, smaller. "+12%" on a tile needs a Pro rule (decision A on Insights). The tiles need more design work for long labels and larger text sizes.

---

## 3. Layout C: "One card that changes"

There is one large "moment" card under the status line, and its content depends on what is happening. Everything below it stays fixed.

| # | Slot | Notes |
|---|---|---|
| 1 | Header with mode pill | |
| 2 | Status line | |
| 3 | Moment card (about 220 pt) | **New driver:** 3 steps (allow Always, drive, check your trip) with a progress bar. **Within 2 h of a trip:** last trip, large, with the Business/Personal choice and a mini map. **Sun 18:00 to Mon 12:00:** "Your week": miles, claim, trips, best day, Share. **Otherwise:** the hero figure with its line |
| 4 | Start Trip bar (+ Shift for gig/Both) | Always |
| 5 | Door rows ×3 | As 0.6, with "Last trip" as a door when the moment card isn't showing it |
| 6 | Ask slot | |

**First screen:** 48 + 220 + 56 + 156 + 3 × 12 = 516 pt. **4 blocks, 10 to 12 taps, 4 to 6 numbers.**

- **Good:** it is the calmest and the most relevant at each moment, and "Your week" is shareable.
- **Weak:** the screen looks different each time you open it. That is the "list jumping" complaint again (John Cheridjian, 7 Oct). The claim figure disappears for two hours after every drive, which is exactly when a gig driver likes seeing it go up. It is also the hardest of the three to test, since there are four states times five driver types.

---

## 4. Decisions common to all layouts

- **Customise / saved layouts:** Home no longer has cards to reorder, so card-level Customise for Home goes. Every Home layout, saved or not, moves to the new one (the release notes say so). Two controls stay: long-press a door row for "Hide this row", and a Settings > Home screen page that lists the door rows with switches and has a "Show all again" button. Customise for Profile and the menu is untouched.
- **More expander:** removed. Every card in it now lives elsewhere (table 0.8).
- **Mode toggle:** becomes the header pill (0.1), and the tab bar still swaps Tax/Insights with the mode.
- **Start Shift vs Start Trip:** Start Trip is the primary for everyone. Start Shift is for gig and Both drivers in Work mode only. The active-shift screen stays as it is.
- **Pause:** moves into the Recording sheet. While paused, the status line says so with Resume.
- **Asks:** one slot, one at a time, in the order in 0.7, never above the trip buttons, and hidden while the status line is red. Setup stays out of the asks: it is a status, not a request.

---

## 5. Recommendation: Layout A

1. **Predictable.** The same five blocks sit in the same place every time, so a driver learns where the claim and the last trip are. Layout C fails this.
2. **Keeps the headline.** Work mode's reason to exist, "£139.33 to claim", stays the biggest thing on screen. Layout B shrinks it into a tile.
3. **Words, not loose numbers.** Every number arrives inside a sentence that says what it is, which deals with the "one fact, several numbers" problem. Layout B brings back four bare figures.
4. **Fits on one screen** with room left, and the same shape serves Work and Personal and all five driver types. Only the words change.
5. **Smallest build.** Most parts already exist (hero rules, tax line, recap figures, achievements progress, cheapest fuel). The new pieces are the status line, the Recording sheet, the last trip card and the door rows.

Two ideas worth taking from C into A: the Monday "Last week" door, which is already in A, and a later, optional "Your week" share card on Insights rather than on Home.

---

## 6. New data needed from the server

Most of A can be built from what the app already has. The phone stores the last trip offline, the tax-year stats feed the hero, `/tax/overview` feeds the tax line, the weekly recap feeds the Insights door, achievements carry progress, and cheapest-fuel-today already exists.

1. **Last trip summary with route names and sync state.** It can come from the phone's own trip store. The server is only needed for trips made on another device, and the existing trip list (newest first, one item) covers that. **No new endpoint.**
2. **Unsorted count and missed-journey flag in one call** (for the last-trip footer). The unsorted count exists. Missed journeys exist as a separate list. A count-only option on that list would save loading the whole list. *Small.*
3. **Next badge with distance to go.** Achievements return progress for most badges. The milestone needs lifetime miles (`lifetimeMiles`, added for Insights, see NUMBERS.md). A "nearest next badge" field would avoid working it out on the phone. *Small, optional.*
4. **Insights door sentence.** It can be built from the weekly recap (miles, trips, claim, longest trip, busiest day; "vs last week" is Pro only). A server-written sentence would keep wording consistent with Insights. *Optional.*
5. **Earnings this week + pay per mile** for the Earnings door. Earnings are in the recap. Pay per mile is in the platform league endpoint. *No new endpoint; two calls, or add a total pay-per-mile to the recap (small).*
6. **"How you compare", Working calendar, community month, community insights on Insights.** These are existing endpoints, so it is screen work, not server work.

---

## 7. Decisions for Anthony

1. **Which layout?** Recommended: **A, the calm list.** It is the same order every time: recording status, your number, Start Trip, your last trip, then three one-line links to the rest of the app.
2. **Should your last trip sit on Home with Business / Personal buttons, so you can sort it without opening Trips?** Recommended: **yes.** It is the most useful thing Home can do after a drive.
3. **Should the Automatic trips switch, Pause and "Not working? Tell us" move behind a single "Recording automatically" line at the top?** Tapping it opens them. Recommended: **yes.** The line turns red when something's wrong, so the switch can never again say "on" next to "stopped recording".
4. **Should the big Work / Personal switch become a small one next to your profile picture?** Recommended: **yes.**
5. **Should Start Shift only show for delivery and gig drivers (and "both")?** Employees, company drivers and Personal mode would get one big Start Trip. Recommended: **yes.**
6. **Should the "More" section at the bottom of Home, and "Customise this dashboard", go?** Every card in them would move to Insights, Trips, Shifts or the More tab. Drivers could still hide any of the three links on Home. Recommended: **yes.** Anyone who customised their Home gets the new layout.
7. **Four cards have no home outside Home today:** How you compare (UK), Working calendar, "This month in MileClear" and Community insights. Should they move to Insights in the same release? Recommended: **yes, to Insights.** The Working calendar goes to Shifts instead.
8. **Should Home show only one "ask" at a time,** as a slim row at the bottom? That covers the Pro upgrade, invite a friend, invite your manager, add your vehicle and "where did you hear about us". Recommended: **yes.** The Pro ask takes its turn like the others, and it is the only ask free drivers with 5+ trips will see most days.
9. **Should Home stop showing today's miles, the streak badge and the map of recent journeys?** All three stay on Insights or Trips. Recommended: **yes.** Today's miles is usually 0.0, and the map is empty for anyone without routes.
10. **The shift screen (clock, live map, End Shift): leave it as it is?** Recommended: **yes,** apart from adding the new status line at the top.
