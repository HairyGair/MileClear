# More and Trips: proposals (11 Oct 2026)

Follows `AUDIT.md` (More problems are M1 to M12 from its section 1.3; Trips points are from Part 2). No code changed. Part 1: three directions for More, a recommendation and decisions. Part 2: one recommended refresh for Trips, a bolder option, and the behaviour changes listed separately. Mockups: `MOCKUPS.md` and `mockups/`.

What More is for after the redesigns, in one line: **More holds the driver's car, money and work records and the tools, with one live fact on each row, and only the rows that apply to that driver. Settings holds the settings.**

Driver types: **G** gig, **E** employee in own car, **B** both, **C** company car (in a team, or picked "A company car"; the app uses `seesCompanyDriverApp` from `recs-oct10` for what to hide, and `isCompanyDriver` only for what is paid for), **P** "Just me".

Demo values everywhere (no real driver): "Demo", Toyota Prius hybrid, Pro renewing 3 Nov, 3 saved places, work hours Mon to Fri 08:00 to 18:00, £412.60 earned in October from 2 apps.

---

# Part 1: More

## 0. Parts every direction shares

### 0.1 Look
Same as the Settings mockups and Home: sentence-case group names (13 semibold grey), one card per group (radius 16), grey outline icons with no tiles and no amber, title 15 medium, live sentence 13 regular grey, chevron. "Pro" (not "PRO") as a soft amber chip, only for drivers who don't have Pro, only where the whole row is Pro. Team company drivers count as Pro here, as they do on Tax.

This needs `SettingsGroup` and `SettingsRow` changed (sentence case, no tile, grey icon). The shipped Settings page uses the same two components and still has capitals and amber tiles, which its own mockups didn't; changing the components brings Settings in line at the same time (decision M-L).

### 0.2 Name card
Avatar, name and the plan in words: "Pro · renews 3 Nov", "Free plan · see what Pro adds", "Pro through Scrandalous", "Company car · Acme Ltd" (team). Opens Settings (Settings decision C). The email moves off More (it is on the You screen).

### 0.3 The problem strip
When Settings' check would show red, More shows **Home's blocking strip** under the name card: "Trips aren't recording · Fix" or "2 trips couldn't upload · Retry", one line, same words, same action as Home (`selectStatusLine`, `useSettingsHeadline`). Nothing when all is well. This replaces the two-line red hint on the Settings row (M4). The Settings row keeps a calm grey sentence.

### 0.4 No Log out on More
Log out lives at the bottom of Settings with its "are you sure" (Settings decision I). Removing More's instant Log out stops the mis-tap sign-out (M3).

### 0.5 Merges and renames on More

| Today | Becomes | Why |
|---|---|---|
| Vehicles | **Your cars** | Settings says "Your car"; plural here because the screen lists every car |
| Achievements | **Badges** | Home ("Next badge") and Insights say badges |
| Odometer log | **Odometer** | Shorter, the row's sentence says the reading |
| Link a bank + Bank inbox | **Bank** (one row) | One feature. Not linked: "Bring in your earnings automatically" (Pro). Linked: "Monzo linked · 4 payments to sort". Opens the inbox when linked, the link screen when not. Screen titles become "Link your bank" and "Bank payments" |
| EmSee | **Ask EmSee** | Says what it does |
| Feedback | **Tell us about a problem or idea** | Same as Settings |
| (none) | **Road alerts** (new standing row) | The screen exists but has no door (M9) |
| (none) | **Chargers near you** (new, electric and plug-in hybrid cars only) | Same |

### 0.6 Fixes every direction includes

| # | Fix | Ref |
|---|---|---|
| MF1 | Use `seesCompanyDriverApp` (from `recs-oct10`) for every money row, so a driver who picked "A company car" sees the same short More as a team driver | M5 |
| MF2 | Hide money rows (Earnings, Invoices, Bank) and Shifts from "Just me" drivers in both modes; hide Shifts from company drivers unless they have shifts | M5 |
| MF3 | Bank payments screen: a free driver sees what Pro adds, not "All caught up" | M6 |
| MF4 | Work hours: same rule on More and Settings (work drivers only) | Audit 1.1 |
| MF5 | Remove Log out from More | M3 |
| MF6 | Screen titles match row names ("Open Banking" and "Inbox" go) | M7 |

