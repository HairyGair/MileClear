# First-run tutorial: proposals (11 Oct 2026)

Follows `AUDIT.md`. No code. Three directions, then what they share, a recommendation and the decisions for Anthony. Mockups are in `mockups/` (index in `MOCKUPS.md`), drawn at 390 x 844 in the app's dark theme.

**What the tutorial is for, in one line:** a new driver should finish their first day with location on Always, the right "You drive for" answer, and one trip sorted, and should know where to look when something goes wrong.

**How we'll know:** within 14 days of launch, compared with the 14 days before:
- new sign-ups never asked for background location: from 17% to under 5%
- new sign-ups with Always on day 1: from 77% to 88% or more
- new sign-ups with an automatic trip in their first 7 days: up (today 81% for Always, 29% for never asked)
- new drivers whose "You drive for" is still the default after 7 days: measured for the first time (today nobody is asked)

---

## 0. Parts every direction shares

### 0.1 Who sees it
| Driver | What they get |
|---|---|
| **New account** (created after the release, or no trips and created in the last 7 days) | The direction's full first-run |
| **Existing driver** (about 1,500 accounts) | Never the full first-run. One "What's new" sheet on the first open after the update (`a-8-whats-new-existing`), once. Its "Take the full tour" link opens the replay |
| Existing driver with location **not Always** | The What's new sheet is skipped. The existing location pop-up and the red or amber status line already cover them, and two sheets in a row is what the prompt gate exists to stop |
| Signed in on a second phone | Treated as existing if the account has trips. Location is checked per phone by the status line as today |

New vs existing is decided from the account (`createdAt` and trip count from the profile), not from the phone, so a reinstall doesn't replay the tour.

### 0.2 "You drive for" is asked once, early
All three directions ask it, because every other choice depends on it and today nobody is asked (AUDIT 1). Same five answers and hints as Settings (`driveFor.ts`), one tap, plus **Car or van / Motorbike** (motorbikes claim 24p, not 55p). "An employer" asks the employer's rate on the next screen only if the driver knows it ("Not sure" is fine). The answer saves through the existing profile update, offline-safe, and can be changed in Settings > You drive for.

### 0.3 What changes per driver type
| | Gig / Both | Employer (own car) | Company car | Just me |
|---|---|---|---|---|
| Tabs taught | Home, Trips, Tax, More | Home, Trips, Tax, More | Home, Trips, Tax (as "your mileage log"), More | Home, Trips, Insights, More |
| Business / Personal line | "Only Business trips count towards your claim" | "Business trips are what your employer pays for" | "Business trips go in the log for your employer" | Not taught (Personal by default) |
| Money line | "Every Business mile adds 55p, up to 10,000 miles, then 25p" (24p motorbike) | "Your employer pays X p. If it's under 55p, you can claim the rest from HMRC" | No money line | No money line |
| Start Shift | Mentioned after the first trip, when the button appears | Not mentioned | Not mentioned | Not mentioned |
| Mode pill | "Work and Personal keep your two kinds of driving apart" (Both only) | Mentioned | Mentioned | Hidden |

### 0.4 Free vs Pro
The first-run never sells Pro. Everything it teaches is free (recording, sorting, the claim, the Self Assessment wizard). Pro is named once, in the last step or the checklist's Help link: "Pro adds downloads for your return, CSV import and more. You don't need it to start." The existing first Pro moment (the paywall after the 5th trip) stays as it is. Scrandalous drivers with partner Pro see no Pro line at all.

### 0.5 A driver who won't set location to Always
Never a dead end, never nagging:
1. If they land on While Using or Don't Allow, show `a-4-location-not-always`: what it means in one sentence, three steps to change it, **Open Settings**, and a calm alternative, **Use Start Trip only**.
2. "Use Start Trip only" turns Automatic trips off **on purpose** (so the status line says the true thing in grey: "Automatic trips off. Only Start Trip records"), shows how Start Trip and Arrived work, and tells them "Start Trip runs until you tap Arrived" (already the behaviour with Automatic trips off since 10 Oct).
3. Neither choice is asked again by the tutorial. The existing pop-up rules, the status line and the server's `capture_lapsed` push carry on as today.
4. Copy never uses fear or money ("£11 you cannot claim back") on day 0. Today's primer does; the tutorial won't.

### 0.6 Skip and replay
- **Skip** is on every step except the last. Skipping the permission steps leaves the status line to do its job.
- **Replay: More > Help > Take the tour**, at the top of Help (`c-3-help-take-the-tour`), replacing the broken "Replay the Quick Start". The replay shows the teaching steps only. Permission steps appear only if something is still missing, and then show live state, not a fresh ask.
- **The Quick Start modal and its stale copy are deleted** in the same release.

