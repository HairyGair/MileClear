# First-run tutorial: audit (11 Oct 2026)

Branch `tutorial-design`, from main `a7199073` (Home, Settings, Tax and Insights redesigns merged, not all of them released by OTA yet). Audit only, nothing changed in the app.

What we looked at: the code path from install to first trip in `apps/mobile`, the web dashboard's first-visit tour in `apps/web`, the help topics and EmSee, and the measurements already on file (the activation-permission note of 18 Aug, updated 1 Oct and 3 Sep; `docs/missing-trips-oct2026/ANALYSIS.md` of 10 Oct; the support cases answered on 10 Oct). No new production reads were made: production reads from this machine are blocked, and the existing figures are recent enough.

No simulator screenshots of today's onboarding: there isn't a reachable onboarding to screenshot (section 1), and the demo account must not be signed out.

---

## The short version

1. **A new driver gets no onboarding at all.** Sign up, verify (or "Skip for now") and you land on Home. Nobody asks what you drive for, what you drive, or for location. The old 7-step onboarding (`app/onboarding.tsx`, 2,048 lines) and the 5-card Quick Start were both switched off on 21 May after fresh installs froze on build 67, and they have stayed off.
2. **So every new driver starts as a gig driver in Work mode.** The account defaults are `workType "gig"`, `dashboardMode "both"` and app mode `work`. An employee, a company-car driver or someone tracking their own driving sees a gig driver's app (claim at 55p, Start Shift, Tax tab) until they find "You drive for" in Settings, which nothing points them to.
3. **Location is asked for by a pop-up on Home, once.** It is the only thing that turns a download into a driver whose trips record. The figures say this is where new drivers are lost (section 4): 17% of new sign-ups were never asked for background location, and only 29% of those ever got an automatic trip, against 81% of drivers with Always. Of new drivers who get automatic trips, 89% are still logging after day 2. Of those who don't, none are.
4. **The two ways to replay a tour are broken.** The Help screen's "Replay the Quick Start" Play button clears a flag and goes to Home, and nothing then shows the tour. The Quick Start's own copy is out of date and partly wrong ("Tag it Work or Personal", "Submit straight to HMRC", "MileClear Pro does this for you", "Tap your avatar any time for Help & Tutorials").
5. **Nothing explains the three things drivers write in about**: why one drive came back as two trips, why nothing records when Automatic trips is off or location is on While Using, and what to do about a missed trip. The help topic for new drivers ("I just installed the app, what should I do first?") lists five steps and none of them is location.
6. **The web dashboard already has a good first-visit tour** (custom, 7 steps, skip and replay, three events). It is the house pattern to copy for wording, storage and measurement, not for mechanics.

---

## 1. Install to Home, step by step (today)

| # | Screen | What the driver sees | File |
|---|---|---|---|
| 1 | Login | Apple (iOS) or Google (Android) sign-in, or email | `app/(auth)/login.tsx` |
| 2 | Register, "Get started" | Email, Display name, Password, Confirm, "Invite code (optional)", **Create account** | `app/(auth)/register.tsx` |
| 3 | Verify, "Check your email" | 6-digit code, **Verify**, or **Skip for now** | `app/(auth)/verify.tsx` |
| 4 | Root gate | Reads `tracking_state.onboarding_complete`. If it is missing it **writes 'true'** and carries on. Onboarding only shows if SQLite throws. A 15-second watchdog also forces "complete" | `app/_layout.tsx` L236-306 |
| 5 | Quick Start | Not shown. Auto-fire disabled 21 May (build 67 freeze, modal on modal). The flag `quick_start_shown` is written eagerly so it can never fire later | `app/_layout.tsx` L279-298, `components/QuickStartModal.tsx` |
| 6 | Home | The new Home (10 Oct): header with Work/Personal pill, status line, "Your first trip" card, Start Trip, door rows, one ask | `components/home/HomeIdle.tsx` |
| 7 | Location pop-up | After a 3-second settle, the prompt gate offers one pop-up per app open: location primer first, then the Work mode explainer, then saved places, then rating | `app/(tabs)/dashboard.tsx` L941-961, `lib/promptGate/rule.ts` |

**What a brand-new driver has been told by the time they reach Home:** nothing about how recording works, nothing about Business vs Personal, nothing about the tabs. The only teaching on screen is the "Your first trip" card: "Just drive. MileClear starts recording when you pass 15 mph." with a link "Add a past trip".

