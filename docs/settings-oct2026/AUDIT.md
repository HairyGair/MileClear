# Settings audit (10 Oct 2026)

Branch `settings-redesign`. Audit only, nothing in the app was changed.

Screenshots: `screens/before/` on the demo account (work type Both, Pro, dark), iPhone 17 simulator, Expo Go. Every screen was opened by link or by tapping a row; no switch was touched and no value was changed. `-2` files are the same screen scrolled down.

- 01 Preferences, exactly as in Anthony's screenshot (title under the clock, no back button)
- 02 Settings hub · 03 Profile (name, email, password): same bug, no header · 04 Preferences opened by link: same bug
- 05 Home screen · 06 What you see · 07 Tracking & Locations · 08 Your tax details · 09 Business Profile
- 10 Security · 11 Notifications · 12 Data & Exports · 13 Community · 14 Help & Feedback · 15 Legal
- 16 old "General" link (lands on Profile, no header) · 17 More tab · 18 Profile tab (avatar)

Note: on 01 the swipe-back gesture also did nothing. The only way out was to close the app. The simulator ran the main checkout (a few commits ahead of this branch); Settings code is the same.

Code: `app/settings/*`, `components/settings/*`, `app/(tabs)/more.tsx`, `app/(tabs)/profile.tsx`, `app/_layout.tsx` (lines 783-795).

---

## 1. Navigation map

### How a driver gets to Settings

| Route in | Where | Notes |
|---|---|---|
| More tab > HELP AND SETTINGS > Settings | Last-but-one group on More | The main way. Hint "Notifications, tracking, work and tax". |
| Avatar (top right, every tab) > Profile > Settings | Profile is a hidden tab, only reached by the avatar or the name card on More | Second way, two taps |
| Profile > "Name, email and password" | Goes straight to Settings > Profile | **Opens with no header and no back button** (see problem 1) |
| Tax tab cards, Mileage Allowance Relief, ReliefCard | Go to "Your tax details" | Fine |
| Road alerts screen | Goes to Notifications | Fine |
| Help answers ("Go there" links) | `/settings/general` and `/settings/auto-classify` | First lands on Profile (wrong screen, no header). **Second screen does not exist** (dead link). |

### Every row on every screen

Driver types: G gig, E employee in own car, C company car, P personal. "All" = everyone.

**Settings hub** (13 rows, one flat list, no status anywhere)

| Row | Hint | Goes to | Pro | Who | Notes |
|---|---|---|---|---|---|
| Invite a friend, get Pro free | A free month of Pro... | Invite Friends | | All | First row of Settings is a marketing ask. Also on More. |
| Home screen | Choose which shortcuts show on Home | Home screen | | All | Fine, but see "appearance" split below |
| What you see | Hide Profile cards you don't use | What you see | | All | **Does nothing** (problem 3) |
| Preferences | Dashboard mode and weekly miles goal | Preferences | | All | **No header** (problem 1); mode setting misleading (problem 2) |
| Tracking & Locations | GPS detection, geofences, classification, schedule | Tracking | | All | Jargon hint ("geofences") |
| Your tax details | Work type, rates, other income | Tax details | | G E | Personal-only drivers see it too |
| Business Profile | Invoice branding: logo, VAT, bank details | Business Profile | | G (invoicers) | Few drivers invoice; sits at the top level |
| Security | Lock the app with Face ID... | Security | | All | One switch behind a row |
| Notifications | "10 of 10 on: trip reminders, Live Activity, +8 more" | Notifications | | All | Counts in-app switches only; says "10 on" even if the phone blocks MileClear notifications |
| Data & Exports | Downloads, sync status, GDPR data export | Data & Exports | | All | "GDPR" is jargon |
| Community | Join the Discord... | Community | | All | Also inside Help & Feedback |
| Help & Feedback | Rate, suggest, contact, FAQ | Help | | All | |
| Legal | Terms of Use, Privacy Policy | Legal | | All | Two links behind a row |

**Profile** (`settings/profile`, **no header**): Display name, Full name (legal), Avatar, Email: all four open the same Edit Profile screen. Change password. Five rows, two real destinations. Log out and Delete account are not here; they are on the Profile tab.

