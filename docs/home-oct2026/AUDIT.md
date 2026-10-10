# Home screen audit (10 Oct 2026)

Branch `home-redesign` (built on the unreleased Tax and Insights redesigns). Audit only, nothing changed.

Screenshots: `screens/before/` on the demo account (work type Both, Pro, dark), iPhone 17 simulator, Expo Go.
- `work-01` to `work-02`: Work mode, More closed (the whole default screen is two phone heights).
- `work-03-more-open` to `work-12-more`: Work mode with More opened.
- `personal-01` to `personal-11`: Personal mode, More opened from `personal-04`.

The simulator has lost "Always" location, so the red "Your trips stopped recording" card shows in every shot. That is the "something wrong" state, and real drivers see it too (25% of the active fleet can't record in the background).

Code: `app/(tabs)/dashboard.tsx` (idle Home, active shift screen, 4 modals), `components/personal/PersonalDashboard.tsx` (Personal Home), `lib/layout/index.ts` (which cards are on Home or under More), `lib/dashboardMessages` (blockers, setup, suggestions), `lib/heroFigure` (which figure leads).

---

## 1. What Home can show, top to bottom

### Always at the top (both modes)

| # | Element | Shows | When | Tap goes to | Repeats |
|---|---|---|---|---|---|
| 1 | Header | Logo + wordmark, avatar | Always | Avatar: Profile | |
| 2 | Work / Personal toggle + (i) | Mode switch | Always | (i): Work explainer pop-up | The tab bar also changes (Tax vs Insights) |
| 3 | Recording banner | "Recording trip", miles, time | Auto trip or quick trip in progress | Active recording / trip screen | Live Activity |
| 4 | Automatic trips row | On/off switch, "Drives record by themselves.", "Not working? Tell us" | Always | Switch; link opens email | Trips tab "tracking off" banner |
| 5 | Sync banner | "N trips couldn't sync" | Any failed sync | Sync status | |
| 6 | Trip status strip | "Trip saved · X mi", route, sync chip; or "Basic tracking" | Up to 12 h after a save | Trips / sync status | Trips list |
| 7 | "We improved your trip data" | Trips re-routed, miles recovered | Once, after a server fix | Dismiss only | |
| 8 | Red blocker, OR amber "Finish setting up" checklist | No location / Background App Refresh off / Always lost; or 1-4 setup rows with "N of M done" | One or the other, never both | Fixes the permission | |
| 9 | Low Power Mode notice | Text | Low Power / Battery Saver on | Not tappable | |

### Work mode, default cards on Home

| # | Card | Shows | When | Tap | Pro | Repeats on another tab |
|---|---|---|---|---|---|---|
| 10 | Hero: Mileage claim | £ claim this tax year, streak "Nd", miles today, miles this week, trips this year; "N unclassified trips" row; free users "Upgrade to export" (not tappable) | Always. 5 versions: last year leads (early in year), Day 1 £0.00, "none marked Business" £0.00, miles lead (claim < £50), default | Only the unclassified row (Trips) and the £0 version | Upsell line for free | **Yes**: Tax ThisYear claim, Insights "£X claim built" and tax-year progress bar |
| 11 | "Where did you hear about us?" | One question | First 30 days | Answers | | |
| 12 | Odometer prompt | "Need odometer readings for work?" | Work, 3+ trips, vehicle has no reading, not dismissed | Add reading sheet | | |
| 13 | Start Trip + Start Shift | Two big buttons | Always | Trip screen; starts a shift in place | | |
| 14 | Pause recording | Link | Always | Pause choices | | |
| 15 | Quick actions | Shifts, Expenses, Insights, Save spot | Always | Those screens | | Insights is also a quick action because the Work tab bar has Tax instead |
| 16 | Road alerts | Closures on usual roads, or the trial offer | Only when something is on | Alert detail | | |
| 17 | Tax line | e.g. "Do you need a 2025-26 return? · 113 days left" (gig/both); "Mileage Allowance Relief: £X" (employee); nothing for company drivers | 1+ trips | Tax tab | | **Yes**: the Tax tab's top card, which is also one tap away in the tab bar |
| 18 | Ready for 31 January? | Checklist progress, days left | 1 Dec to 31 Jan, gig/both only | SA checklist | | Tax tab Return card |
| 19 | Recent Journeys map | Last 10 routes, legend | Any recent trip | Full-screen map | **Pro**: free users see a "Pro Feature" card instead | Trips list has a map per row |
| 20 | Add your vehicle | Nudge | No vehicle | Vehicle form | | |
| 21 | "Do you claim mileage back from work?" (Milesheet) | Big card, two buttons | Employee/both, or any business miles; not answered | Nominate manager | | |
| 22 | Record your first trip | Two buttons | 0 trips, location not "none" | Trip screen / manual | | |
| 23 | Upgrade to Pro | Rotating line (one repeats the hero £) | Free, 5+ trips, not dismissed in 3 days | Paywall | Free only | |
| 24 | More (collapsed) | "Suggestions, Business Mileage and 9 more" | Always | Opens below | | |
| 25 | Customise this dashboard | Link | Always | Customise | | |

### Work mode, under More (only drawn when opened)

| Card | Shows | When | Repeats on another tab |
|---|---|---|---|
| Business Mileage (month) | Miles, trips, mi/trip, days left in month | Always | Insights Month view |
| Shift suggestion | "Looks like a shift", grade it | Server has one | |
| Weekly Earnings goal | £ / target, %, £ to go | Gig only, 1+ trips | Insights "Coming up" |
| Today | Miles, trips, £ claim | Trips today | Insights (Today was removed there on purpose, decision D) |
| Activity heatmap | 7x24 grid, platform chips, £ | Gig, business miles | **Same data** as Insights "When you drive" |
| How you compare (UK) | Percentiles, medians, 706 drivers | Gig, business miles | Insights |
| Drivers near you | Typical vs you, 4 rows | Gig (Work), 1+ trips | **Same data** as Insights "Drivers near you" |
| Working calendar | Month grid coloured by earnings, "£0.00 · 4 days · 5 trips" | Business miles | Insights |
| September in MileClear | Community totals | 1st to 10th of the month | |
| Community insights | Best platform, busiest time, fuel | Pro, enough drivers | |
| Auto-note nudge | "Add a note" for the last auto trip | Has a candidate | Trips |
| Smart insight carousel | Up to 5 rotating tips (unclassified, streak, export, upgrade...) | Usually | Hero nudge, Trips badge |
| Suggestions (max 2) | Save places, invite friends, Android beta | Eligible, not dismissed | Save places is also a pop-up alert |

Company drivers never get the gig-only cards (weekly goal, heatmap, both benchmarks, community), not even under More. They still get the Working calendar, coloured by earnings they don't have.

### Personal mode

| # | Card | Shows | When | Tap | Repeats |
|---|---|---|---|---|---|
| P1 | "Trip saved" card | Miles, route, "your 2nd trip today" | 5 min after a save, hides after 15 s | Not tappable | Trip status strip (row 6) says the same thing |
| P2 | Start Trip, Pause, quick actions | Vehicles, Fuel, Badges, Save spot | Always | Those screens | |
| P3 | Road alerts | As Work | | | |
| P4 | Monthly mileage | 205 "miles, all driving", trips, mi/trip, days left | Always | Month arrows | Insights Month |
| P5 | Your driving today | **0.0 miles** in big type, trips today, miles this week, fuel est. £ | Always | Not tappable | Insights summary; Fuel card on Insights |
| P6 | Milestone | "Next: Explorer, 500 mi, 178 to go" | 5+ miles | Not tappable | Insights Coming up / Badges |
| P7 | Recent Journeys map | As Work | | | |
| P8 | Where did you hear / vehicle / first trip / Pro | As Work | | | |
| More | Today/Month/Year recap (with share + referral line), Driving patterns (20+ numbers), Drivers near you, community month, community, tips, suggestions | | | | Insights covers all of these |

### Active shift (replaces the whole Home)

"Shift Active", TRACKING, a running clock, vehicle, live £ earned (if an hourly rate is set), a 280-pt live map, miles this shift / today / this week, End Shift. Clear and focused. No mode toggle, no Start Trip, no tax line. Ends in a scorecard pop-up.

### Pop-ups Home can raise (one per app open)

Location primer > Work explainer > "Save X and Y?" > "Rate MileClear?". Plus End Shift scorecard and "Log shift earnings?".

---

## 2. Noise, counted (demo account, Work mode)

| | Before the fold (first screen) | Home with More closed | Home with More opened |
|---|---|---|---|
| Cards / blocks | 6 (toggle, auto row, blocker, hero, buttons, quick actions) | 10 | 20 |
| Distinct numbers | 5 (£139.33, 2026-27, 0.0, 181.7, 24) | 7 | 70+ (heatmap cells not counted) |
| Things you can tap | 14 | 19 | 40+ |
| Amber "do this" buttons | 2 (Start Trip, Start Shift) + an amber switch + an amber link | 4 | 7 |

Personal mode first screen: 6 blocks, 6 numbers, 13 tap targets. Opened: about 60 numbers.

### The same fact, different numbers, on one screen

- **"Your miles a week" three ways in Work**: hero "181.7 mi this week", How you compare "72.7 mi" (30-day average), Drivers near you "32 mi" (4-week average). In Personal: "181.7 this week" and green "Great week so far... above your usual pace" next to "Fewer miles than most drivers here... You're at 35". A driver cannot tell which is true. (Insights already adopted "one number per fact".)
- **Trips**: 24 (tax year, hero), 5 (this month), 20 (heatmap, 12 weeks), 4.7 and 5.5 a week (two benchmarks), 5 (calendar). All correct, none labelled well enough to tell apart at a glance.
- **Money**: £139.33 claim; £562.85 (heatmap earnings, 12 weeks); £0.00 weekly earnings goal; **£0.00** on the calendar with no label (it is earnings, it reads like the claim); £18 a week claim. The same driver sees £0.00 twice below £139.33.
- **205 "business miles"** (Work) vs **205 "miles, all driving"** (Personal) for the same month.
- **Today**: "0.0 mi today" (hero), "0.0 miles" big (Personal card), "0.0 / 0 / 0.0" (Today recap). Three cards of zeros at 9am.

### Contradictions and broken states seen

- The **Automatic trips switch says ON, "Drives record by themselves."** directly above a red **"Your trips stopped recording"**. Both are right in code terms; together they read as nonsense.
- The rule in `dashboardMessages` is "at most ONE thing above your mileage". In practice there are two (the Automatic trips row + the blocker), plus the mode toggle, before the hero. The mileage starts almost halfway down the screen.
- **Recent Journeys says "No routes yet"** on an account with 24 trips (the demo trips have no route points). A real driver with manual trips sees the same lie. Free drivers instead see a full "Pro Feature" card in this slot.
- **Weekly Earnings shows "£0.00 / £500.00 target, 0%"** to a Both driver: the empty-state rule from the 7 Oct pass ("no £0.00 / F / -100%") was never applied here.
- The **Smart insight card is purple**, the only purple thing in the app.
- **Referral appears twice** under More in Personal (recap footer line and the suggestion card). Saved places appears as a card and as a pop-up alert.
- Dead or near-dead: the trip sheet on idle Home is never reachable; `work_shift` and `work_quicknav` render nothing; the hero's "Upgrade to export" line can't be tapped; Personal recap modal is never opened.

### Things on Home a driver cannot act on

Miles today (usually 0), days left in the month, percentiles against 706 drivers, community totals (794 drivers, 578,292 miles), the working calendar, peak hours, busiest days, most visited places, streak badge "Nd" with no explanation. These are interesting, but they are Insights material, and Insights now shows most of them already.

---

## 3. What a driver needs, by moment

| Moment | What they need at a glance | What Home gives them today |
|---|---|---|
| **About to drive** | Is it recording by itself? One big Start Trip (and Start Shift for gig). | Yes, but the buttons sit under the hero, about two-thirds of the way down a Work screen, below two status rows. |
| **Just finished a drive** | "Saved: 12.4 mi, Home to Depot, Business. Change?" One tap to fix the classification. | Trip status strip (small, not on screen if the blocker is there), Personal "Trip saved" card that vanishes in 15 s and can't be tapped. No classify button anywhere on Home. |
| **End of day / week** | "This week: 182 mi, £X claim, 3 to sort." A door into Insights. | Hero meta line (today, week, trips) in grey small type; the real summary is behind More or on Insights. |
| **Nothing happening, new user** | "Drive and it records itself", one first-trip action, what the app will give them. | Day 1 hero "£0.00 to claim so far" (a zero as the headline), Start Trip, then the first-trip card repeating Start Trip, plus setup checklist, vehicle nudge, "where did you hear", Milesheet card. Up to 6 asks. |
| **Nothing happening, regular** | Their running figure and the next useful thing. | Hero £ figure (good), then cards that don't change day to day. |
| **Something wrong** (tracking off, permission, unclassified, sync stuck) | One clear red or amber line at the very top with the fix. | Permission problems: good (one card). But tracking switched off shows only as a grey switch; "N unclassified trips" is buried in the hero's bottom row (only from 5+) and the Trips badge; sync failure is a separate banner; Low Power is another card. Four different styles for "something's wrong". |

---

## 4. What Home should tease (one line each, never the full card)

| Screen | Tease that earns the tap | Today |
|---|---|---|
| Trips | "3 trips to sort" or "Last trip: 12.4 mi, 2 h ago" | Hero nudge from 5+ only; badge |
| Insights | One sentence: "Your best week since August" / "Uber paid most per mile this week" | Full heatmap, benchmarks, patterns under More (duplicates) |
| Tax | One line (already done, decision L) | Good. Keep it, but it duplicates a tab one tap away, so it must say something the tab name doesn't |
| Achievements | "Next badge: 22 miles away" | Personal milestone card only; Work nothing |
| Fuel | "Cheapest diesel near you: 139.9p" (we have the data) | Quick action button only, Personal |
| Earnings | Gig: "£X earned this week, £Y per mile" | Weekly goal card, under More, shows £0.00 |

---

## Top problems (ranked)

1. **The screen opens on status, not on the driver.** Mode toggle, Automatic trips row and any warning come before the mileage and the Start Trip button. On a real "something wrong" day the buttons are below the middle of the screen.
2. **Under More is a second, longer Home** (14 cards, 70+ numbers) that copies Insights card for card (heatmap, Drivers near you, benchmarks, calendar, recaps, patterns). Two places to keep right, and a reason not to open Insights.
3. **One fact, several numbers.** Weekly miles three ways, trips five ways, unlabelled £0.00 next to £139.33. Drivers stop trusting all of them.
4. **Mixed signals about recording.** "Drives record by themselves" (switch on) above "Your trips stopped recording". "Not working? Tell us" next to the actual fix.
5. **Nothing on Home helps right after a drive.** No "last trip" with a Business/Personal tap, which is the single most useful action (46% of trips unclassified on 15 Sep).
6. **Zeros and empty states as headlines**: Day 1 "£0.00", "0.0 miles" today, "£0.00 / £500 target", "No routes yet" with 24 trips, free users' "Pro Feature" card in the map slot.
7. **Asks pile up for new and Both drivers**: setup, vehicle, first trip, "where did you hear", odometer, Milesheet manager invite, Pro, referral. Several are big two-button cards.
8. **Too many equal-weight buttons.** Start Trip, Start Shift, Pause, four quick actions, the auto switch, plus the tab bar: 14 tap targets on the first screen, and Insights reached two ways in Work.
9. **Work and Personal Homes are built differently** (hero vs no hero, different quick actions, different card for the same month) so switching mode feels like a different app, and the "both" driver pays for it.
10. **Customise is doing the design's job.** The defaults are calm-ish only because 14 cards are hidden; saved layouts from before 4 Oct still show the old long page.

## Principles for the redesign

1. **One screen, no scrolling needed for the essentials**: am I recording, start a trip, my figure, my last trip, one thing to fix. Everything else is a door.
2. **Problems first, but only one, and in one style.** A single status line at the top that merges the auto-trips switch, permission blockers, sync failure and Low Power. Green "Recording automatically" when all is well, so the switch row can go.
3. **Lead with the driver's own number, never a zero.** Work: this tax year's claim (or last year's early on). Personal: this month's miles. Day 1: what will happen, not £0.00.
4. **Last trip, with one-tap Business/Personal.** The most useful thing Home can do after a drive, and it pulls people into Trips.
5. **Tease, don't copy.** Each other tab gets at most one sentence on Home (Trips: to sort, Insights: one finding, Tax: one line, Badges: next one). No card on Home that also lives on Insights.
6. **One number per fact, same as Insights.** Same source, same label, shown once. Label every £ (claim vs earned).
7. **The same shape in both modes.** Same slots in the same order; only the words and the figure change. Mode toggle smaller, not the first thing on screen.
8. **Asks are capped and quiet.** At most one growth/setup ask on Home at a time, as a slim row, never above the trip buttons; the rest wait their turn.