### The dead onboarding, for reference
`app/onboarding.tsx` (7 steps) asked the right questions and is worth mining for parts, not reviving whole:
- Steps 1-2 were marketing ("Are you losing money every time you drive?").
- Step 3 asked Work / Personal / Both, gig / employee / both, the employer's rate, and car / van / motorbike.
- Step 4, "Never miss a mile", asked for location (While Using vs Always).
- Step 5 asked for notifications and a reminder time. Step 6 was a weekly goal. Step 7 was "You're all set!" with "Just drive / Tap to classify / Watch your mileage claim grow".
- It wrote `userIntent`, `workType` and the employer rate, and **created a placeholder vehicle "My Car (edit details)"**.

It predates the 10 Oct redesign, so its copy describes an app that no longer exists. It has no "company car" or "just me" answer, and it logs no events.

### The question nobody is asked
"You drive for" now lives in Settings > You and your car (`app/settings/work-tax.tsx`, options from `packages/shared/src/utils/driveFor.ts`):

| Answer | Hint | What changes |
|---|---|---|
| Deliveries or gig work | Uber, Deliveroo, Just Eat, Amazon Flex and the like | Default. Claim at 55p, Start Shift, earnings |
| An employer, in my own car | | Relief at the employer's rate, invite your manager |
| Gig work and an employer | | Both |
| A company car | | Mileage log for the employer, no claim, never Pro (recs-oct10, unmerged) |
| Just me, not for work | Everyday driving, no tax or work reminders | Personal mode, no Tax tab, Insights instead |

It decides the tabs, the Home hero, the Tax wording and the reminders. Today it is set by default to the first answer for everyone.

---

## 2. Permission asks (today)

| Permission | When it's asked | Copy | If refused | Events |
|---|---|---|---|---|
| **Location, never asked** (tier none) | Home pop-up, first open, once (`loc_primer_seen`) | "Never miss a mile. MileClear is not recording your trips yet... A forgotten 20-mile trip is about **£11** you cannot claim back." Buttons: Turn on location / Not now | Status line goes **red**: "Location is off. Trips aren't recording" + Fix | `loc_primer.shown {source,tier}`, `.accepted`, `.result {tier}`, `.dismissed {method}` |
| **Location, While Using** (tier foreground) | Same pop-up with While Using wording, once (`loc_primer_foreground_seen`, re-armed if Always is later lost). Skipped if Automatic trips is off | "Record drives automatically. Right now MileClear can only record while it is open on screen..." | **Amber**, not red: "Finish setting up · 1 of 3 done" | as above |
| Location after a capture | After a trip saved through the trip form, foreground tier only, max 3 times, 7 days apart | "Make it automatic? That's X miles in the log..." | Nothing | `activation.always_after_capture_*` |
| Motion & Fitness | iOS: silently, inside the location request when a shift starts. Android: second card of the primer | Android: "One more, and you are set" | Checklist row | `motion_primer.*`, `motion_permission.result` |
| Notifications | Checklist row on Home; a one-time Alert after the first trip saved through the form ("Stay on track") | "Get streak reminders, weekly summaries, and trip detection alerts?" | Settings check "Notifications aren't turned on yet" | none specific |
| Background App Refresh | Never asked (iOS cannot ask); detected | Red: "Background App Refresh is off. Trips aren't recording" + Fix | Red status | |
| Android battery | Checklist row with maker-specific steps | "Set MileClear's battery use to Unrestricted" | Checklist | `battery_opt_nudge.*` |

The iOS sequence itself is in `lib/permissions/location.ts` (L52-87): ask While Using, then ask Always, then an Alert with Settings steps if it still isn't Always. iOS often shows Always as a **later, separate** prompt ("Change to Always Allow"), which drivers don't expect and often refuse.

### Where the asks miss people
- **One pop-up, one chance.** After "Not now", a never-asked driver gets a red status line (good). A While Using driver gets an amber "Finish setting up" line that looks like an optional to-do, while in practice they record only with the app open. **Severity is judged by permission tier, not by outcome** (18 Aug note), and that is still true on the new Home.
- **The prompt gate allows one pop-up per open.** The location primer and the Work explainer compete for the first open, so a new driver who dismisses one gets the other next time.
- **The after-capture prompt needs a capture.** A driver capturing nothing never sees it.
- **Notifications are asked after a trip saved through the form.** A driver whose first trip is automatic and who never opens the trip form doesn't get that Alert.

---

## 3. What else teaches the app today