---

## 1. Direction A: "Jobs with live sentences" (designer 1, recommended)

**Point of view:** More is grouped by what the driver is looking after (car, work, money, progress), each row says one live fact, and it uses exactly the look and rules of the new Settings page, so the two read as one family. It's Settings' direction A applied to More.

### A.1 The page (G and B, Work mode)

| # | Group / row | Live sentence (example) | Goes to | Who | Data today |
|---|---|---|---|---|---|
| | Name card | "Demo · Pro · renews 3 Nov" | Settings | All | `user`, billing status |
| | Problem strip (only when broken) | "Trips aren't recording · Fix" | Runs Home's fix | All | `useSettingsHeadline` |
| | **Your car** | | | | |
| 1 | Your cars | "Toyota Prius · MOT due 14 Mar" / amber "Add your car" when none | Vehicles | All | vehicles (MOT expiry already stored for reminders) |
| 2 | Fuel | "Last fill-up 3 Oct · 136.9p near you" / "Prices near you" with no fill-ups | Fuel | All | local fuel logs, nearby prices cache |
| 3 | Odometer | "41,831 today" / "Add today's reading" | Odometer | All | odometer log |
| 4 | Saved places | "3 places: Home, Depot, Office" / "Add home and work" | Saved places | All | same summary as Settings (`placesSummary`) |
| 5 | Road alerts | "2 roadworks on roads you use" / "Nothing on your usual roads" | Road alerts | All | road alerts API (same call as Home's door) |
| 6 | Chargers near you | "3 free within 2 miles" | Nearby chargers | Electric or plug-in cars only | charging-nearby |
| | **Your work** | | | | |
| 7 | Shifts | "Last shift Mon 5 Oct · 5 h 10 min" | Shifts | G B (and anyone with shifts) | shifts table |
| 8 | Work hours | "Mon to Fri, 08:00 to 18:00" / "Not set" | Work hours | G E B C | `workHoursSummary` (Settings) |
| 9 | Invite your manager | "If your employer pays your mileage" | Invite your manager | E B, not company | |
| | **Your money** | | | | |
| 10 | Earnings | "£412.60 in October · 2 apps" / "Add what you were paid" | Earnings | G B (E with earnings) | local earnings |
| 11 | Expenses | "£36.50 in October" / "Parking, tolls and other costs" | Expenses | G E B C | expenses |
| 12 | Invoices | "1 waiting to be paid · £120.00" / "Bill your clients" | Invoices | G B (anyone with invoices) | invoices |
| 13 | Bank | "Monzo linked · 4 payments to sort" / "Bring in your earnings automatically" + Pro | Bank payments or Link your bank | G B (E with a link) | open-banking status, inbox count |
| | **Your progress** | | | | |
| 14 | Insights | "This week: 36 miles, 5 trips" | Insights | Work mode only (a tab in Personal) | same figures as Insights' week (one number per fact) |
| 15 | Badges | "12 of 18 · next: Explorer, 22 miles away" | Badges | All | same as Home's badge door |
| | **Tools** | | | | |
| 16 | Ticket defender | "Check a fine against your trips" + Pro for free drivers | Ticket defender | All | |
| 17 | Ask EmSee | "Questions about your trips and tax" + Pro | EmSee | When the server has it, not company | |
| | **Help and settings** | | | | |
| 18 | Settings | "Recording automatically · all saved" (grey; problems show in the strip) | Settings | All | `useSettingsHeadline` |
| 19 | Help and how-tos | | Help | All | |
| 20 | Tell us about a problem or idea | | Feedback | All | |
| 21 | Invite a friend, get Pro free | | Invite | All | |
| | Admin (admins only), then "Version 1.3.13 (94)" | | | | |

Order: car first for everyone (every driver has one; it's the most opened group), then work, then money. For G and B, money could come first; see decision M-D.

### A.2 How each driver sees A

| | Your car | Your work | Your money | Progress | Tools | Rows |
|---|---|---|---|---|---|---|
| G gig | 5 (6 with an EV) | Shifts, Work hours | Earnings, Expenses, Invoices, Bank | Insights (Work), Badges | Ticket defender, Ask EmSee | 19 |
| E employee | 5 | Work hours, Invite your manager | Expenses | Insights, Badges | both | 16 |
| B both | 5 | Shifts, Work hours, Invite your manager | all four | Insights, Badges | both | 20 |
| C company car | 5 | Work hours, Expenses (no money group) | | Insights, Badges | Ticket defender | 14 |
| P just me | 5 | (none) | (none); a **Your records** group instead: Records ("Mileage certificate and downloads"), "Drive for work?" ("Tell us and the Tax tab appears", opens You drive for) | Badges (Insights is a tab) | both | 14 |
| Free (any) | | | Bank row: "Bring in your earnings automatically" + Pro | | Pro chips on Ticket defender, Ask EmSee | |
| New driver | "Add your car" (amber, the one add action) | "Not set" | "Add what you were paid" | "Your first badge: 1 trip away" | | |

### A.3 What moves where
- **Off More:** Log out (Settings only), the email on the name card (You screen), the Records row for work drivers (they have the Tax tab).
- **Onto More:** Road alerts, Chargers near you (EVs).
- **Merged:** Link a bank + Bank inbox into Bank.
- **Kept on both More and Settings with the same name and screen** (Settings decisions G, H): Your cars / Your car, Saved places, Work hours, Help, Tell us about a problem or idea, Invite a friend.

### A.4 Risks
- 20 rows for a B driver is long. The groups and the sentences make it scannable, and the first screen holds the car group, which is what most people open.
- Live sentences need data on open. All of it is already on the phone or cached for Home and Settings; rows show their plain description until it loads (no spinners, no "0").
- Duplicates with Settings stay, by decision. Same names make them feel like shortcuts, not copies.

### A.5 Build size
**Small to medium, about 3 to 4 days.** A new More screen using the shared rows, a hook that gathers the sentences (most come from helpers Home and Settings already have), the Bank row, two new rows, and the component restyle. Ships by OTA.

---

## 2. Direction B: "Slim shortcuts" (designer 2)

**Point of view:** after Settings took the settings and Home took the daily figures, More only needs the places you can't reach elsewhere. No sentences, no duplicates.

### B.1 The page
Name card, then:

| Group | Rows |
|---|---|
| Your car | Your cars, Fuel, Odometer, Road alerts |
| Your money | Earnings, Expenses, Invoices, Bank |
| Your work | Shifts, Ticket defender, Ask EmSee |
| (no title) | Settings and help ("Places, work hours, help, invite a friend") |

12 rows for G. Saved places, Work hours, Help, Feedback, Invite a friend and Insights leave More (Settings and Home have them). Same per-driver hiding as A.

### B.2 Risks
- **Reverses Settings decision H** (Saved places and Work hours stay on More) and moves Help one tap deeper. Drivers who learnt More since 7 Oct lose things.
- A row with no sentence says less than Home's doors do; More would be the only page in the app that doesn't tell you anything.
- Insights in Work mode would only be reachable from Home.

### B.3 Build size
**Small, about 1 to 2 days.**

---

## 3. Direction C: "Car and money cards" (designer 3)

**Point of view:** drivers come to More to check on their car or their money. So More opens with two summary cards, then a short list for everything else.

### C.1 The page

| Block | Shows | Goes to |
|---|---|---|
| Name card | as A | Settings |
| **Your car** card | "Toyota Prius", "MOT due 14 Mar · odometer 41,831", then three figures: 2 fill-ups, £58 October fuel, 3 places | A "Your car" screen holding cars, fuel, odometer, places, road alerts |
| **Your money in October** card (G B) | "£412.60 earned", "From 2 apps · 4 bank payments to sort", then £94.50 costs, 6 receipts, 1 unpaid invoice | A "Your money" screen holding earnings, expenses, invoices, bank |
| Rows | Shifts and work hours · Insights and badges · Tools (Ticket defender, Ask EmSee, Road alerts) · Settings and help | |

Company and Just me drivers get the car card only, and an Expenses row (company).

### C.2 Risks
- **New figures.** "Costs" (fuel + expenses) and "earned this month" would be a third place for money figures after Insights and Tax, and close to Insights' weekly profit and loss, which is Pro. Insights' rule is one number per fact.
- Two new hub screens (Your car, Your money) to build and keep up to date.
- The cards look like Home's hero; two heroes on one page breaks the "one hero per screen" rule.

### C.3 Build size
**Medium, about 5 to 6 days.**

---

## 4. Recommendation: Direction A

1. **It's the same family as the new Settings page**, which Anthony picked yesterday: same groups, same rows, same live sentences, same red strip. More stops looking like the old app because it's built from the same parts.
2. **Every row tells you something** ("MOT due 14 Mar", "1 waiting to be paid"), the way Home's doors do, without adding new figures (C's risk).
3. **Keeps Settings decision H**; B would undo it.
4. **Each driver sees a shorter More:** 14 rows for Just me (19 today), 14 for company car (19 today if they picked it), 16 for employees (20 today). Gig drivers keep 19, but with Road alerts in and Log out, Link a bank and Records out.
5. **Small build, OTA.**

Worth taking from the others: B's point that More shouldn't grow again (any new row has to say a live fact or it doesn't go on); C's money line could become the Earnings row's sentence later.

## 5. Decisions for Anthony (More)

Each has a recommended answer. "Yes to all" is a valid reply.

- **M-A. Which direction?** Recommended: **A, "Jobs with live sentences"**.
- **M-B. Each row shows one live fact** ("MOT due 14 Mar", "£412.60 in October") instead of a fixed description? Recommended: **yes.**
- **M-C. When something's broken, More shows Home's red strip under your name** ("Trips aren't recording · Fix"), and the Settings row goes back to a calm grey sentence? Recommended: **yes.**
- **M-D. Order: car, work, money, progress, tools, help** for everyone? (Or money first for gig drivers.) Recommended: **car first for everyone**, so the page is the same shape for all.
- **M-E. Remove Log out from More** (it stays at the bottom of Settings, which asks first)? Recommended: **yes.**
- **M-F. Merge "Link a bank" and "Bank inbox" into one "Bank" row?** Recommended: **yes.**
- **M-G. Add Road alerts, and Chargers near you for electric and plug-in cars?** Recommended: **yes.**
- **M-H. Just me drivers stop seeing Earnings, Invoices, Bank, Shifts and Work hours** (they get Records and "Drive for work?" instead), and company-car drivers who picked it themselves get the same short More as team drivers? Recommended: **yes.**
- **M-I. Renames:** Vehicles to Your cars, Achievements to Badges, Odometer log to Odometer, EmSee to Ask EmSee, Feedback to "Tell us about a problem or idea"? Recommended: **yes.**
- **M-J. A free driver who opens Bank payments sees what Pro adds** instead of an empty "All caught up"? Recommended: **yes** (a bug fix; can ship on its own).
- **M-K. The email leaves the More name card;** the card shows your plan instead ("Pro · renews 3 Nov")? Recommended: **yes.**
- **M-L. Change the shared row style for More and Settings together** (sentence-case group names, grey icons, no amber tiles), so Settings matches its own mockups? Recommended: **yes.**

---

# Part 2: Trips

## 6. Recommended refresh: "Same list, new clothes"

Anthony thinks not much needs doing, and he's right about the behaviour. The list works. It needs the new look, plainer words, and five small labels that explain trips drivers don't recognise. Mockups: `trips-list`, `trips-to-sort`, `trip-detail`, `trip-detail-bottom`.

### 6.1 Top of the list
- **Header:** "Trips", then map, filters and a white "+" (no amber), then avatar. Buttons 44 pt touch area.
- **Missed drives strip** (only when there are some): Home's warning look, one line, "We may have missed 2 drives · Check". Opens To sort. Replaces the review card. Nothing at all when there is nothing to check (no "All sorted" card taking space).
- **Switch:** one slate track with four segments, **All · To sort · Business · Personal**, the selected one slate with a light edge (Home's mode pill). "To sort" carries an amber count, the same count as the tab badge. "Inbox" goes.

### 6.2 Day headers
"Today", "Yesterday", "Tue 6 Oct" in sentence case, 13 semibold grey, with the day's miles on the right ("15.3 mi"). Odometer under it, 12 grey: "Odometer 41,816 to 41,831 (recorded)" or "Odometer about 41,795 to 41,816". Tap still opens Odometer. No line on days with no reading (as today).

### 6.3 Trip row
Standard card, radius 16, padding 14 to 16, 10 apart.

| Part | Spec |
|---|---|
| Mini route | 56 x 56, Home's mini route: dark ground, amber route, white start ring, amber end dot. Added by hand: the dashed line. No map tiles, no pins, no "Legal" |
| Title | The route, "Home to Newcastle Quayside", 15 semibold white, one line, cut in the middle of the first place if long. Same names as the detail screen (saved place names first on both) |
| Line 2 | "08:05 · 12.4 mi · Uber Eats", 13 grey. Personal trips leave out the app |
| Chip | Right, on line 2: Business (soft amber, briefcase) or Personal (slate, person) |
| Line 3 (only when it helps) | One tag, 12 semibold grey, with a small icon: "Started with Start Trip" · "Added by you" · "Part 1 of 2 · split at a 20 min stop" · "Joined from 2 trips" · "Saved later, when your phone woke up" · "Waiting to upload" (red with "Retry" only if the upload failed) · "Sorted for you · Undo" (replaces the unexplained sparkles, for 7 days) |
| Unsorted | No chip; Home's classify control (Business / Personal halves, 40 high) under the text. The suggestion, when there is one, is a line of words above it: "Looks like Business: 3 trips from here were". Never amber on Personal |
| Removed | The left colour stripe, "?", "Review", "Manual", "Pending", the note icon on line 1 (the note shows on the detail) |

### 6.4 To sort view
Two groups: **Drives we may have missed** (each: route, "Thu 1 Oct, some time after 17:20 · about 11.8 mi", a quiet "Add trip" button and "Not a trip" as text; "Extend trip" keeps its own wording) and **Business or personal?** (unsorted trips with the classify control). At the bottom: "Missing a trip? Tell us" (opens today's sheet). Empty: green tick, "All sorted", "Every trip has Business or Personal and there's nothing to check."

### 6.5 Trip detail
- Keep the top (map, when, from and to, 44 pt miles, Business or personal?).
- Under the miles, one line on how the trip was made (green tick only for "Recorded automatically · saved to your account"; the others grey): Recorded automatically / Recorded with Start Trip / Added by you / Saved later, when your phone woke up / Joined from 2 trips / Part 2 of 3 of a longer drive / Waiting to upload.
- **Which app, Purpose and Note** become three rows in one card, each opening a short picker sheet (no more 23 chips). Which app for G and B; Purpose for E, B and C; Personal trips get Category in the same way.
- The confidence card becomes, only when useful, Home's amber strip: "The distance may be off · Your phone sent no route for this drive · Check" (Check opens Work out the miles again). Medium confidence says nothing.
- "More" becomes two open groups: **Fix this trip** (Work out the miles again, Split into separate trips, Join with the next trip (only when one is close), Odometer readings) and **Use this trip** (Save a place, New trip from here (one sheet with the four "from/to start/end" choices), Got a fine for this trip? Pro). Then "Delete trip" as red text.
- Edit trip stays as the one button under the details.

### 6.6 Words across Trips
| Today | Becomes |
|---|---|
| Inbox, Classify, to classify, Not sorted yet, Classification | To sort, Business or personal? |
| Merge, Merge {n} Trips, Merge into 1 Trip | Join, Join 2 trips, Join into one trip |
| Split Trip, un-merge, unclassified, reclassified | Split into separate trips, not sorted |
| Recorded by GPS | Recorded automatically / Recorded with Start Trip |
| Manual, Added by hand | Added by you |
| Pending, Waiting to sync | Waiting to upload |
| est. | about |
| Medium / Low confidence, No GPS samples captured | The distance may be off · Your phone sent no route for this drive |
| Undo automatic sort (sparkles) | Sorted for you · Undo |
| page 1 of 3 | (gone) |
| Start Location, Business Purpose, Add Trip, Go Back | Start, Purpose, Add trip, Back |
| Arrows between places | "to" |

### 6.7 Build size
**About 3 to 4 days for the look, OTA.** Mostly `trips.tsx` styles and strings, the row component, the detail's More section and two picker sheets.

The labels in 6.3 need facts the server doesn't keep today (checked in `prisma/schema.prisma`, model Trip):

| Label | Today | Needed |
|---|---|---|
| Added by you | `isManualEntry` | nothing |
| Sorted for you · Undo | `classificationSource`, `autoClassifiedAt` | nothing |
| Waiting to upload | local sync queue | nothing |
| Saved later | can be worked out: `createdAt` long after `endedAt` (threshold to agree, e.g. 30 min) | nothing new; a rule |
| Started with Start Trip | not stored | new field `recordedBy` (automatic / start_trip / manual), set by the phone on new trips |
| Part 1 of 2 | not stored (split replaces the trip) | `splitFromId` + part number, set by the split endpoint |
| Joined from 2 trips | not stored | `joinedCount`, set by the merge endpoint |

Those three fields are one migration plus an app build for `recordedBy` (older trips simply show no tag): about 1 to 2 days more, and a store build, not OTA. They can follow the look (decision T-F).

## 7. Bolder option: one card per day

Mockup `trips-list-days`. Each day is one card with the trips as rows inside it (time on the left, route and miles, chip on the right), the odometer at the foot of the day card, and a "This week: 36.3 miles · 5 trips · 1 to sort" card at the top. No thumbnails.

- **For:** about twice as many trips per screen; a day reads as a day (useful for odometer checks and mileage logs); closer to a paper mileage log, which is what employers and HMRC ask for.
- **Against:** loses the route thumbnail, which drivers use to recognise a trip; swipe on a row inside a card is fiddlier; the week card repeats Insights' week. Bigger change for a tab Anthony says needs little.
- **Recommendation:** not now. Ship 6 first; revisit day cards if drivers with many short trips (couriers) ask for a denser list.

## 8. Behaviour changes (separate from the look)

| # | Change | Why | Recommended |
|---|---|---|---|
| T-B1 | Header "+" asks "Start a trip now / Add a past trip" instead of opening Start a trip | Its label says "Add trip" and the past-trip form is what people look for on a list of past trips | Yes |
| T-B2 | On unsorted rows, swipe left = Personal (today left = Delete, right = always Business) | One swipe for either answer; Delete stays on long press and detail | Optional, test first |
| T-B3 | "?" and "Review" leave the list; the detail says what's uncertain | They mark most trips and read as errors | Yes |
| T-B4 | List and detail use the same place names and the same route source | They disagree today (AUDIT 2.3 point 6) | Yes |
| T-B5 | The missed-drives card disappears when there's nothing to check | Space for trips | Yes |
| T-B6 | Every tap target 44 pt or more | Accessibility | Yes |

## 9. Decisions for Anthony (Trips)

- **T-A. Go with the refresh in section 6** (new look, same list)? Recommended: **yes.**
- **T-B. "Inbox" becomes "To sort"?** Recommended: **yes.**
- **T-C. Business and Personal chips match Home** (soft amber with a briefcase; slate with a person), and the coloured stripe on the left goes? Recommended: **yes.**
- **T-D. Rows lead with the route ("Home to Work") and use Home's small route drawing instead of a map tile?** Recommended: **yes.**
- **T-E. Label the trips drivers don't recognise:** Part 1 of 2 (split), Joined from 2 trips, Saved later, Started with Start Trip, Added by you? Recommended: **yes.**
- **T-F. Add the three small facts the server doesn't keep yet** (how a trip was recorded, which trip it was split from, how many were joined), so those labels can show on new trips? Older trips just show no tag. Needs one migration and a store build. Recommended: **yes, as a second step after the look.**
- **T-G. Trip detail: Which app and Purpose as two rows that open a picker,** not 23 chips? Recommended: **yes.**
- **T-H. Replace "Low / Medium confidence" with a plain amber warning only when the distance may be off?** Recommended: **yes.**
- **T-I. Tidy the trip detail's "More" into "Fix this trip" and "Use this trip",** and one "New trip from here" for the four "New trip from/to" rows? Recommended: **yes.**
- **T-J. Behaviour changes T-B1, T-B3 to T-B6?** Recommended: **yes.** T-B2 (swipe left for Personal): **test on TestFlight first.**
- **T-K. The bolder day-card list (section 7)?** Recommended: **not now.**