### 0.7 Events (one small helper, `lib/events/tutorial.ts`, posting `/user/event`)
| Event | Metadata | Answers |
|---|---|---|
| `tutorial.started` | `{direction, source: auto/help/whats_new, cohort: new/existing}` | How many start |
| `tutorial.step` | `{stepId, index, ms}` | Where they slow down |
| `tutorial.skipped` | `{stepId, index}` | Where they leave |
| `tutorial.completed` | `{ms, tier, driveFor, autoTrips}` | How many finish, and with what |
| `tutorial.drive_for` | `{answer, vehicle}` | How the fleet really splits |
| `tutorial.location_result` | `{before, after, choice: allow/settings/start_trip_only/skip}` | **The permission hole, directly** |
| `whats_new.shown` / `.dismissed` / `.tour` | `{version}` | Existing drivers |

Plus the existing `loc_primer.*`, `home.tap`, `first_trip_add_past` and screen views. Read-outs for Anthony at 7 and 14 days: the four targets above, and **first-week automatic trips per new driver**, split by `tutorial.location_result.after`.

### 0.8 OTA safety
JS only. Location and notification requests use `expo-location` and `expo-notifications`, already in the binary. Opening iOS Settings uses `Linking.openSettings()`, already used. No new native module, no new permission string (the Info.plist wording is unchanged). The tutorial is a **full-screen Stack route**, not a modal over Home (build 67 froze on exactly that), and anything shown on Home goes through `requestPromptSlot()`.

Build size: about 20 to 40 KB of JS, depending on direction. No images beyond vector shapes drawn in code; no Lottie, no video.

### 0.9 Accessibility
- Every step is a normal screen: VoiceOver reads the title first, then the body, then the buttons. The step dots read "Step 2 of 5".
- Buttons are 56 pt high, links at least 44 pt. Text uses the theme's `fontScaleCap` values and the screen scrolls at the largest text sizes, with the main button pinned at the bottom.
- No information by colour alone: ticks have a shape, and status words say "on", "off", "not set".
- Respect Reduce Motion: no slide animations between steps, a cross-fade instead.
- Coach marks (direction B) are the hard part: the dim layer needs `accessibilityViewIsModal`, focus has to move to the bubble, and the highlighted element must still be operable. This is a large part of B's cost.

---

## 1. Direction A: "Set up and go" (a short guided first run)

**Point of view:** day 0 is the only time a new driver is sure to read anything, and the one thing that decides whether MileClear works for them, location, can only be asked by us. So do the setup properly, once, as five calm screens straight after sign-up, and end with a working phone and a test the driver can see.

**Trigger:** right after Verify (or Skip for now) for a new account. Not shown again once completed or skipped. Replay from Help.

| # | Screen (mockup) | Copy (main lines) | Buttons | Notes |
|---|---|---|---|---|
| 1 | How it works (`a-1-how-it-works`) | **"MileClear records your drives by itself."** "You don't need to open the app or press anything. Drive as normal and each trip appears on Home when you stop." Ticks: "Leave your phone in your pocket or cradle. It works with the app closed." / "A stop of 4 minutes or more ends a trip. A shop stop gives you two trips. Nothing is lost." / "You sort each trip. Business or Personal, one tap." | Next · Skip | Teaches the split rule on day 0 in one line (AUDIT 4.5) |
| 2 | You drive for (`a-2-you-drive-for`) | **"What do you drive for?"** "We set up the app around your answer. You can change it later in Settings." Five answers + Car or van / Motorbike | Next | Employer: one more line for the rate ("Not sure" allowed) |
| 3 | Location (`a-3-location`) | **"One setting makes it work."** "To record drives while the app is closed, MileClear needs your location set to Always." Box: "Your iPhone will ask twice. 1 First, tap Allow While Using. 2 Later, tap Change to Always Allow. This one is what lets trips record with the app closed." "We only use your location to measure drives. We never sell it. Read how we use it." | **Allow location** · "I'd rather add trips myself" | Android: "Allow all the time" and the Physical activity ask on the same screen |
| 3b | Not Always (`a-4-location-not-always`) | **"Location is on While Using."** "MileClear can only record while the app is open on your screen. Most drives will be missed." Steps: Open Settings / Tap Location / Choose Always. Box: "Prefer to add trips yourself? Use Start Trip before each drive, or add past trips by hand. You can switch later." | **Open Settings** · Use Start Trip only | Only when step 3 didn't end on Always. Returning from Settings re-checks and moves on by itself |
| 4 | Check (`a-5-check`) | **"Let's check it's working."** "We test your phone now, not later." Live rows: Location: Always / Motion and fitness / Background App Refresh / Notifications (with Allow). Then: "What you'll see on Home", the real status line, "This line at the top of Home is your check. Green: all good. Red: tap it and we'll fix it." | Next | Rows read the phone live, same rules as Settings check-up. Notifications asked here, once, with its reason |
| 5 | Your app (`a-6-your-app`) | **"Your app in four places."** "Set up for: deliveries and gig work." Home / Trips / Tax / More, one line each, worded per driver type (0.3). Box: "Your first job. Go for a drive. When you stop, open MileClear and tap Business or Personal on your trip. That's it." | **Go to Home** · "Replay any time: More > Help > Take the tour" | |
| after | Home (`a-7-home-after`) | Normal new-driver Home: green status line, "Your first trip", one Start Trip | | Nothing extra on Home. The setup sheet behind "Finish setting up" catches anything left |

