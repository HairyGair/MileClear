# Settings: proposals (10 Oct 2026)

Follows `AUDIT.md` (problems are referred to as P1 to P14, from its section 2). No code changed. Three directions from three designers, then the fixes every direction includes, then a recommendation and decisions for Anthony. Mockups: `MOCKUPS.md` and `mockups/`.

Anthony's ask: "Go through all of the settings screens and make it useful please. Make sure it's easy to use but also very useful!"

What "useful" means here, in one line: **Settings should first tell a driver whether MileClear is working for them, then let them change their own things (car, work, plan, account) in one place, and nothing on it should do nothing.**

Driver types used below: **G** gig / delivery, **E** employee in their own car, **C** company-car driver, **P** personal only. "Both" drivers (gig and an employer) see the G and E rows together.

Demo values used everywhere (illustrative, no real driver): "Demo", demo@mileclear.com, Toyota Prius hybrid 2022, Pro renewing 3 Nov through the App Store, last trip 2 h ago 12.4 mi, 3 saved places, work hours Mon to Fri 08:00 to 18:00, employer pays 45p.

---

## 0. Parts every direction shares

### 0.1 Status rows (the "is it working?" checks)

Every direction shows the same four checks somewhere at the top. They use the same rules and words as Home's status line (`lib/home/statusLine.ts`), so Home and Settings can never disagree.