| Thing | Where | State |
|---|---|---|
| Quick Start (5 cards) | `components/QuickStartModal.tsx` | **Dead.** Mounted, never shown. Copy is stale and makes claims we no longer make (HMRC submission by Pro) |
| Help "Replay the Quick Start" + Play | `app/help.tsx` L31-84 | **Broken.** Deletes `quick_start_shown`, goes to Home, nothing appears |
| Work mode explainer, "Who is Work mode for?" | Dashboard L1659-1718; reopened from the Recording sheet | Works, first visit to Work mode. `work_explainer.shown {source}`, `.dismissed {method,dwellMs}` |
| Home status line | `lib/home/statusLine.ts`, `components/home/StatusLine.tsx` | Works. Nine states, one at a time. "Finish setting up · N of M done" opens the setup checklist (Always, Motion, Notifications, Android battery; **iOS shows "of 3"**). Its X snoozes everything for 7 days |
| "Your first trip" card | `components/home/LastTripCard.tsx` L223-252 | Works. "Just drive. MileClear starts recording when you pass 15 mph." + "Add a past trip" (`first_trip_add_past`) |
| Settings check-up | `app/settings/index.tsx` "IS MILECLEAR WORKING?" | Works. Recording / Last trip / Notifications / Uploads in Home's words |
| Empty states | Trips: "No trips yet. Drives record by themselves once you set off. You can also add one by hand." Tax: "Nothing to claim yet. Mark work trips as Business and your mileage builds up here." Insights: "Your insights start with your first trip... How trips are recorded" | Good, plain, consistent |
| Help topics | `lib/help/topics.ts`, about 75 topics in 8 groups | Getting started has 9. **"first-trip" never mentions location**, sends people to "More → Vehicles" and to Discord. There is a "trip-merge" topic but no "why is one drive two trips?" |
| ContextualHelp (i) sheets | `components/ContextualHelp.tsx` | Used by Settings rows and the accountant screen |
| EmSee | `app/assistant.tsx`, server knowledge in `apps/api/src/services/assistantHelp.ts` | Works. Opened from More > Tools when available. Free drivers can ask about the app; their own figures are Pro |
| Coach marks, tooltips, spotlight | | **None on mobile** |

### The web dashboard tour (reference)
`apps/web/src/components/dashboard/tour/` (custom, no library) with `src/lib/dashboard/tour.ts`:
- 7 steps pinned to `data-tour` targets (hero, setup card, nav Trips, nav Tax/Insights, nav More, mode toggle, avatar). The words change with the driver ("Your business miles" / "Your driving at a glance" / "A couple of things first").
- **Existing accounts get a different opening** ("Your dashboard has a new look") from new ones ("Welcome to MileClear on the web"), split on account creation time.
- Auto-starts at most twice, only on `/dashboard`. Replay from Help ("Take the tour again") or the avatar menu, via `?tour=1`.
- Stored per user in localStorage (`mc_web_tour_v1:<userId>`, state done / skipped).
- Events `web_tour.started`, `web_tour.completed`, `web_tour.skipped {atStep, stepId}`.
- The web setup card "Get set up" has 3 items: Add your vehicle / Install the app and record a first trip / Tell us how you work.

This is the pattern to match on mobile for: per-driver wording, a separate opening for existing users, an auto-start cap, a replay from Help, and the three events.

---

## 4. Where new drivers get lost (the evidence)

### 4.1 Location is the whole game
From the activation note (measured 18 Aug, re-measured 3 Sep and 1 Oct):
- **1 Oct, 287 sign-ups in 14 days:** 77% Always, **17% never asked for background**, 4% denied.
- Never asked → **29%** ever got an automatic trip. Always → **81%**.
- **89%** of new drivers with automatic trips still log after day 2; **0%** of those without.
- **96%** of new drivers' trips are automatic. Automatic recording is what people came for, so the drop is in not asking, not in the product.
- Of the 49 never asked, 34 were on While Using and the explainer did not fire for them at that time (fixed 1 Oct by OTA).
- **10 Oct (missing-trips analysis), 980 active phones:** Always 83%, While Using 13%, denied 4%. Automatic trips off 13%. **Not Always or automatic off: 27%.** After the 3 Sep correction for drivers who capture anyway on While Using, "cannot capture" was 12.5% of the fleet.
- **Lost Always (1 Oct):** 77 drivers had Always and lost it, mostly iOS's own periodic "keep allowing?" reminder turning it into While Using. The tutorial cannot prevent this. It can teach what the red line means.

### 4.2 Missing-trip reports (10 Sep to 10 Oct, 56 cases)
- 64% were the phone not handing over a drive (silent, stopped, late). A tutorial cannot fix these, and must not promise "every drive".
- **14%: split or mislabelled, not lost.** One drive in 1.4 to 2 mile pieces, or a manual trip typed over a recorded one.
- **16%: permission not Always or Automatic trips off.**
- **14 of 56 cases came from accounts under 3 days old.** Most of those did record trips, so "the new-account effect is mostly about setup, not capture" (ANALYSIS.md 4.6).