**Existing drivers:** `a-8-whats-new-existing`, one sheet, three lines (the status line, sorting on Home, the Settings check-up), "Got it" or "Take the full tour".

**Refuses Always:** 3b, then either Settings or "Use Start Trip only". Either way step 4 shows the honest state ("Location: While Using. Only Start Trip records") and the driver carries on.

**Time to finish:** about 60 to 90 seconds, including the iPhone prompts.

**Good:**
- Aims straight at the measured loss: the 17% never asked, and the While Using drivers who never knew there was a second step.
- Fixes the wrong-driver-type default for every new account.
- The driver sees the result (step 4), so the status line means something from day 1.
- One route, one place in the code, easy to test: 5 screens x 5 driver types, 3 permission outcomes.

**Weak:**
- It's the biggest moment of friction we add: five screens before Home. Mitigation: Skip on every step, and nothing on these screens is marketing.
- It can't teach things the driver hasn't met yet (split trips, missed trips, the claim growing). Those are just words on day 0.
- If the driver skips, we're back to today's Home pop-up.

**Risks:** the permission pop-up appearing over our screen confuses some drivers (the box on step 3 is there for that). Apple Review sometimes objects to "pre-permission" screens that push too hard; "I'd rather add trips myself" is the honest exit that keeps us inside the guidelines.

**Build:** medium, about 4 to 5 days. A new route with 5 steps, reusing `requestOrFixBackgroundLocation`, the Settings check rules and `driveFor.ts`. What's new sheet: half a day. Help replay: half a day. About 25 KB JS.

---

## 2. Direction B: "Show me when I get there" (coach marks)

**Point of view:** people don't read tours, they learn a screen when they're on it. So say nothing up front, and the first time each screen is opened (or something first happens), dim the screen, light up one thing and say one sentence about it.

**Trigger:** the first time each screen is opened, or the first time an event happens, at most one coach-mark set per app open, through the prompt gate.

| # | Where / when (mockup) | Lit up | Copy | Steps |
|---|---|---|---|---|
| 1 | Home, first open (`b-1-home-status`) | Status line | **"Your recording check."** "Green means MileClear will record your next drive by itself. If this turns red, tap it and we'll show you the fix." | 1 of 3; then Start Trip ("Starts a trip now, if you'd rather not wait for 15 mph"), then the mode pill (Both drivers) |
| 1r | Home, first open, location refused (`b-5-home-not-always`) | Red status line | **"Your drives won't record yet."** "MileClear can't see your drives until location is set to Always. Tap Fix and we'll take you to the right switch. It takes about 20 seconds." | Only this one; the rest wait until the line isn't red |
| 2 | Home, first trip lands (`b-2-home-first-trip`) | Last trip card | **"Your first trip is in."** "Tap Business if it was for work. Only Business trips count towards your mileage claim. You can change it later." | 1 of 2; then the hero claim |
| 3 | Trips, first open after a split (`b-3-trips-split`) | Two trips side by side | **"A stop starts a new trip."** "Stop somewhere for 4 minutes or more and the next drive is a new trip, so a shop stop gives you two. Nothing is lost. To join them, open one, tap More, Merge." | 2 of 3 on Trips (others: "Missing a trip you made?", Inbox) |
| 4 | Tax, first open (`b-4-tax`) | Claim card | **"This is your claim."** "Every Business mile adds 55p, up to 10,000 miles this tax year, then 25p. It goes on your Self Assessment. We don't send anything to HMRC for you." | 1 of 1, worded per driver type |
| 5 | Insights, Settings, More | One each | e.g. Settings: "These four ticks say if anything needs you." | 1 each |