**Preferences** (`settings/preferences`, **no header**): "What MileClear shows you" with Both / Work only / Personal; Goals > Weekly miles goal (Set). Two settings on a whole screen. The weekly goal is also set from the Insights tab and during onboarding.

**Home screen**: intro text; 5 switches (Tax, Insights, Earnings, Badges, Fuel) for the shortcuts under the last trip; "Show all again". Clear and correct after the Home redesign. Could live inside one "Home and display" screen.

**What you see**: 6 switches for Profile cards (Quick Actions, Settings, Work Settings, Notifications, Subscription, My Vehicles), "Reorder Profile cards". Half of these cards no longer exist on the Profile tab, and the Profile tab never reads these switches.

**Tracking & Locations**

| Row | Kind | Who | Notes |
|---|---|---|---|
| Automatic trips | Switch, asks before turning off | All | Also on Home's Recording sheet. Shows the switch, not whether it actually works (location, Background App Refresh) |
| Battery saver | Switch | All | Different thing from the phone's Low Power Mode; name clash |
| End a journey after | Choice (30 minutes) | All | Good plain wording |
| Start Trip runs until I tap Arrived | Switch | All | Long hint (5 lines) |
| (Notifications off warning) | Row, only when the switch above is on and notifications are blocked | All | The only place in Settings that knows notification permission |
| Battery & low-power | Opens Drive Detection | All | **Same screen** as the next row |
| Diagnostics | Opens Drive Detection | All | Technical screen; the only place location permission is shown |
| Saved locations | Saved places | All | Also on More |
| Classification rules | Rules screen | G E | Jargon |
| Work schedule | Work Schedule, **Pro badge** | G E | The schedule is free since 8 May; only auto-classify is Pro. More shows no badge. Also on More. |

**Your tax details** (Both shows everything): Work type (Gig / Employee / Both), Employer mileage rate (E), Mileage Allowance Relief (E, opens a calculator, not a setting), Other annual income, Quarterly updates (test version) (G, Pro badge for free users), Tax basis (G), Your accountant (G), Tax already deducted (E). No choice for company-car drivers or "personal only": a company driver is only recognised by team membership. Vehicle and fuel type are not here, though the tax figures depend on vehicle type.

**Business Profile**: logo, trading name, address, VAT, invoice colour, bank account name, sort code, account number, payment terms, Save. A form, not settings. Belongs with Invoices on More.

**Security**: one switch (app lock), plus Re-lock when on. On the simulator the switch is greyed out ("set up Face ID first").

**Notifications**: 15 switches in 6 groups (Auto-trip, Daily 7, Tax, Weekly 2, Monthly 2, Clean Air Zones). Free drivers get a Pro teaser for 5 of them. **No line saying whether the phone allows MileClear notifications at all.** Group names are timings, not reasons ("Daily" holds fuel, EV, road alerts, streaks, briefings).

**Data & Exports**: Downloads (Pro), Sync status, "Customise dashboard layout" (opens the Profile reorder screen, does nothing, problem 3), Recheck suspicious trips, Export my data.

**Community**: Discord card, Connect Discord, Visit the server. **Help & Feedback**: Community (again), Help & Tutorials, Feedback, Email Support, Rate MileClear (App Store link only, also shown on Android), mileclear.com/support. **Legal**: Terms, Privacy.

**Old "General"**: redirects to Profile. Kept for very old builds and the Help link above.

### Duplicates

| Setting | Places |
|---|---|
| Automatic trips | Settings > Tracking; Home Recording sheet |
| Weekly miles goal | Settings > Preferences; Insights; onboarding |
| Saved places | Settings > Tracking; More |
| Work schedule | Settings > Tracking (Pro badge); More (no badge) |
| Community / Discord | Settings hub; Help & Feedback |
| Invite a friend | Settings hub (top row); More |
| Drive Detection screen | Tracking > Battery & low-power; Tracking > Diagnostics |
| Name / email / avatar | Settings > Profile (4 rows, one screen); Profile tab card |
| Pro status / subscription | Profile tab only; More name card shows a PRO chip |

### Settings that live outside Settings but belong in it (or next to it)

