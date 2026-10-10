# More and Trips: audit (11 Oct 2026)

Branch `more-trips-design`, from main `a7199073`. Audit only, nothing in the app was changed.

Anthony's ask: "We need to redesign the 'more' section too. It's outdated now with the new update. We also need to look at the Trips section. It looks slightly outdated although I don't think much needs to be done with it! Give it the once over and bring it up to date with the rest of the app."

Screenshots: `screens/before/`, iPhone 17 simulator, Expo Go, the live demo account (work type Both, Pro, Work mode, location set to "While Using" so the red status shows). Read and navigate only: no trip was classified, edited or deleted, no setting changed, no filter left on.

| File | What |
|---|---|
| 00-home-for-reference | Today's Home, the new house style to match |
| 01-more-top, 02-more-middle, 03-more-bottom | More tab, three scrolls |
| 04-trips-top, 05-trips-scrolled, 06-trips-end | Trips list, All |
| 07-trips-inbox-filter, 08-trips-inbox-scrolled | Trips list, Inbox |
| 09-trip-detail-top, 10-trip-detail-middle, 11-trip-detail-more | Detail of a trip added by hand, with "More" opened |
| 12-trip-detail-gps, 13-trip-detail-gps-bottom, 14-trip-detail-confidence-open | Detail of a recorded trip, with "Low confidence" opened |
| 15-trips-filters-sheet, 16-missing-a-trip | Filters sheet, "Missing a trip?" sheet (closed with Cancel) |

Code read: `app/(tabs)/more.tsx`, `app/(tabs)/trips.tsx`, `components/trips/TripsReviewStrip.tsx`, `components/MissedJourneys.tsx`, `components/MissingTripReporter.tsx`, `components/trip/TripSummaryView.tsx`, `app/trip-form.tsx`, `app/trip-split.tsx`, every screen More links to, `app/settings/index.tsx`, `lib/home/doors.ts`, `lib/tax/persona.ts`, `app/_layout.tsx`, and branch `recs-oct10` (commit `74c59b42`, `seesCompanyDriverApp`).

The house style we are matching (from `docs/home-oct2026/SPEC-VISUAL.md`, Insights and the Settings mockups): sentence case, no capitals for labels; numbers in white bold, never amber; one amber thing to press per view; green only for done or live; red only for broken, always with a word like "Fix"; Business chip = soft amber with a briefcase, Personal chip = slate with a person; plain icons in grey, no amber icon tiles; cards radius 16 with 16 padding; places written "Home to Depot", not with arrows; a live sentence on a row instead of a fixed description.

Driver types: **G** gig or delivery, **E** employee in their own car, **B** both, **C** company car, **P** "Just me" (personal only).

---

# Part 1: More tab

## 1.1 Every row today

More is one list of 21 rows in 5 groups plus a name card and a Log out button (`more.tsx`). Groups are in capitals ("YOUR DRIVING", "MONEY", "TOOLS", "HELP AND SETTINGS"), every row has an amber icon in a tile and a fixed description.

| Row | Goes to | What it is | Pro | Who sees it today | Also reachable from |
|---|---|---|---|---|---|
| Name card (avatar, name, PRO chip, email) | Settings | | | All | Settings row below; avatar on every other tab |
| Vehicles | Vehicles | Cars, MOT and tax dates | 1 car free | All | Settings "Your car", Home ask "Add your car" |
| Odometer log | Odometer log | Daily start and end readings | CSV is Pro | All | Trips day lines, Home odometer ask |
| Shifts | Shifts | Past shifts | | All (also company and personal drivers, who have no shifts) | Home shift card |
| Saved places | Saved places | Named places | 2 free | All | Settings |
| Fuel | Fuel (hidden tab) | Fill-ups and prices near you | | All | Home door (Personal; Work only with fill-ups), Insights |
| Achievements | Achievements | Badges | Free | All | Home door "Next badge", Insights |
| Insights | Insights | Week, month, tax year | Compare and trends Pro | Work mode only (Personal has it as a tab) | Home door, Home hero |
| Records | Tax tab as "Records" | Certificate, downloads | Downloads Pro | P in Personal mode only | |
| Earnings | Earnings (hidden tab) | Money from platforms | CSV and snap Pro | Not team company drivers | Home door (G, B) |
| Expenses | Expenses | Parking, tolls and costs | Free | All, incl. P | Self Assessment wizard |
| Invoices | Invoices | Bills to clients | Chase and tracker Pro | Not team company drivers | Earnings |
| Link a bank (PRO) | "Open Banking" screen | Connect a bank | Pro | Not team company drivers | Earnings "Connect Bank" |
| Bank inbox (PRO) | "Inbox" screen | Bank payments to sort | Pro (server only) | Not team company drivers | Nowhere else |
| Ticket defender (PRO) | Ticket defender | Check a fine against your trips | Pro | All | Trip detail "Got a fine for this trip?" |
| EmSee (PRO) | EmSee | Ask questions about your records | Pro | When the server has it | Nowhere else |
| Invite your manager | Invite your manager | Milesheet: employer pays mileage | | Work mode, E and B | Home ask |
| Work hours | Work hours | Days and hours | Rules part Pro | All (Settings shows it to work drivers only) | Settings |
| Settings | Settings | Settings page | | All. Hint is the live status (red when broken) | Name card, avatar |
| Help and how-tos | Help | | | All | Settings, Home door for new drivers |
| Feedback | Feedback | Problems and ideas | | All | Settings ("Tell us about a problem or idea") |
| Invite a friend, get Pro free | Invite a friend | | | All | Settings, Home ask |
| Admin panel | Admin | | | Admins | Nowhere else (keep) |
| Log out (red button) | Logs out at once, no question | | | All | Settings, which asks first |