| Check | Fine (green tick) | Not fine | Tap | Data today |
|---|---|---|---|---|
| Recording | "Recording automatically" | Red "Trips aren't recording · Fix" (location not Always, Background App Refresh off) · Amber "Paused until 18:00 · Resume" · Grey "Automatic trips off. Only Start Trip records" · Amber "Low Power Mode is on" | Recording screen, or runs the same fix Home runs | `selectStatusLine`, `getLocationPermissionStatus`, `lib/permissions/backgroundRefresh`, pause rule |
| Last trip | "2 h ago · 12.4 mi" | New driver: "No trips yet. Just drive, it starts at 15 mph" (grey, not red) | Trips | `lib/home/lastTrip.ts` |
| Notifications | "Allowed · 12 of 15 on" | Red "Blocked on this phone · Fix" (opens the phone's settings for MileClear) | Notifications screen | `getNotificationPermissionStatus()`, notification prefs |
| Uploads | "All saved to your account" | Red "2 trips waiting to upload · Retry" | Sync status | `useFailedSyncCount` |

Rules: one tick per row (green means done, never "good news"); red only when something is broken; never "on" next to "not recording".

### 0.2 "Your" rows (the driver's own things)

| Row | Shows | Goes to | Data today |
|---|---|---|---|
| Account | Picture, display name, email | Your account (name, full name for exports, picture, email, password, delete account) | `user` |
| Your car | "Toyota Prius · Hybrid · car rate" / amber "Add your car" when none | Vehicles (same screen More uses) | vehicles table, `VEHICLE_TYPE_LABELS`, `FUEL_TYPE_LABELS` |
| You drive for | "Deliveries and an employer" / "An employer · pays 45p" / "A company car" / "Just me" | Your tax details | `user.workType`, employer rate, `isCompanyDriver` |
| Your plan | "Pro · renews 3 Nov (App Store)" / "Pro through Scrandalous" / "Free plan · see what Pro adds" | Your plan (manage, restore, cancel help) | `isPremium`, billing `subscriptionPlatform`, `resolvePremiumStatus` |

---

## 1. Direction A: "Check-up first" (designer 1: one calm page)

**Point of view:** Settings is one page you can scroll top to bottom. It answers three questions in order: *Is MileClear working? Is it set up for me? What can I change?* It does for Settings what the calm list did for Home. Fewer screens (15 become 9), and no screen with only one or two things on it.

### A.1 Settings page (one page, five groups)

| # | Group / row | Shows (live) | Goes to | Who |
|---|---|---|---|---|
| | **Is MileClear working?** (one card, 0.1) | | | |
| 1 | Recording | Green "Recording automatically" or the problem with Fix / Resume | Recording screen (or runs the fix) | All |
| 2 | Last trip | "2 h ago · 12.4 mi" | Trips | All |
| 3 | Notifications | "Allowed · 12 of 15 on" / red "Blocked on this phone · Fix" | Notifications | All |
| 4 | Uploads | "All saved to your account" / "2 trips waiting · Retry" | Sync status | All |
| | **You and your car** | | | |
| 5 | Account | Avatar, "Demo", "demo@mileclear.com" | Your account | All |
| 6 | Your car | "Toyota Prius · Hybrid · car rate" | Vehicles | All |
| 7 | You drive for | "Deliveries and an employer · employer pays 45p" | Your tax details | All (P sees "Just me" and can change it) |
| 8 | Your plan | "Pro · renews 3 Nov" | Your plan | All |
| | **How MileClear works for you** | | | |
| 9 | Recording options | "Ends a trip after 30 min stopped" | Recording screen | All |
| 10 | Notifications | (same screen as row 3; this row is the "change them" door, row 3 is the check) | Notifications | All |
| 11 | Saved places | "3 places: Home, Depot, Office" | Saved places | All |
| 12 | Work hours | "Mon to Fri, 08:00 to 18:00" / "Not set" | Work schedule (free, no Pro badge) | G E (both) |
| 13 | Home screen | "Showing Tax, Insights, Earnings" | Home screen page (unchanged) | All |
| 14 | App lock | Switch, inline. Off / On. "Face ID" named when on | (inline; re-lock choice appears under it when on) | All |
| | **Your records** | | | |
| 15 | Downloads | "Spreadsheet and PDF for 2026-27" (Pro badge for free drivers only) | Exports | All |
| 16 | Your data | "Get a copy of everything we hold about you" | Your data screen (export, recheck odd trips) | All |
| | **Help** | | | |
| 17 | Help and how-tos | | Help | All |
| 18 | Tell us about a problem or idea | | Feedback | All |
| 19 | Email support | "support@mileclear.com" | Mail | All |
| 20 | MileClear community | "Chat with other drivers" | Discord screen | All |
| 21 | Rate MileClear | App Store on iPhone, Play Store on Android | Store | All |
| 22 | Invite a friend, get Pro free | "Up to 3 free months" | Invite | All |
| 23 | Terms and privacy | | Legal (2 rows) | All |
| | Footer: "Log out" (text button), "Version 1.3.13 (94)" | | | |

The first screen (390 x 844) shows the whole check card and the four "You" rows. Everything else is one scroll.

### A.2 Sub-screens

| Screen | Rows | Replaces |
|---|---|---|
| **Recording** | Top: the same status line, then four checks with ticks: Location "Always", Background App Refresh "On", Motion and fitness "Allowed", Low Power Mode "Off" (each with Fix when not). Then: Automatic trips (switch, asks before off) · Pause recording (choices) · End a trip after (30 min) · Start Trip runs until I tap Arrived (switch, 1-line hint) · Save battery when it's low (switch) · Sort trips automatically (Pro, G E) · Check recording in detail (the technical screen) · Not working? Tell us | Tracking & Locations, Drive Detection's two rows, Home's Recording sheet stays as the quick version |
| **Notifications** | Top: "Your phone lets MileClear send notifications ✓" or red "Your phone is blocking MileClear · Open phone settings". Then groups by reason: About your trips · Tax and money · Your car and fuel · Roads · Your progress · Summaries. Pro teaser stays for free drivers | Notifications |
| **Your account** | Picture · Display name · Full name (for your tax records) · Email · Change password · Delete account (red, at the bottom). Each row edits in place (one screen, not four rows to the same form) | Settings > Profile, Edit Profile, Profile tab's top card |
| **Your plan** | Plan and source, renew date · Manage or cancel (App Store / Stripe) · Restore purchase · What Pro adds. Scrandalous: "Pro while you're linked to Scrandalous" | Profile tab Subscription card |
| **Your tax details** | You drive for: Deliveries or gig work / An employer, in my own car / Both / **A company car** / **Just me, not for work** · Employer mileage rate (E) · Other income this year · Tax already taken off your pay (E) · How you count income (G) · Your accountant (G) · Quarterly updates (test version) (G) · Link: "Work out tax back on work miles" (E, opens the Tax tab tool) | Your tax details, Preferences' Dashboard mode |
| **Your data** | Get a copy of everything we hold about you · Check my trips for odd ones (was Recheck suspicious trips) · Delete account link | Data & Exports |
| **Help** | Help and how-tos · Feedback · Email · Community · Rate · Invite · Terms · Privacy | Help & Feedback, Community, Legal |

### A.3 Merged, moved, removed, renamed

| Change | Audit ref |
|---|---|
| **Removed:** What you see, Reorder Profile cards, Customise dashboard layout | P3 |
| **Removed:** Dashboard mode; its job is taken by "You drive for" (adds Company car and Just me) | P2, P12 |
| **Removed from Settings:** Weekly miles goal (Insights owns it) | Audit "no longer makes sense" |
| **Moved out:** Business Profile becomes "Invoice details" at the top of the Invoices screen (More > Money) | P10 |
| **Moved in:** Vehicle, plan, account, log out, delete account (from the hidden Profile tab) | P6 |
| **Merged:** Security (1 switch) into an inline App lock row; Legal and Community into Help; Profile + Edit Profile into Your account; Preferences dissolved; Data & Exports split into Downloads + Your data | P8 |
| **Merged:** Drive Detection's two rows into one "Check recording in detail" | P11 |
| **Renamed:** Tracking & Locations to Recording; Classification rules to Sort trips automatically; Diagnostics to Check recording in detail; Battery saver to Save battery when it's low; Saved locations to Saved places; Work schedule to Work hours; Export my data (GDPR) to Get a copy of your data | P9 |
| **Moved down:** Invite a friend from row 1 to the Help group | P10 |

### A.4 How each driver sees A

| | Working? | You and your car | How it works | Records |
|---|---|---|---|---|
| G gig | 4 checks | Account, car, "Deliveries", plan | All rows incl. Work hours | Downloads, data |
| E employee | 4 checks | "An employer · pays 45p" | Work hours shown | Downloads (Pro), data |
| C company car | 4 checks | "A company car · team: Acme Ltd" (team name from team membership); car row reads "Company car: Ford Transit" | Work hours shown; no Sort automatically (the employer's rules apply) | Downloads relabelled "Your mileage log" |
| P personal | 4 checks | "Just me, not for work" | No Work hours, no Sort automatically | Downloads only |
| Free (any) | same | Plan row "Free plan · see what Pro adds" | Pro badges only on Sort automatically and Downloads | |
| New driver | Last trip "No trips yet" (grey); Your car amber "Add your car" if none | | | |

### A.5 Profile tab and More tab

- **Profile tab (hidden, avatar):** retired. The avatar opens Settings. Its four cards (name, vehicles, subscription, settings link) are rows 5 to 8 of the page. Log out and Delete account come with it.
- **More tab:** "Settings" row stays (hint becomes the live status, e.g. "Recording automatically" or red "Notifications blocked"). The name card at the top of More opens Settings too. Vehicles and Saved places stay on More as shortcuts to the same screens with the same names. Work schedule stays on More as "Work hours", no badge. Invite a friend stays on More.

### A.6 Risks
- The page is long (23 rows). Mitigated by the order (checks first) and groups; the first screen holds what people look for most.
- Two "Notifications" doors (check and change). If testing shows confusion, row 10 goes and row 3 does both.
- Retiring the Profile tab changes where long-time drivers find their car and plan. The avatar still lands on a page with them at the top.

### A.7 Build size
**Medium, about 5 to 7 days.** New: the check card (reuses `selectStatusLine` and existing permission helpers), Your account screen (edits in place), Your plan screen (moves the Profile tab code), Recording screen checks block. The rest is moving and renaming rows plus the shared fixes (section 4).

---

## 2. Direction B: "Five jobs" (designer 2: fewer, task-based screens)

**Point of view:** people open Settings to do one job: fix recording, stop a notification, change their car, sort tax details, or get help. So the hub has **five rows only**, each a big row with a live sentence, and each opens one full screen that holds everything for that job. Nothing else on the hub.

### B.1 Settings page (5 rows)

| # | Row | Live sentence | State colour | Goes to |
|---|---|---|---|---|
| 1 | Recording | "Recording automatically · last trip 2 h ago" / red "Trips aren't recording · Fix" | Green tick / red | Recording |
| 2 | Notifications | "Allowed · 12 of 15 on" / red "Blocked on this phone" | Green / red | Notifications |
| 3 | You, your car and your plan | "Demo · Toyota Prius · Pro until 3 Nov" | None (amber dot if no car) | You |
| 4 | Work and tax | "Deliveries and an employer · employer pays 45p" | None | Work and tax |
| 5 | Help, privacy and your data | "Help, feedback, app lock, terms" | None | Help and privacy |
| | Footer: Log out · Version | | | |

### B.2 Sub-screens

| Screen | Rows |
|---|---|
| **Recording** | Same as A's Recording screen, plus Saved places ("3 places") and Uploads ("All saved") at the bottom |
| **Notifications** | Same as A |
| **You, your car and your plan** | Account (picture, name, email, change, password) · Your car (list of cars, main car marked, Add a car) · Your plan (status, renew, Manage, Restore) · Home screen (shortcuts) · Delete account |
| **Work and tax** | You drive for (5 choices incl. company car, just me) · Employer rate · Other income · Tax already taken off · How you count income · Accountant · Quarterly updates · Work hours · Sort trips automatically (Pro) · Invoice details (G) · Downloads |
| **Help, privacy and your data** | Help · Feedback · Email · Community · Rate · Invite · App lock (switch) · Get a copy of your data · Check my trips for odd ones · Terms · Privacy |

### B.3 Merged, moved, removed, renamed
Same removals as A (P2, P3, weekly goal). Differences from A: Invoice details and Downloads stay in Settings under Work and tax (rather than moving Invoice details to Invoices); Saved places and Work hours sit inside the job they serve (Recording, Work and tax); App lock sits with privacy. Same renames as A.

### B.4 How each driver sees B
The hub is the same five rows for everyone; only the sentences change ("A company car · team: Acme Ltd", "Just me, not for work"). For P the 4th row becomes **"Your driving"** ("Just me · no work miles") and holds only the work-type choice and Saved places. Free drivers see "Free plan" in row 3.

### B.5 Profile tab and More tab
Avatar opens **row 3's screen** directly (it is the Profile page, grown up). More's "Settings" row stays. Vehicles, Saved places and Work hours stay on More as shortcuts.

### B.6 Risks
- Big screens: Work and tax has about 11 rows; You has 4 sections. Scrolling moves from the hub into the screens.
- The hub only shows two checks (recording, notifications); uploads move into Recording. Less "at a glance" than A.
- Five rows feel thin for a Settings page; drivers used to the long list may think things are missing.

### B.7 Build size
**Medium, about 5 to 6 days.** Mostly regrouping existing rows into five screens plus the live sentences.

---

## 3. Direction C: "You page, check-up and search" (designer 3: settings live where you use them)

**Point of view:** most settings belong next to the thing they change. The tax details belong on the Tax tab, the recording switch on Home's status line, fuel alerts on Fuel. So C **removes the Settings hub** and replaces the Profile tab and Settings with one **"You" page**: who you are, a check-up that only shows problems, and a search box. Every area gets a small gear in its header that opens that area's settings.

### C.1 "You" page (avatar, and More > You and settings)

| # | Block | Shows | Goes to |
|---|---|---|---|
| 1 | Header card | Avatar, "Demo", email, plan chip "Pro until 3 Nov" | Your account / Your plan |
| 2 | Check-up | "All good: 4 of 4" with a collapsed list, or the problems first: red "Notifications are blocked on this phone · Fix" | Each fix |
| 3 | Search settings | Field "Search: car, cancel, alerts, tax..." with 4 suggestion chips: Change my car · Cancel Pro · Stop a notification · Pause recording | Results list (each result names where it lives) |
| 4 | Your car | "Toyota Prius · Hybrid" | Vehicles |
| 5 | You drive for | "Deliveries and an employer" | Your tax details |
| 6 | Notifications | "12 of 15 on" | Notifications |
| 7 | Settings by area | Six rows: Recording · Trips · Tax · Fuel · Home · Privacy, each "opens the gear on that screen" | That area's settings sheet |
| 8 | Help | Help, feedback, email, community, rate, invite, terms | |
| 9 | Footer | Log out · Version | |

### C.2 Gears on each area (settings moved into place)

| Area | Gear sheet holds |
|---|---|
| Home (status line, and gear in Recording sheet) | Automatic trips, Pause, End a trip after, Arrived rule, Save battery, Check recording, Home shortcuts |
| Trips tab | Sort trips automatically, Saved places, trip reminders notification |
| Tax tab | Your tax details (all rows), tax deadline notification, Downloads |
| Fuel tab | Cheapest fuel alert, EV running costs alert, your car's fuel |
| Insights | Weekly goal, weekly and monthly summaries |
| You page > Privacy | App lock, Get a copy of your data, Delete account, Terms |

### C.3 Merged, moved, removed, renamed
All of A's removals and renames. The Settings hub and the Profile tab go; their rows are spread to the gears above. Notification switches move next to the feature they belong to, and the Notifications screen stays as the full list (search finds each one).

### C.4 How each driver sees C
Gears only appear on tabs the driver has: C and P drivers have no Earnings tab and P has "Records" instead of Tax (decision E of the Tax tab), so the Tax gear holds only work type and downloads. Check-up is the same for all.

### C.5 Profile tab and More tab
Both "Profile" and "Settings" become "You". More keeps one row: "You and settings". Duplicates disappear by design, because each setting has one home next to its feature.

### C.6 Risks
- **Findability.** A driver who looks for "Settings" will not find a list; search must be excellent and kept up to date with every new setting (a search index is a new thing to maintain).
- Drivers in this audience rarely search; they scroll. Anthony's testers already know the Settings list.
- Biggest change to learn, biggest build, and every tab's header gets one more control.

### C.7 Build size
**Large, about 10 to 12 days.** Search index and results, six gear sheets, moving notification switches into features, the You page, plus the shared fixes.

---

## 4. Fixes every direction includes

These ship whichever direction is chosen. Most could ship this week on their own.

| # | Fix | Audit ref |
|---|---|---|
| F1 | **Every settings screen gets a title and a back button.** Add the missing `Stack.Screen` lines for `settings/preferences` and `settings/profile` (and every new screen). Add a test that fails if any file in `app/` has no `Stack.Screen` line, so it can't happen again | P1 |
| F2 | **Help links go to the right place** (`lib/help/topics.ts` lines 53 and 232). "Work mode vs Personal" opens Your tax details (You drive for); "Auto-classify rules" opens Sort trips automatically (`/classification-rules`, which exists) instead of the missing `/settings/auto-classify`. Old `/settings/general` redirects to Your account, with a header | P7 |
| F3 | **Pro badges only where it's really Pro.** Remove the badge from Work hours (free since 8 May). Keep it on Sort trips automatically, Downloads and the Quarterly updates PDF for free drivers only; never show a Pro badge to a Pro driver | P10 |
| F4 | **Remove the three rows that do nothing:** What you see, Reorder Profile cards, Customise dashboard layout | P3 |
| F5 | **Replace Dashboard mode.** It no longer changes Home and it silently changes which notifications the server sends. Work type gets two new answers (A company car; Just me, not for work). The server picks tax and work notifications from work type instead of dashboard mode. Drivers who had picked "Personal" become "Just me" (and keep getting the same notifications they get today) | P2, P12 |
| F6 | **Notifications tell the truth.** First line of the Notifications screen is the phone's permission ("Your phone lets MileClear send notifications" / red "Your phone is blocking MileClear · Open phone settings"). The Settings row says "Blocked on this phone" in red when it is. The count ("12 of 15 on") only shows when the phone allows them | P5 |
| F7 | **Recording tells the truth.** The Automatic trips row never says "On" by itself; it shows the same status as Home's line (location, Background App Refresh, paused, Low Power Mode) | P4 |
| F8 | **Rate MileClear opens the Play Store on Android** | P13 |
| F9 | **Notifications grouped by reason, not by timing**: About your trips · Tax and money · Your car and fuel · Roads · Your progress · Summaries | P9 |
| F10 | **One Drive Detection row**, not two, renamed "Check recording in detail" | P11 |
| F11 | **Invite a friend leaves the top of Settings** (stays on More and at the bottom of Help) | P10 |

### Jargon list (plain replacements for the screens)

| Today | In the app it becomes |
|---|---|
| Dashboard mode / dashboards | You drive for (work type) |
| Tracking & Locations | Recording |
| GPS detection | Recording your drives |
| Geofences | Saved places |
| Classification rules / auto-classify | Sort trips automatically |
| Diagnostics | Check recording in detail |
| Battery saver | Save battery when it's low |
| Battery & low-power | (merged into Check recording in detail) |
| Live Activity for auto-trips | Show a trip on your lock screen |
| Auto-trip (group name) | About your trips |
| Sync status / sync | Uploads / saved to your account |
| GDPR data export / Export my data | Get a copy of your data |
| Recheck suspicious trips | Check my trips for odd ones |
| Business Profile | Invoice details |
| Tax basis / Accruals / Cash basis | How you count income: when you're paid / when you earn it |
| PAYE employment | Your job |
| Primary vehicle | Main car |
| Work schedule | Work hours |
| Quick Actions, Work Settings, Profile cards | (removed with the rows that do nothing) |
| Mileage Allowance Relief | Kept (it is HMRC's own name), with the hint "Tax back on work miles your employer doesn't fully pay" |

Copy rule kept from Tax: never pair HMRC with an adjective about our product.

---

## 5. Recommendation: Direction A

1. **It answers "is it working?" first,** with the same words and rules as the new Home. Anthony chose that idea for Home; Settings repeats it, so a driver sees one truth in two places. B shows less of it; C hides it inside a check-up that only appears when something is wrong.
2. **One page, nothing hidden.** Everything is a scroll away, in five plain groups. B moves the scrolling into five big screens; C asks drivers to search, which this audience rarely does.
3. **Ends the Profile tab confusion.** Car, plan, account and log out land at the top of Settings, where people look for "change my car" and "cancel".
4. **No screen with one or two things on it.** 15 screens become 9.
5. **Medium build,** most of it moving rows. C costs about twice as much for a bigger learning change.

Worth taking from the others: B's live sentence on the More tab's Settings row (in A as A.5), and C's search box as a later add-on if the page grows again.

---

## 6. Decisions for Anthony

Each has a recommended answer. "Yes to all" is a valid reply.

- **A. Which direction?** Recommended: **A, "Check-up first"**: one page that starts with "Is MileClear working?" and then your car, work and plan.
- **B. Should Settings open with four checks (recording, last trip, notifications, uploads), using the same words as Home's status line?** Recommended: **yes.**
- **C. Should the Profile page (the one the avatar opens) fold into Settings,** so the avatar opens Settings and your name, car and plan sit at the top? Recommended: **yes.**
- **D. "Dashboard mode" goes. Instead, "You drive for" gets two new answers: "A company car" and "Just me, not for work".** Reminders follow that answer. Recommended: **yes.** Nobody loses a notification they get today.
- **E. Remove the three settings that do nothing** (What you see, Reorder Profile cards, Customise dashboard layout)? Recommended: **yes.**
- **F. Business Profile becomes "Invoice details" at the top of the Invoices screen,** not in Settings? Recommended: **yes.** Only invoicing drivers need it.
- **G. Your car in Settings opens the same Vehicles screen as More,** and both stay? Recommended: **yes,** same screen, same name.
- **H. Saved places and Work hours: live in Settings and stay on More as shortcuts,** with no Pro badge on Work hours? Recommended: **yes.**
- **I. Log out at the bottom of Settings; Delete account inside Your account?** Recommended: **yes.**
- **J. Invite a friend moves from the first row of Settings to the Help group** (still on More)? Recommended: **yes.**
- **K. Notifications grouped by reason** (your trips, tax and money, car and fuel, roads, progress, summaries) **with the phone's permission shown first?** Recommended: **yes.**
- **L. App lock becomes a switch on the Settings page** (the one-switch Security screen goes)? Recommended: **yes.**
- **M. The weekly miles goal leaves Settings** (Insights already owns it)? Recommended: **yes.**
- **N. Ship the fixes F1 to F11 first, as their own small update, before the redesign?** F1 (no back button) traps drivers today. Recommended: **yes, this week.**