- **Vehicles** (make, fuel type, MPG, primary): More and Profile tab. This drives fuel costs, the cheapest-fuel push and the tax rate (car vs motorbike), yet Settings never mentions it.
- **Subscription / Pro** (plan, renew date, Restore, Manage): Profile tab only.
- **Log out, Delete account**: Profile tab only.
- **Location permission state**: Home status line and the Diagnostics screen only.
- **Work / Personal mode** (the switch itself): Home only.

### Settings that no longer make sense after Home, Tax and Insights

- **Dashboard mode** (Preferences): the Home mode pill ignores it. In the app it changes only the Self Assessment countdown; on the server it changes which pushes are sent. "Work only" does not hide Personal. The words promise something the app does not do.
- **What you see** and **Reorder Profile cards** and **Customise dashboard layout**: the Profile tab was rebuilt and no longer reads these settings. Three rows that do nothing.
- **Weekly miles goal** in Preferences: Insights now owns the goal ("Coming up").
- **"Your tax details"**: still right (decision H), but Quarterly updates and Mileage Allowance Relief are tools, not details; they already have homes on the Tax tab.
- **Home screen** page: correct and current. Keep, but group it.

---

## 2. Problems, ranked by how much they hurt a driver

1. **Two screens open with no header and no back button.** `settings/preferences` and `settings/profile` have no `Stack.Screen` line in `app/_layout.tsx` (the default there is `headerShown: false`). The group label is drawn under the clock, there is no title, and swipe-back does not work. The driver has to close the app. Profile is reached from the Profile tab's most obvious row ("Name, email and password"), so this hits anyone changing their name or email.
2. **"Dashboard mode" says one thing and does another.** "Choose which dashboards are available. The toggle on the dashboard switches between them." is jargon, and it is not true any more: picking "Work only" leaves the Personal pill on Home. It silently changes which notifications the server sends. A driver who picks Personal could stop getting tax reminders without knowing why.
3. **Three rows do nothing.** What you see (6 switches), Reorder Profile cards, and Data & Exports > Customise dashboard layout (whose hint promises "drag to reorder cards") all edit a layout the app no longer reads. A driver switches something off and nothing changes. That costs trust.
4. **The most important thing, "are my trips recording?", is not in Settings.** Tracking shows the Automatic trips switch as on even when location is "While Using" or Background App Refresh is off (25% of active drivers). Location permission is only in Diagnostics, a technical screen. Same contradiction Home had before its redesign.
5. **Notifications can be "10 of 10 on" while the phone blocks them all.** Neither the hub nor the Notifications screen checks phone permission (only a hidden row in Tracking does). A driver who denied the first prompt never gets tax deadline, trip reminder or MOT pushes and Settings tells them all is well.
6. **Vehicle, fuel type and Pro plan aren't in Settings.** These are the settings drivers most often look for ("change my car", "cancel my subscription", "restore purchase"). They live on a hidden Profile tab reached by the avatar.
7. **Dead and wrong links from Help.** "Work mode vs Personal" goes to Profile (wrong screen, no header). "Auto-classify rules" goes to `/settings/auto-classify`, which does not exist.
8. **Near-empty screens and one-row screens.** Preferences (2 settings), Security (1 switch), Legal (2 links), Profile (5 rows, 1 destination), Community (1 card). Each is a tap in and a tap back for very little. The hub is 13 equal rows in one list with no grouping by what a driver is trying to do.
9. **Jargon and inside words.** Dashboard mode, dashboards, geofences, classification rules, GDPR Article 20, Live Activity, Diagnostics, Tax basis/Accruals, "Battery saver" next to the phone's own Low Power Mode, Work Settings, Quick Actions. Group names on Notifications are timings, not reasons.
10. **Wrong Pro badges and odd ordering.** Work schedule shows "Pro" though it is free. The very first row of Settings is "Invite a friend" (an ask, not a setting). Business Profile (invoice form, a few drivers) sits at the same level as Notifications.
11. **Duplicates** (table above), each with slightly different wording, so the driver can't tell if they are the same setting.
12. **No place for company-car drivers or personal-only drivers in Work type.** Only Gig / Employee / Both. A company-car driver is recognised only by team membership; a personal driver still sees "Your tax details".
13. **Rate MileClear on Android opens an App Store link.** Help & Feedback has no Android branch.
14. Minor: the hub's first load in Expo Go showed a red developer error about a missing native module (`nativeLocation.ts`). Expo Go only, not a driver issue, but it is noise when testing.