### 4.3 Cases answered on 10 Oct (first names and short ids only)
- **Alex (4a75e33a), gig, free, joined 24 Aug:** background location never granted in 7 weeks. **Every trip added by hand**, including the one he reported missing. Two more hand-added trips on Saturday evening, after our follow-up. He has never been shown, in words he acted on, that one switch would end the typing.
- **Kirsty (7e79930a):** lost Always around 1 Oct, tapped "Not now" on 9 Oct, added two 165-mile drives by hand, re-granted on 10 Oct. Background App Refresh is off too.
- **Shaun (b6cd6c5e):** typed a 125-mile manual trip over a recorded 16.3-mile one. He didn't know the recorded trip was there or how the two relate.
- **Gurmail (df0a037d):** added three manual trips that sit inside or duplicate automatic ones, because the automatic ones were in pieces or started late. He did not recognise split trips as his drive.
- **Louise (fa7feb0b):** phone silent for a whole day, then self-added. A capture fault, not a teaching problem, but she needed to know the "Missing a trip you made?" path, and she found it.
- **Turret Group (b22982c7):** recording paused from Tuesday to Saturday. The Pause control is now behind the status line, which says "Paused until..." with Resume.

### 4.4 What this means for a tutorial
| Problem | Share / size | Can a tutorial help? |
|---|---|---|
| Never asked for, or refused, Always | 17% of new sign-ups; 12.5% of the fleet can't capture | **Yes, most.** Ask at the right moment, explain the iPhone's two-step prompt, test it, explain the red line |
| Wrong driver type (everyone starts as gig) | Every new non-gig driver | **Yes.** One question, asked once |
| Automatic trips off, every trip added by hand | 13% of the fleet off; Alex | **Partly.** Say plainly what off means and how to turn it back on |
| Split trips not recognised | 14% of missing-trip reports | **Yes, at the moment it happens** (first split trip), not on day 0 when it means nothing |
| Manual trips over recorded ones | Shaun, Gurmail | **Partly.** Teach "check Trips before adding one" and the missing-trip path |
| Lost Always later (iOS reminder) | 77 drivers by 1 Oct | **A little.** Teach the red line once; Home does the rest |
| Phone silent or late | 64% of missing-trip reports | **No.** Don't over-promise in the copy |

### 4.5 Smaller findings
- **Start Shift needs a first trip.** On the new Home, Start Shift shows for gig and Both drivers in Work mode only after at least one trip, so a new driver sees one Start Trip. A tour that mentions Start Shift on day 0 would point at nothing.
- **Two rules split trips, and the app explains one.** Settings > Recording says "End a trip after [30 minutes by default]: Stops longer than this split your trips; shorter ones stay as one." The server also splits a recording at any visit of **4 minutes or more** (`AUTO_SPLIT_MIN_DWELL_SEC = 240`, since 27 Aug). A driver reading the setting would expect a 10-minute shop stop to stay one trip; it becomes two. The tutorial copy has to describe what drivers actually see ("a stop of 4 minutes or more"), and the Settings hint should be checked against it (decision K).
- **Insights only shows in Personal mode;** Work mode has Home, Trips, Tax, More. A tour that says "four tabs" is right in Work mode; Personal mode has five tabs for work drivers and four (no Tax) for "just me".
- **No mobile analytics helper.** Each place posts `/user/event` itself (`trackEvent` in the dashboard, `trackActivationEvent`, `trackHomeTap`). A tutorial needs one small helper (`tutorial.*` events), or it will add a fourth copy.
- **Modal history.** Build 67 froze on a modal over the dashboard's ScrollView (21 May), and modals stacked on 3 Oct. Anything new should be a full-screen route, or a single sheet inside the prompt gate, never a modal stacked on Home's pop-ups.
- **The "first-trip" help topic** recommends Discord and pinning saved places before the driver has driven at all, and never mentions location.
- **Notifications are asked in two places with different words** ("Turn on notifications" on Home, "Stay on track" after a trip).

---

## 5. Constraints any design has to respect

- **10 Oct decisions:** Home is the calm list. One ask at a time, as a slim row, hidden while the status line is red. Setup is a status, not an ask (Home DECISIONS 8). Settings opens with the check-up (Settings A/B). Tax wording per Tax B/D/E: "mileage claim" on Home, "mileage on your tax return" on Tax, never "deduction", no "HMRC-ready" style claims, and **MTD is a test version, nothing is sent to HMRC**.
- **1,500 existing drivers** (about 1,128 active in the last 30 days) must not be put through a new-driver tour.
- **OTA-only:** JS changes only. The permission requests already exist in JS (`expo-location`, `expo-notifications`), so asking from a new screen needs no new native module. Opening iOS Settings uses `Linking.openSettings()`, already in use.
- **Expo Go guards** stay as they are. Expo Go never reports background Always, so the "test it" step can only be checked fully on a device build.
- **Plain English, no em dashes, no adjectives next to HMRC.**