## 1.2 What a driver sees, by type

| | G gig | E employee | B both | C company car | P just me |
|---|---|---|---|---|---|
| Rows (Work mode, with EmSee) | 19 | 20 (adds Invite your manager) | 20 | 15 in a team; 19 if they picked "A company car" | 19 in Personal mode (Records in place of Insights) |
| Odd ones out | Nothing hidden | Earnings, Invoices and two bank rows shown though most employees never invoice | All | **A driver who picked "A company car" still sees Earnings, Invoices and both bank rows.** Branch `recs-oct10` hides them (`seesCompanyDriverApp`), not yet in main. Shifts shown though they never start shifts | **Sees every money row** (Earnings, Invoices, Link a bank, Bank inbox), Shifts and Work hours, none of which apply to "Just me" |
| Free vs Pro | PRO chips on 4 rows (Link a bank, Bank inbox, Ticket defender, EmSee) for free drivers; none for Pro. Team company drivers get Pro through their team but still see PRO chips on More (the Tax tab does not show them) | | | | |

## 1.3 Problems, ranked by how much they hurt a driver

1. **More looks like the old app.** Capital group names, amber icon tiles on every row (21 amber marks on one screen, against Home's one), a red outlined Log out button, fixed descriptions ("Your badges", "What you were paid"). Home, Insights, Tax and Settings now tell you something on each row; More tells you what the row is called.
2. **Half of More is now also in Settings.** After the Settings redesign, Vehicles, Saved places, Work hours, Help, Feedback, Invite a friend and Log out are on both pages, with different names (More "Vehicles", Settings "Your car"; More "Feedback", Settings "Tell us about a problem or idea"). Settings decisions G and H kept some of these on purpose as shortcuts; the names should at least match.
3. **Two Log outs that behave differently.** More logs out at once, no question; Settings asks first. A mis-tap at the bottom of More signs a driver out (and an offline driver with trips waiting to upload loses the easy way back to them until they sign in again).
4. **The Settings row shows a whole problem sentence in red with no action word.** "Location is no longer on Always. Trips aren't recording" sits two lines long in the hint, with no "Fix" (02/03 screenshots). The house rule is red only with a word like Fix, and Home and Settings use a strip for this.
5. **Company-car drivers who picked "A company car" see money rows they cannot use** (Earnings, Invoices, Link a bank, Bank inbox). `recs-oct10` fixes this; the redesign must use `seesCompanyDriverApp` too. Shifts shows for company and Just me drivers who never start shifts.
6. **"Bank inbox" for a free driver opens an empty "All caught up".** The screen has no Pro check; the server refuses, the screen swallows it and says all is well. A free driver who taps the PRO row never learns why it's empty.
7. **Names don't match the screens they open.** "Link a bank" opens "Open Banking"; "Bank inbox" opens "Inbox" (and Trips has its own different "Inbox"); "Achievements" is called "badges" everywhere else ("Next badge" on Home); "Vehicles" vs "Your car".
8. **Two bank rows for one thing.** Link a bank and Bank inbox are the same feature at two moments (before and after linking). Once linked, "Link a bank" still says "Bring in your earnings automatically".
9. **Things that exist but have no door.** Road alerts (roadworks on your usual roads) is only reachable when Home happens to show it or from a push. Nearby chargers only from a Fuel card or Insights. Downloads and the mileage certificate are not on More for work drivers (they are on Tax, which is fine).
10. **Insights is a More row in Work mode and a tab in Personal mode.** The row stays right (Work mode has Tax in that slot), but it needs a sentence so it earns its place.
11. **Ordering.** "Your driving" mixes the car (Vehicles, Fuel, Odometer), work (Shifts), places and progress (Achievements, Insights). Money comes after badges. Help and settings are below tools. Nothing is in the order a driver needs it.
12. **Jargon.** "EmSee" alone (nobody knows the name), "Open Banking", "Bank inbox", "Odometer log", "Achievements". PRO in capitals here, "Pro" in Settings.

## 1.4 What More should be after the redesigns

Home answers "what happened today", Trips "my journeys", Tax "my tax", Insights "how am I doing", Settings "is it working and what can I change". More is what's left: **the driver's car, money and work records, and the tools**. It should say one live fact per row (as Settings does), show only what applies to that driver, and leave settings to Settings.

---

# Part 2: Trips tab (once over)

Trips works and drivers use it every day. Most of what follows is look and wording, not behaviour.

## 2.1 What looks out of date

| Area | Today | House style |
|---|---|---|
| Filter pills | "All" selected is a solid amber pill; four separate 40 high pills | Home's mode pill and Insights' period switch: one slate track, selected segment slate with a light edge. Amber is for the action, not for "which list am I looking at" |
| "Inbox" | Unsorted trips are called "Inbox" here, "Classify" on the row chip, "trips to classify" on the review card, "Not sorted yet" on the detail. More also has a "Bank inbox" | One plain word: **To sort**, with the count |
| Day headers | Capitals ("TUE 6 OCT", 12 pt) and no day total | Sentence case "Tue 6 Oct", "Today", "Yesterday", with the day's miles on the right |
| Odometer line | "Odometer 41,803 to 41,816 est." under every day, 44 high | Keep (it's useful), say "about" instead of "est.", smaller |
| Business chip | Solid amber fill, dark text, no icon | Soft amber, briefcase, amber word (Home's chip) |
| Personal chip | Slate with grey text, no icon | Slate, person icon, white word |
| Left colour stripe | 5 pt stripe: amber for Business **and the same amber for unsorted** (the code says "gold vs amber" but both are `#f5a623`) | Gone. The chip and the classify control carry the state |
| Map thumbnail | Live Apple map tile with "Legal" text, red and green pins, 64 pt | Home's mini route: dark ground, amber line, white start ring, amber end dot. No tiles, no "Legal", no red or green (they mean broken and done) |
| Route line | "Home → Work" with an arrow, 13 pt under the miles | "Home to Work", 15 semibold, as the row's title (Home's last trip card does this) |
| Miles | 16 bold pure white, first thing on the row | In the second line with the time and app: "08:05 · 12.4 mi · Uber Eats" |
| Badges under the route | "Manual" grey, "?" amber, "Review" red outline with amber text, "Pending" solid amber, sparkles with no words | Words only when they help: "Added by you", "Started with Start Trip", "Part 1 of 2", "Saved later", "Waiting to upload" (red only if it failed). Drop "?" and "Review" from the list (see 2.3) |
| Review card | Amber icon and amber title "6 journeys to check" in a card with "Missing a trip you made?" under it | Home's warning strip: one line "We may have missed 6 drives" with "Check". "Missing a trip? Tell us" moves to the To sort view and the bottom of the list |
| Missed drives list | Three solid amber "Add trip" buttons on one screen; "Sometime between 09:21 on Thu 1 Oct and 09:20 on Fri 2 Oct" | One quiet "Add trip" button per drive and "Not a trip" as text. Shorter times: "Thu 1 Oct, some time after 17:20" |
| Unsorted row | Two 38 high buttons; Personal button has a **car** icon and turns **amber** when it's the suggestion | Home's classify control (40 high, two halves, briefcase and person). The suggestion is a line of words, never amber on Personal |
| Merge (long press) | Whole flow in blue (`#60a5fa`), "Merge {n} Trips", green start pin and red end flag | Same colours as everything else, "Join 2 trips", "Join into one trip" |
| Empty states | "All caught up" with an amber tick; "No business trips" | Green tick (done); "No Business trips yet" |
| Footer | "Showing 20 of 54 trips · page 1 of 3" and a full-width "Add a past trip" with an amber edge | "Add a past trip" as a text link; drop "page 1 of 3" |
| Header "+" | Amber plus, spoken "Add trip", **opens Start a trip (live)**, not the past-trip form | White plus that asks "Start a trip now" or "Add a past trip" (behaviour change, see 2.4) |
| Sizes | 10, 11, 11.5, 12.5, 13, 17, 20 pt mixed; cards radius 12 and 14; paddings 10/12/14 | Theme scale (12, 14, 15, 16, 18), radius 16, padding 16 |

## 2.2 Trip detail

| Area | Today | House style |
|---|---|---|
| Map | Good. When there's no route: an amber icon and "Added by hand, so there's no route to show." | Keep. Grey icon; for a hand-added trip draw the dashed start-to-end line Home uses |
| Top part (when, from, to, 44 pt miles) | Already in the new style (built 7 Oct) | Keep |
| "Recorded by GPS" / "Added by hand" pill | "GPS" is jargon; Start Trip and automatic both say "Recorded by GPS" | One sentence on how it was made: "Recorded automatically", "Recorded with Start Trip", "Added by you", "Saved later, when your phone woke up", "Joined from 2 trips", "Part 2 of 3 of a longer drive" |
| Business or personal? | 56 high control, matches Home | Keep |
| Which app? and Purpose | **23 chips on screen at once** for a Business trip (12 apps + 11 purposes, 10-11 screenshots), each a 36 pt pill, solid amber when picked | Two rows in a card: "Which app · Uber Eats ›", "Purpose · Delivery ›", each opening a short picker. Purpose shows for E, B and C; Which app for G and B only |
| Confidence card | "Medium confidence" amber outline, "Low confidence" **red** outline, opens to "No GPS samples captured." | Only when there's something to do: amber strip "The distance may be off · Your phone sent no route for this drive · Check". Never red (nothing is broken), never "confidence" or "GPS samples" |
| More (collapsed list) | 10 rows incl. four near-identical "New trip from the end of this one / from the start / to the end / to the start", "Recalculate distance", "Split into several trips" | Two short groups: "Fix this trip" (Work out the miles again, Split into separate trips, Join with the next trip, Odometer readings) and "Use this trip" (Save a place, New trip from here, Got a fine for this trip? Pro). Delete as a red text button at the bottom |
| Titles | "Trip", "Edit trip", "Add a past trip", but the stack default is "Add Trip", Split is "Split Trip", form labels "Start Location", "Business Purpose", "Classification" | Sentence case everywhere, "Business or personal?" instead of "Classification" |

## 2.3 Things drivers don't recognise (clarity, not looks)

1. **Split trips.** After a split, nothing in the list says the legs came from one drive, and the split screen talks about "un-merge", "unclassified" and "reclassified". Drivers report "missing" or "doubled" trips that are really split legs. Show "Part 1 of 2 · split at a 20 min stop" on each leg.
2. **Joined trips.** Three ways to join (long-press "Merge trips", the "Looks like the same journey" box with "Merge / Keep both", the detail card "Join them into one trip?" with a "Merge" button), three looks, two words. After joining, nothing says so. One word ("Join"), one look, and "Joined from 2 trips" on the result.
3. **Late-saved trips.** A trip saved when the phone woke up later (wake lag, background save, recovered) looks like any other trip, so drivers think the time or route is wrong. Say "Saved later, when your phone woke up".
4. **Start Trip vs automatic.** Since 10 Oct Start Trip behaves differently when Automatic trips is off (it runs until Arrived). Nothing on the list or detail says which way a trip was recorded. One short tag: "Started with Start Trip".
5. **"?" and "Review".** "?" (medium) and "Review" (low, red) sit on most demo trips, including ones added by hand. They are about how sure we are of the route, but read as "something's wrong with this trip". Remove from the list; on the detail say what's uncertain and what to do.
6. **The list and the detail disagree.** The list shows "Home → Work" (saved place name) while the detail of the same trip says "Home to Newcastle City Centre" (address) (05 vs 12 screenshots). The list shows a route thumbnail for a trip whose detail says "Added by hand, so there's no route to show" (04 vs 09), and a pinned map for a trip whose detail says "The route isn't on this phone yet" (05 vs 12). Use the same place names and the same route source on both.

## 2.4 Behaviour points (called out separately)

- **Header "+" opens Start a trip, not "Add trip".** Proposed: it asks "Start a trip now / Add a past trip". Small behaviour change.
- **Swiping an unsorted trip right always makes it Business.** There's no swipe to Personal. Proposed: swipe right Business, swipe left Personal on unsorted rows only (Delete stays on the long press and the detail). Behaviour change; optional.
- **Tap targets under 44 pt:** filter pills 40, header buttons 36, the note icon about 18, "Merge / Keep both" about 28, merge banner buttons about 28, quick classify 38, filter chips 28. Fixing these is part of the refresh.
- **Bank inbox empty for free drivers** (More, problem 6): show what Pro adds instead of "All caught up".