---

## 3. What "useful" could mean: status, not just switches

Settings should answer "is everything set up right?" before "what can I change?". Each line below uses data the app already has; nothing new from the server.

| Status line (example) | Shows | Source today |
|---|---|---|
| **Recording: Automatic, working ✓** / "Location set to While Using. Fix" / "Background App Refresh off. Fix" / "Paused until 18:00. Resume" | The same answer as Home's status line, with the fix button | `lib/home/statusLine.ts` (`selectStatusLine`), `lib/permissions/location.ts` (`getLocationPermissionStatus`: none / foreground / always), `lib/tracking/automaticTrips.ts`, pause rule |
| **Last trip recorded: 2 h ago, 12.4 mi** | Proof that it works | `lib/home/lastTrip.ts` |
| **Low Power Mode is on: drives may not record** | Only when on | `lowPowerMode` in `lib/dashboardMessages` |
| **Notifications: allowed ✓** / "Blocked on this phone. Fix" | Phone permission first, then "8 of 15 on" | `getNotificationPermissionStatus()` (already used in Tracking) |
| **Uploads: all synced** / "2 trips waiting. Retry" | | `useFailedSyncCount` in `components/home/useHomeSignals` |
| **Your car: Toyota Prius, Hybrid, car rate** | Primary vehicle, fuel type, which mileage rate applies | Vehicles API / local `vehicles` table, `VEHICLE_TYPE_LABELS`, `FUEL_TYPE_LABELS` |
| **You drive for: Gig and employer** · "Employer pays 40p, then 25p" | Work type and employer rate in one line | `user.workType`, employer rate fields (`settings/work-tax`), `isCompanyDriver` |
| **Tax year 2026-27 · 55p a mile for the first 10,000** | Which year and rate the figures use | `getTaxYear`, `getHmrcRatesForTaxYear` (shared) |
| **MileClear Pro: active, renews 3 Nov (App Store)** / "Free plan. See Pro" / "Pro through Scrandalous" | Plan, source, renew date, Restore | `user.isPremium`, billing status `subscriptionPlatform`, `resolvePremiumStatus` sources |
| **App lock: off** | One word on the hub row | `useAppLock` |
| **Signed in as demo@mileclear.com** | Email on the account row | `user.email` |

A natural shape: a short "Is MileClear working?" block at the top of Settings (Recording, Notifications, Uploads, Last trip), then "You and your car" (vehicle, work type, rates, plan), then everything else in fewer, plainer groups. Fix buttons should run the same fixes Home uses, so there is one rule for "working".

---

## 4. Principles for the redesign

1. **Every screen has a header and a back button.** Register every settings route, and add a check (test or lint) that every file in `app/` has a `Stack.Screen` line, so this cannot recur.
2. **Status first.** The top of Settings tells the driver whether recording, notifications and uploads work, with one tap to fix. Same rules and words as Home's status line.
3. **Put the driver's own things in one place:** vehicle and fuel type, work type and rates, plan, account. Settings is where people look for "change my car" and "cancel".
4. **No setting that does nothing.** Remove What you see, Reorder Profile cards, Customise dashboard layout. Either make Dashboard mode do what it says or replace it with a plain question ("Do you drive for work?") that drives the mode pill and the reminders.
5. **One place per setting.** Where a setting also appears elsewhere (Home Recording sheet, Insights goal), it is the same control with the same words, and Settings links to the owner rather than copying it.
6. **Fewer, fuller screens.** Merge one-row screens (Security, Legal, Profile, Preferences, Community) into the groups they belong to. No screen should be mostly empty.
7. **Plain words, said from the driver's side.** "Record my drives by themselves", "Phone lets MileClear send alerts", "Your data", not "Detection", "Diagnostics", "GDPR".
8. **Show only what applies.** Company-car, employee, gig and personal drivers see their own rows; Pro badges only where something is really Pro.