"You drive for" is asked as Home's **first** coach mark for a new account: a sheet with the five answers before mark 1. (B has no other early moment to ask it.)

**Existing drivers:** marks are keyed per screen, and existing accounts are marked as having seen them all, except a short three-mark set on Home that doubles as "What's new".

**Refuses Always:** mark 1r replaces the Home set while the line is red. If they skip, it isn't shown again; the red line stays.

**Good:**
- Teaches split trips, the first sort and the claim **at the moment they matter**, which day-0 words can't do. Mark 3 goes straight at 14% of missing-trip reports.
- No upfront friction at all.
- Each mark is small and can be changed on its own.

**Weak:**
- **Doesn't solve the main problem.** Location is still asked by today's Home pop-up, on the first open, competing with coach mark 1 for the same moment. Mark 1r points at the fix, but the driver who taps Skip is exactly today's driver.
- The coach-mark layer is the riskiest thing to build: a spotlight that measures on-screen positions across 5 tabs, large text, iPad and two platforms, plus VoiceOver focus handling. It's the kind of overlay that froze build 67.
- Spread over days and screens, so it's hard to say whether a driver "finished".
- Marks pointing at things that move (Home's door rows change by driver and day) break quietly.

**Build:** large, about 7 to 9 days. A spotlight component (measure, mask, bubble, focus), per-screen registrations, event triggers (first trip, first split), seen-flags per account. About 40 KB JS.

---

## 3. Direction C: "Getting started" (a checklist on Home, with Show me)

**Point of view:** new drivers do the setup over their first few days, not in one sitting. Give them a short to-do list on Home that ticks itself as they go, where every item has a "Show me", and keep a replayable tour in Help for anyone who wants it all at once.

**Trigger:** shown on Home for new accounts in the hero's place (a new driver has no claim to show yet), until all six are done or 14 days pass. It replaces the "Finish setting up" status for those drivers.

| # | Item (`c-1-home-getting-started`) | Ticks itself when | Show me |
|---|---|---|---|
| 1 | Tell us what you drive for | Answer saved | The five answers, in a sheet |
| 2 | Set location to Always | Phone reads Always | A sheet like `a-3-location`, then the iPhone prompts |
| 3 | Go for a drive | First automatic trip saved | "It records by itself at 15 mph" + the status line |
| 4 | Sort your first trip | First trip marked Business or Personal | `c-2-show-me-sort`: a drawn trip card, "Where / Unsure? / Changed your mind?" |
| 5 | See your mileage claim (work) or See your week (just me) | Tax or Insights opened | Opens the tab, one line on what it shows |
| 6 | Add your car | Vehicle saved | Opens the vehicle form (DVLA lookup) |

Order adapts: a "just me" driver gets "See your week" at 5; a company-car driver gets "See your mileage log". When all six are done, the card shows once as "You're all set up" (`c-4-home-all-done`) and leaves. The X on the card hides it (asks "Hide Getting started? You can find it in Help").

**Replay:** Help opens with "Take the tour" and the checklist's progress (`c-3-help-take-the-tour`), followed by the questions new drivers actually ask: "How does MileClear spot a drive?", "Why is one drive two trips?", "I missed a trip. What do I do?", "Start Trip or automatic trips?", "Work mode vs Personal mode?", "What does Pro add?", then EmSee.

**Existing drivers:** never get the card. They get the same What's new sheet as A.

**Refuses Always:** item 2 stays open, and the card says what that means ("Until this is done, only Start Trip records"). If location is refused outright (tier none) the status line is red and takes the top; the card waits below.

**Good:**
- Fits how people really set up: some on day 0, the rest after their first drive.
- Each item ends in a real action, and it ticks itself, so progress is honest.
- It's the same idea as the web's "Get set up" card, so the two match.
- No friction before Home.

**Weak:**
- **A big card on Home**, against decision 8 ("one ask at a time, slim row") and the calm list. It's in the hero's slot for 1 to 14 days, so it's only on screen while there's no hero, but it's still the biggest thing a new driver sees.
- The location ask still depends on the driver tapping "Show me". It's better placed than today's pop-up but still optional-looking: amber to-do, not "this is why nothing records".
- Two lists: the status line's "Finish setting up" and this card overlap; one has to go for new drivers.

**Build:** medium, about 4 to 6 days. Card, six item rules (most already exist as checks), four Show me sheets, Help rework. About 25 KB JS.

---

## 4. Side by side

| | A: Set up and go | B: Coach marks | C: Getting started |
|---|---|---|---|
| Fixes "never asked for Always" | **Strongly** (asked on a dedicated screen, explained, tested) | Weakly (today's pop-up + a pointer) | Partly (behind "Show me") |
| Fixes "everyone starts as gig" | Yes, step 2 | Yes, first sheet | Yes, item 1 |
| Teaches split trips when it happens | No (one line on day 0) | **Yes** | No (Help topic) |
| Friction before Home | 5 screens, about 75 s | None | None |
| Fits the 10 Oct Home decisions | Yes, nothing new on Home | Yes | Strains decision 8 |
| Existing drivers | What's new sheet | 3 marks | What's new sheet |
| Build risk | Low | **High** (overlay, focus, layout) | Low to medium |
| Build time | 4 to 5 days | 7 to 9 days | 4 to 6 days |
| Easy to measure "finished" | Yes | No | Yes |

---

## 5. Recommendation: A, with two things borrowed

**Direction A, "Set up and go",** because the measured loss is at the very start: 17% of new drivers never asked for Always, and drivers without automatic trips are all gone by day 3. A is the only direction that puts a clear, tested location ask in front of every new driver, and it also fixes the "everyone is a gig driver" default. It adds nothing to the new Home, it's the cheapest to build and test, and it's simple to measure.

Borrow two things:
1. **From B: two "just in time" notes, not a coach-mark system.** A one-time card the first time a trip is split ("A stop starts a new trip... To join them, open one, tap More, Merge", shown on the trip summary of the later piece), and the first time a trip lands on Home ("Tap Business if it was for work"). These go in places that already exist (the trip summary notices and the Last trip card), so there's no spotlight overlay to build. That covers the 14% split-trip reports at the moment they happen.
2. **From C: the Help page.** "Take the tour" at the top of Help, then the six questions new drivers really ask, then EmSee (`c-3-help-take-the-tour`). Rewrite the "first-trip" help topic so step 1 is location.

And retire what's broken: the Quick Start modal, the dead Play button, the unreachable `onboarding.tsx` (its `updateProfile` and vehicle code is reused, the rest deleted).

---

## 6. Decisions for Anthony

- **A. Which direction?** Recommended: **A, "Set up and go"**: five short screens after sign-up, ending with location on Always and a check you can see. Plus the two just-in-time notes from B and the Help page from C.
- **B. Should new drivers be asked "What do you drive for?" during setup?** (Today nobody is, so everyone starts as a delivery driver.) Recommended: **yes**, with Car or van / Motorbike on the same screen.
- **C. Should the tutorial ask for location itself, before Home,** instead of today's pop-up on Home? Recommended: **yes.** The Home pop-up stays for drivers who skip.
- **D. If a driver won't choose Always, should we offer "Use Start Trip only"** (Automatic trips off on purpose, so the app says the true thing)? Recommended: **yes.** It's honest, it stops the "every trip by hand without knowing why" case, and they can switch back in the Recording sheet.
- **E. Existing drivers: one "What's new" sheet, once, never the full tour?** Recommended: **yes.** Skipped for drivers whose location isn't on Always (they already get the location pop-up).
- **F. Skip on every step?** Recommended: **yes,** except the last screen, which is already the way out.
- **G. Replay from More > Help > "Take the tour"** at the top of Help, replacing the broken "Replay the Quick Start"? Recommended: **yes.**
- **H. Delete the old Quick Start cards and the unused 7-step onboarding?** Recommended: **yes.** The Quick Start copy says Pro submits to HMRC, which isn't true.
- **I. Ask for notifications inside the tutorial** (step 4), with the reason "so we can tell you a trip is saved", instead of after the first trip? Recommended: **yes,** once; the after-trip Alert then only shows to drivers who skipped.
- **J. Should the tutorial mention Pro?** Recommended: **one line on the last screen**, "You don't need it to start." No paywall in the tutorial.
- **K. Settings > Recording says stops longer than "End a trip after" (30 minutes) split trips, but a stop of 4 minutes or more at a place also splits them.** Should the hint be reworded to match what drivers see? Recommended: **yes**, in the same release: "A stop of 4 minutes or more somewhere usually starts a new trip. Shorter stops, like traffic, stay in one."
- **L. Release:** one OTA, after the Home/Tax/Insights release has been out a few days, so the tour teaches screens people already have. Recommended: **yes,** iOS and Android together, with the 7 and 14-day read-outs in 0.7.
