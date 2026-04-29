// ================================================================
// MileClear  - Posts data: Release Notes + Blog
// Add new blog posts to the BLOG_POSTS array.
// Add new release notes to the RELEASE_NOTES array.
// ================================================================

export interface ReleaseNote {
  version: string;
  date: string;
  label?: "Latest" | "Major" | "Pending Review" | "App Store" | "In Testing" | "In Development";
  items: string[];
  ctaUrl?: string;
  ctaLabel?: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: "engineering" | "guide" | "announcement";
  content: string; // full HTML string  - trusted, developer-authored
}

export interface Guide {
  slug: string; // route under /
  title: string;
  excerpt: string;
  category: "tax" | "tracking" | "rules";
  readTime: string; // e.g. "5 min read"
}

// ----------------------------------------------------------------
// Release Notes
// ----------------------------------------------------------------
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.1.0",
    date: "29 April 2026",
    label: "In Testing",
    ctaUrl: "https://testflight.apple.com/join/SGrmnaaH",
    ctaLabel: "Join the beta on TestFlight",
    items: [
      "Tax Readiness card - new dashboard widget for Work mode showing estimated tax + NI for the year, suggested set-aside this week from your real numbers, and a countdown to the 31 January filing deadline that turns amber at 90 days and red at 30. Free for all users.",
      "Higher-rate threshold warning - if your projected profit gets within £15,000 of the £50,270 higher-rate band, the dashboard tells you exactly how far away you are and reminds you to claim every business mile.",
      "Activity Heatmap - dashboard card showing when you actually drive and earn most across the last 12 weeks. 7 days × 24 hours, intensity-coloured. Filter by platform (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart) and toggle between trips and earnings. Tap any cell for the breakdown.",
      "Anonymous Benchmarking - new 'How You Compare' card showing your weekly miles and trips against the median, p25 and p75 of all UK MileClear drivers. Per-platform breakdowns light up when each platform crosses 5 active contributors. Privacy floor of 5 contributors per cell, never exposes individual data.",
      "HMRC Reconciliation - new screen letting you enter the earnings figure HMRC has on file for each platform (from your Personal Tax Account notice) and see the gap against MileClear's tracked figure. Helps drivers spot under- or over-reporting before HMRC does. Free for all users.",
      "First-time Self Assessment guide - plain-English walkthrough for drivers filing Self Assessment for the first time. Covers UTR registration, the UK tax year, what you actually pay (income tax + Class 4 NI + Class 2 NI), the AMAP mileage deduction, and the 31 January deadline.",
      "HMRC attestation cover sheet on the Self Assessment PDF - one-page signed declaration page sits in front of the existing report, with your name, UTR (blank for you to fill in), tax year period, and the contemporaneous-record attestation language HMRC inspectors recognise. Pro feature.",
      "Vehicle MOT and tax expiry reminders - MileClear now refreshes your primary vehicle's DVLA data weekly and sends a push notification when MOT or tax expires within 14 days. Tap the notification to jump straight to the vehicle.",
      "MOT History - tap 'View MOT History' on any vehicle with a registration plate to see the full DVSA record. Test results, expiry dates, advisories, defects with severity tags, and odometer growth between tests. Pulled live from the DVSA MOT History API.",
      "Pickup wait timer - tap 'Wait at pickup' on the Active Recording screen when you arrive at a restaurant or depot. The stopwatch runs while you wait; tap 'Picked up' when the order's ready. Survives app suspension. Foundation for community-aggregated 'this McDonald's averages 12-min waits' insights landing once enough drivers contribute.",
      "Earnings adoption nudge - if you're tracking trips but haven't logged earnings, the Tax Readiness card shows a one-tap shortcut to the earnings form. Drivers who don't log earnings can't see their real tax estimate.",
      "Drag-and-drop dashboard customization - long-press any card in Profile > Customize Layout (or tap the new 'Customize this dashboard' link at the bottom of the dashboard) and drag to reorder. Toggle visibility per card. Reset per-screen or all at once. Locked cards (hero, Start Trip CTA, account actions) stay put.",
      "Work dashboard reordered to summary-up, detail-down - hero, Start Trip, today's recap, tax readiness and weekly goal at the top; activity heatmap, benchmark, calendar and community insights toward the bottom. Existing layouts are preserved - only fresh installs and the Reset action see the new default.",
      "Trip distance preserved when reopening a saved trip - the OSRM road-route auto-calc no longer silently overwrites the original GPS-breadcrumb-summed distance. Multi-stop trips, Deliveroo loops, anything with a detour now shows the same distance on the trips list and inside the trip itself.",
      "Lock-screen Delete on the 'Trip recorded' notification - alongside the existing Business and Personal classification buttons, you can now Delete a trip directly from the lock screen. No need to open the app to bin one you did not want recorded.",
      "Smart location-permission recovery - the dashboard's 'Auto-detection is off' card now does the right thing based on what iOS has actually been asked. If MileClear has never requested location, tapping the card fires the in-app prompt (which is what creates the Location row in iOS Settings - until you've been asked once, that row simply doesn't exist). If foreground was granted but background never asked, it fires the upgrade prompt. Only opens Settings as a last resort, with explicit step-by-step guidance.",
      "Tap the MileClear logo in the header to jump back to the dashboard from any screen - universal home button. Fixes the case where the avatar menu's tab-switch left you with no obvious way back.",
      "Business Mileage card on the work dashboard - shows your business-classified miles for the month, with prev/next chevrons to navigate back through previous months. No more digging through the trips list to total up March's claim - tap the back arrow once and it's there.",
      "Auto-trip Live Activity opt-out - new toggle in Profile > Notifications. When off, the lock-screen Dynamic Island indicator only appears when you tap Start Trip / Start Shift yourself, never on auto-detected trips. Default stays on so existing behaviour is unchanged.",
      "Driving Patterns card clarity fixes - busiest-day bars now show their actual trip counts above each bar, and the peak-hours rows show their time-block labels (Morning, Afternoon, Evening...) and ranges (08-12, 12-16, 16-20...) instead of ambiguous weather icons. Added a 'You drive most on [day] during the [time block]' insight at the bottom.",
      "Onboarding refresh - pain bullets and social proof reworked to speak to gig drivers, employees with work cars, and self-employed drivers, not just gig drivers. New step 3 captures vehicle type (Car / Van / Motorbike) so HMRC rates are correct from your first trip - a placeholder vehicle is auto-created and you can fill in make / model / MPG anytime in Profile. Employees who pick the Employee work type now get a quick 25p / 30p / 40p / 45p chip selector to set their employer reimbursement rate during setup, so the Business Mileage card shows 'owed by employer' figures from day one. The Notifications step's confusing 'Trip detection' bullet renamed to 'Classify-trip prompts' with a clarification that auto-tracking still works without these. The all-set screen now shows a real setup checklist (Location / Notifications / Vehicle / Employer rate / Goal) with green ticks and amber warnings for anything skipped, instead of the old static 'connect Bluetooth' hint.",
      "Visible trash icon on every trip in the list - replaces the long-press-only delete that most users never tried. Long-press still works as a fallback.",
      "Auto-trip false-positive hardening for stationary drift - the detection engine now distinguishes iOS-reported speed (Kalman-filtered, trustworthy) from calculated speed (susceptible to GPS noise). Calculated speed always needs the consecutive-detection confirmation, won't fast-track at 25mph, and requires at least 3-second sample periods and 30m of real movement before counting. Saved-location fallback radius bumped to 150m. Phone-in-pocket indoor drift can no longer fake a highway-speed reading.",
      "Background-fetch trip recovery - if iOS suspends the JS runtime mid-park and your auto-trip never gets a chance to finalise, the app now wakes itself periodically (every ~15 min, iOS schedules) to finalise stale recordings and fire the 'Trip recorded - classify it' notification. You no longer need to open MileClear before your trip is recognised.",
      "Sync queue accuracy fixes - the 'X items pending sync' badge now only counts what the engine will actually attempt, so retry-exhausted rows can no longer pile up forever. Transient failures now transition to a terminal 'permanently_failed' state at the retry ceiling. Long sync batches surface 'Syncing 3 of 12...' progress text instead of an opaque spinner. First-launch hydration shows a 'Taking longer than usual' note after 8s on slow connections.",
      "Sparse-GPS-trace fix - solved the bug where iOS could suspend the JS runtime mid-trip and leave recording stuck in low-power detection mode (200m intervals instead of 50m). The recording-mode upgrade now verifies it took effect and retries automatically.",
      "Web dashboard: Footer 'For drivers' column linking all 6 niche guides (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri) plus the MileIQ comparison.",
      "API: new /business-insights/tax-snapshot, /business-insights/heatmap, /business-insights/benchmarks, /hmrc-reconciliation, /pickup-waits, /vehicles/:id/mot-history endpoints powering the dashboard cards. All free-tier; premium-gated APIs remain unchanged.",
    ],
  },
  {
    version: "1.0.10",
    date: "25 April 2026",
    label: "In Testing",
    ctaUrl: "https://testflight.apple.com/join/SGrmnaaH",
    ctaLabel: "Join the beta on TestFlight",
    items: [
      "Active Recording screen - reachable from the Live Activity, the Dynamic Island, the persistent in-progress notification, or the new amber banner that now appears at the top of the dashboard whenever a trip is being tracked. You always know exactly when MileClear is recording, even if iOS quietly suppresses the Live Activity.",
      "Passive ongoing notification - stays on your lock screen for the duration of every auto-detected trip. Tap it to view live distance and duration, or to end the trip and save it.",
      "Every push notification now opens the screen that the message refers to. Tax-deadline reminders open Exports. Unclassified-trip nudges open the trips list pre-filtered to unclassified. Payment-failed alerts open Settings. Stuck-recording alerts open the Active Recording screen.",
      "Self Assessment wizard - a step-by-step guide that maps your MileClear data to HMRC SA103 form boxes. Shows exactly which numbers go in which boxes, with a full income tax and National Insurance breakdown.",
      "Accountant sharing - invite your accountant by email to a read-only dashboard showing your trips, mileage deductions, expenses, and earnings. They can download CSV and PDF exports without needing a MileClear account.",
      "Receipt scanning - point your camera at a parking ticket, toll receipt, or fuel receipt and it extracts the amount, date, and vendor automatically. Uses on-device processing so your images never leave your phone.",
      "Siri Shortcuts - 'Hey Siri, start my shift', 'How many miles today?', 'Log expense', 'Weekly goal progress'. Works hands-free while driving.",
      "Clearer location permission flow during onboarding - if you decline 'Always' access, you now see a plain-English card explaining what auto-detection costs (manual Start taps, missed HMRC-deductible miles) with a one-tap Open Settings link that deep-links straight to MileClear's location page. The card flips to green automatically when you return with the permission granted.",
      "Trip distances are noticeably more accurate. We now filter out GPS noise (the random spikes that used to inflate your mileage) and snap your route to actual roads using OpenStreetMap routing. Expect roughly 5-10% better accuracy on winding country lanes, and a clean polyline on the map instead of jagged jumps.",
      "Auto-detection no longer triggers when you're parked at a saved location. Setting Home, Work, or your depot now blocks the 'You started driving' notification when GPS drift makes your phone briefly look like it's moving at 15mph indoors. The legitimate 'leaving home to drive' case still works via the geofence exit.",
      "Change your password from inside the app and on the web dashboard, without needing a reset email. Useful when reset emails get filtered by Outlook, Hotmail, or other strict spam filters. Your other devices are signed out automatically; the device you change it from stays signed in.",
      "Race-condition fix: under rare conditions two anchor-exit handlers could fire concurrently and start the same recording twice. A mutex now collapses concurrent starts onto a single recording.",
      "Stuck recording watchdog - if iOS stops delivering location updates during a trip, a repeating timer now detects and saves the trip instead of leaving it stuck indefinitely.",
      "Fixed a bug where ending a long shift could lose all trip data. GPS coordinates are now preserved until trips are confirmed saved.",
      "Smarter rating prompts. Cooldown shortened from 7 to 3 days, plus a new dashboard trigger for users who don't classify trips often. Every skipped prompt now records a reason (cooldown, already rated, not enough trips, etc.) so we can fix the gates that were silently swallowing it.",
      "Diagnostic alerts now retry every 24 hours instead of every 7 days, so high-frequency drivers get repeat reminders if a problem persists. Stuck-recording detection on the server side also kicks in 15 minutes after you stop, instead of waiting 30.",
      "Per-trip GPS quality scoring. Each trip now records how clean the underlying GPS data was: percentage of high-accuracy fixes, how many outlier points were dropped, and whether the road-match succeeded. Lets us spot suspect trips without having to pull the full coordinate trace.",
      "Background app heartbeat. Your app pings the server with its tracking permissions and task state on launch and on every foreground (rate-limited to once per 24h). Catches the silent-failure case where iOS revokes background location after onboarding and detection quietly stops.",
      "Auto-classification accuracy tracking. When you change a trip's classification from the auto-suggested value, that decision is now recorded (the first time only) so we can measure how often our suggestions are correct and tune the rules over time.",
      "Fixed Apple In-App Purchase webhook verification - subscription activations that were silently failing now process correctly. Webhooks now accept both Sandbox (TestFlight beta testers) and Production (live App Store customers), and can auto-link a purchase back to your account if the normal validation call hasn't completed yet (network blip, app backgrounded mid-purchase, etc.).",
      "Web dashboard: fixed the broken vehicle icon in the sidebar that appeared after switching avatars.",
    ],
  },
  {
    version: "1.0.8",
    date: "13 April 2026",
    label: "App Store",
    items: [
      "Weekly earnings goal - set a target and track your progress with a live progress bar on the dashboard. Turns amber as you approach and green when you hit it",
      "Working calendar - a month-view heatmap showing which days you drove, how much you earned, and how many trips you did. Colour intensity by earnings so your best days stand out at a glance",
      "Business expenses - log parking, tolls, congestion charges, phone costs, equipment, and other allowable expenses. Vehicle costs (maintenance, insurance, MOT, road tax) are tracked separately because HMRC won't let you claim them alongside the mileage allowance",
      "Tax estimate - see your estimated income tax and National Insurance based on your earnings minus mileage deduction minus allowable expenses. Full breakdown by tax band, Class 2 NI, and Class 4 NI so you know roughly what to set aside",
      "Morning briefing - a daily push notification at 8am with yesterday's trips, miles, earnings, weekly goal progress, and how many trips need classifying. Personal mode gets a simpler summary without the earnings",
      "Fuel price alerts - daily notification with the cheapest fuel near your saved locations. Pulls live data from 8,300+ UK government-mandated station feeds so prices are always current",
      "Proactive tracking alerts - if MileClear detects an issue with your tracking setup (location permission missing, background task stopped, or a stuck recording), it sends you a push notification explaining what to fix. No more silent failures where trips just stop recording without you knowing",
      "Trip notifications now show your daily running total - 'Trip 4 today, 18.7 mi total' - so you can see your day building up in real time",
      "Unclassified trip badge - a red count appears on your avatar and in the navigation menu when you have trips waiting to be classified. Clears as you work through them",
      "Fixed a rare bug where trips could be lost when iOS blocked secure storage access during a background-to-foreground transition. The app now caches your auth token in memory so background trip saves never depend on the iOS keychain",
      "Fixed a bug where tapping the 'Looks like you're driving' notification could accidentally start a background recording that ran for hours. Tapping now just confirms the trip without changing the tracking mode",
      "Trips that failed to save now log the exact reason instead of failing silently. If a trip ever goes missing on this build, the diagnostics screen will tell you why",
      "Fixed stale GPS data from a previous trip bleeding into the next one. Each new recording now starts with a clean buffer so your start address and distance are always from the current drive",
      "If a trip can't sync to the server because of a local device error, it now stays saved on your phone and retries later instead of being deleted",
    ],
  },
  {
    version: "1.0.7",
    date: "11 April 2026",
    label: "App Store",
    items: [
      "Long drives now save the whole drive - fixed a bug where any trip longer than about 25 minutes would lose its opening section, so commutes and road trips with delayed finalisation were saving as only their tail end. Full route end to end now",
      "Phantom trip cycles eliminated - a pair of geofence bugs could cause iOS to fire false 'you're driving' events from indoor GPS drift or the instant a trip saved, then silently fail to fire on the real trip later. Your afternoon errands now record properly even after the phone has been sitting at home for a couple of hours",
      "Drive Detection Diagnostics screen - new under Profile > Settings. Shows a verdict banner, a plain-English problems list, and the last 50 detection events so you (or we) can see exactly what the engine is doing. If something feels off, take a screenshot and send it over for instant triage",
      "End Trip on the lock screen actually ends the trip now - tapping the button on the Live Activity flips it to a 'Saving trip' state instantly via iOS 17.2+ App Intents, then a 'Trip Complete' summary with your final distance and classify CTA",
      "New 'Trip Complete' Live Activity view - shows a checkmark, your frozen duration (HH:MM:SS for long trips), and a one-tap Classify Trip button when the trip needs classifying",
      "Trips land in the inbox faster - reverse geocoding, classification, and road-data lookups now run in parallel during finalisation instead of sequentially, and the 'Trip recorded' notification fires before the API call for auto-classified trips",
      "Fixed the runaway Trip In Progress timer that could show wildly incorrect elapsed times like '5369:16' on a fresh drive. A stale session from a previous crash no longer bleeds into new trips",
      "Fresh trip starts now clear any leftover GPS breadcrumbs from a crashed previous session, so distance and start location are always accurate",
    ],
  },
  {
    version: "1.0.6",
    date: "7 April 2026",
    label: "App Store",
    items: [
      "More accurate auto trip distances - winding routes and country lanes no longer read 5-10% short. Distances are cross-checked against UK road data so your HMRC mileage claims match your odometer",
      "Reliable trip starts - leaving home, work, or any saved location now records from the moment you drive off instead of a few hundred metres later",
      "Faster highway detection - a single motorway-speed reading is now enough to start recording, no more waiting for a second confirmation on fast roads",
      "Cold-start GPS trusted - the first location fix when leaving a garage or shaded driveway is no longer ignored while accuracy is still settling",
      "Faster permission recovery - if location access gets downgraded the app nudges you every 4 hours instead of once per day, so trips do not silently stop recording",
      "Trip Complete screen fix - long trips over an hour now display as HH:MM:SS instead of a runaway minute counter",
      "Internal diagnostics added to help pin down the remaining auto-trip edge cases reported by users",
    ],
  },
  {
    version: "1.0.5",
    date: "5 April 2026",
    label: "App Store",
    items: [
      "Smarter trip detection - multi-stop journeys (fuel stops, school drop-offs, drive-throughs) now record as one continuous trip instead of splitting into fragments",
      "10-minute stop timeout - up from 5 minutes, so brief stops no longer end your trip prematurely",
      "GPS drift filtering - a new stop anchor system prevents phantom mini-trips from GPS wobble while parked",
      "Trip merging - if a trip does split, consecutive segments within 15 minutes and 500m are automatically merged",
      "Live Activity timer fix - the timer no longer resets to zero when switching between apps",
      "Notification tap opens live trip - tapping the driving notification now opens the trip map showing your full route from the detection point",
      "Live Activity lock screen tap - now correctly opens the app to the dashboard",
      "Trip filter fix - switching between Business, Personal, and Inbox no longer shows the wrong trips",
      "Sync stability - fixed a crash when saving trips that were already synced via background hydration",
    ],
  },
  {
    version: "1.0.4",
    date: "1 April 2026",
    label: "App Store",
    items: [
      "Admin feedback replies - admin can now reply directly to user suggestions and bug reports, with email notifications",
      "Known Issues section - pinned at the top of the feedback screen so you always know what bugs we're working on",
      "Me too voting - tap to let us know if a known issue affects you",
      "Web admin expansion - new Activity feed, Feedback management tab, push-to-user from user detail, feedback stats on overview",
      "Known issue status tracking - Investigating, Fix in Progress, and Fixed badges visible to all users",
    ],
  },
  {
    version: "1.0.3",
    date: "28 March 2026",
    label: "App Store",
    items: [
      "Smart classification  - MileClear now auto-classifies your trips using your saved locations, work schedule, and driving patterns. No more manually tagging every trip",
      "Route learning  - classify the same route 3 times and MileClear remembers. Future trips on that route are classified automatically",
      "Lock screen classification  - Business and Personal buttons appear right on the trip notification. Classify without opening the app",
      "Classification rules  - set up rules like 'Mon-Fri 6am-2pm = Business' or 'Trips from Depot = Business' in Profile > Classification Rules",
      "Inbox triage  - unclassified trips are grouped by route with dates. Tap 'Business (5)' to classify all trips on the same route with one tap",
      "Live Activities  - your trip or shift appears on the Dynamic Island and lock screen with a real-time timer, miles, and speed. Branded design with amber (work) or green (personal) accents",
      "Live Activity action buttons  - 'End Trip' and 'Not Driving' buttons on the lock screen widget. End a trip or dismiss a false detection without unlocking your phone",
      "Dynamic Island  - compact pill shows a car icon and timer, expanded view shows speed, miles, timer, and trip count",
      "Faster trip finalization  - auto-detected trips now appear in your inbox within about 6 minutes of parking, not 30+ minutes",
      "Bluetooth trip end  - if your car's Bluetooth disconnects (engine off), the trip finalizes in about 90 seconds instead of 5 minutes",
      "Navigation-grade GPS  - all trip recording now uses iOS's highest accuracy mode with sensor fusion and dead reckoning through tunnels",
      "Admin dashboard  - revenue metrics, user engagement, auto-trip health monitor, push notification sender, and email campaign tools",
    ],
  },
  {
    version: "1.0.2",
    date: "24 March 2026",
    items: [
      "Platform tag suggestions  - if your last 10 trips from a location were all Uber, the next one auto-suggests Uber",
      "Honest shift grades  - your A-F shift grades now factor in fuel and wear costs so you see real profit, not just gross earnings",
      "Tax savings on dashboard  - your running HMRC deduction total is now front and centre on the work dashboard for all users",
      "Help & Support section  - new section in your profile with direct email support, feedback, and FAQ links",
      "Contact Support in errors  - if something goes wrong, error messages now include a button to email support with context pre-filled",
      "3-day check-in email  - a personal email from Gair a few days after signup to make sure everything's working",
      "Feedback acknowledgement  - submitting feedback now sends a confirmation email so you know it was received",
      "Auto-detected trips now correctly show your vehicle in PDF and CSV exports",
      "Updates & Blog page added  - mileclear.com/updates",
    ],
  },
  {
    version: "1.0.1",
    date: "20 March 2026",
    items: [
      "Annual plan available  - save 25% with yearly billing",
      "Smarter trip detection  - Driver/Passenger notification buttons so you can confirm or dismiss without unlocking",
      "More accurate trip end times  - timestamps now reflect when you actually stopped driving, not when you tapped the app",
      "Improved sign-in reliability across iOS 18 and iOS 26 betas",
      "Expanded onboarding  - set your driving goals and notification preferences during setup",
      "Delete trips with a long-press  - tap to select, then delete",
      "Web dashboard: forgot password and email verification pages added",
    ],
  },
  {
    version: "1.0.0",
    date: "1 March 2026",
    items: [
      "Initial release  - MileClear is live on the App Store",
      "GPS trip tracking with background detection and an offline-first local database",
      "HMRC mileage deduction calculator (45p/25p car, 24p motorbike)",
      "Shift management for gig workers  - start a shift, group your trips, see your scorecard",
      "Fuel price finder covering 8,300+ UK stations from government-mandated feeds",
      "Gamification with 43 achievements, streaks, and personal records",
      "Apple Sign-In for one-tap iOS onboarding",
      "Stripe Checkout and Apple In-App Purchase billing for Pro",
    ],
  },
];

// ----------------------------------------------------------------
// Blog Posts
// ----------------------------------------------------------------
export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "does-amazon-flex-track-mileage",
    title: "Does Amazon Flex Track Mileage? (UK Tax Guide)",
    excerpt:
      "Short answer: no, Amazon Flex does not track your mileage in any way HMRC accepts. Here is why that matters for your tax bill, what the app does and does not record, and what UK Flex drivers should do instead.",
    date: "29 April 2026",
    author: "Gair",
    category: "guide",
    content: `
<p><strong>Short answer: no. Amazon Flex does not track your mileage in any way that satisfies HMRC.</strong></p>

<p>The app records the blocks you accept, the parcels you deliver, and what you got paid. It does not log the miles you drove, it does not export them in a tax-friendly format, and it does not produce anything HMRC would accept as a contemporaneous record. Amazon pays you per block - not per mile - so they have no business reason to track that data.</p>

<p>Long answer: this is the most-asked tax question among UK Amazon Flex drivers, and getting it wrong costs you hundreds or thousands of pounds at Self Assessment. Here is what the gap looks like and what to do about it.</p>

<h2>What Amazon Flex actually records</h2>

<ul>
<li>The block you accepted (start time, end time, station, expected pay).</li>
<li>The route Amazon assigned to that block.</li>
<li>Each parcel scan and delivery confirmation.</li>
<li>Your total earnings for the block.</li>
</ul>

<p>What it does not record:</p>

<ul>
<li>The miles from your home to the depot at the start of a block.</li>
<li>The miles from your last drop back home.</li>
<li>Any deviation from Amazon's route - traffic detours, missing house numbers, extra return drops.</li>
<li>An odometer or GPS log you can export.</li>
<li>Anything in HMRC-acceptable format.</li>
</ul>

<h2>What HMRC actually requires</h2>

<p>If you are claiming the Approved Mileage Allowance Payment (AMAP) deduction on your Self Assessment - and as a self-employed Flex driver you almost certainly should be - HMRC needs a contemporaneous record of every business journey. That means: the date, the start and end location, the reason for the trip, and the distance driven. Logged at the time, not reconstructed in January from memory.</p>

<p>The current AMAP rates (2025/26 and 2026/27):</p>
<ul>
<li><strong>45p per mile</strong> for the first 10,000 business miles in cars and vans.</li>
<li><strong>25p per mile</strong> for every business mile after that.</li>
<li><strong>24p per mile</strong> for motorcycles.</li>
<li><strong>20p per mile</strong> for bicycles.</li>
</ul>

<p>For a typical Flex driver covering 200 business miles a week, that is around £4,500 a year in deductions. If your records do not exist - or do not pass HMRC's "contemporaneous" test - you cannot claim a penny of it.</p>

<h2>"I'll just use Google Maps Timeline" - why that does not work</h2>

<p>Google Maps Timeline and Apple Maps history do record where you went. But neither distinguishes business from personal miles, neither timestamps in a tax-acceptable format, and neither exports in any way you can hand to HMRC. Your trip to Tesco at 2pm and your Amazon Flex block at 4pm both look the same in Maps Timeline - just dots on a route. Reconstructing a tax year from raw timeline data in January is a slow, error-prone afternoon you do not need.</p>

<h2>What to do instead</h2>

<p>Use a purpose-built UK mileage tracker - one that records every block automatically, tags trips by platform, applies the HMRC rate, and exports a Self Assessment-ready PDF when you need it.</p>

<p><a href="/amazon-flex-mileage-tracker">MileClear's full Amazon Flex guide</a> covers the specifics - block-based shifts, the home-to-depot commute rule, return-to-depot miles, multi-platform tagging if you also drive for Uber or Deliveroo. The setup takes about 5 minutes the first time you accept a Flex block. After that, every mile is captured without you doing anything.</p>

<p><strong>Free tier:</strong> automatic GPS tracking, manual classification, HMRC rate calculation, fuel-price lookup, all your historical trips. The tracking is what you actually need, and it is permanent and free.</p>

<p><strong>Pro at £4.99/month:</strong> CSV and PDF Self Assessment exports, the HMRC attestation cover sheet, CSV import from Amazon Flex earnings statements, the Self Assessment wizard that walks you through which numbers go in which boxes on your SA103. You only need Pro at tax time - daily tracking stays free year-round.</p>

<h2>Bottom line</h2>

<p>Amazon Flex does not track mileage. If you are claiming AMAP on Self Assessment, that gap is yours to fill. Track every mile contemporaneously with a tool built for HMRC compliance, or accept that you will under-claim by hundreds or thousands of pounds a year.</p>

<p><a href="https://apps.apple.com/app/mileclear/id6742044832">Install MileClear free on the App Store</a>.</p>
`,
  },
  {
    slug: "inactive-on-gophr",
    title: "Inactive on Gophr: What It Means and What to Do Next",
    excerpt:
      "Gophr couriers searching 'inactivity on gophr' usually have one fear: have I lost my account? Here's what an inactivity notice actually means, what to do this week, and how to make sure the work you've already done is still yours - records, miles, and tax claim included.",
    date: "29 April 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>If you are searching "inactivity on gophr", you probably opened the app and saw something you did not want to see. Maybe a banner. Maybe a missing job queue. Maybe nothing at all - the worst kind of warning. Gophr couriers in the UK ping me about this more often than couriers on any other platform, and the picture is the same most times.</p>

<p>This guide is the practical version of "what now". It will not promise you the exact policy Gophr applies to your account today - those policies move, and only Gophr support can tell you the specifics for your particular case. What it will do is explain how courier-platform inactivity generally works, what to do this week, and why - whatever happens with your account - the miles you have already driven still belong to you.</p>

<h2>What inactivity actually means on a courier platform</h2>

<p>Courier platforms like Gophr, Stuart, and Just Eat manage finite pools of active riders. When a courier stops accepting jobs for an extended period, the platform marks them as inactive. The exact window varies - some platforms use 30 days, some 60, some longer, and most do not publish an exact figure because it changes by region and demand.</p>

<p>What "inactive" then means depends on the platform. Common forms:</p>

<ul>
<li><strong>Soft inactivity:</strong> you stop seeing jobs but the account is otherwise fine. Sign in, complete a job, you are back.</li>
<li><strong>Documents required:</strong> the platform asks you to re-upload your insurance, hire-and-reward cover, vehicle docs, or right-to-work proof before you can take jobs again.</li>
<li><strong>Hard deactivation:</strong> the account is closed and you have to re-apply. Rarer for genuine inactivity, more common when there is a separate compliance issue the inactivity flag is hiding.</li>
</ul>

<p>If you have just received an inactivity message, the odds are you are in the first or second category. Most couriers I speak to get reactivated by Gophr support within a few days of asking, especially if their docs are still in date.</p>

<h2>What to do this week</h2>

<ol>
<li><strong>Open the Gophr app and screenshot anything you see.</strong> Banner, message, status. The exact wording matters when you contact support.</li>
<li><strong>Check your documents.</strong> Insurance (hire-and-reward cover specifically, not standard SD&P), vehicle docs, and any background-check expiry. If any are out of date, that is the most likely root cause.</li>
<li><strong>Email Gophr support directly.</strong> Calmly explain that your account has been marked inactive, that you want to reactivate, and that you are willing to re-submit anything they need. Polite and specific gets a faster reply than angry and vague.</li>
<li><strong>Sign in and try a job if the queue is open.</strong> Sometimes "inactivity" lifts the moment you take and complete a job. Worth trying before you escalate.</li>
<li><strong>Plan for the week.</strong> If reactivation will take a few days, line up other platforms (Uber Eats, Deliveroo, Just Eat, Stuart, Amazon Flex) so your earnings do not go to zero.</li>
</ol>

<h2>The harder lesson: your records do not belong to the platform</h2>

<p>The reason "inactivity on gophr" makes couriers nervous is not just the lost income. It is the realisation that the platform holds the records of every job you have done. If they decide to deactivate you tomorrow, that history might become harder to access. Gophr is not unique here - every gig platform works this way.</p>

<p>And here is the part most couriers do not realise until they need it: <strong>your mileage tax claim does not run on the platform's data. It runs on yours.</strong> HMRC requires a "contemporaneous record" - a log kept at the time the journey happened - of every business mile you drive. You can claim 45p per mile for the first 10,000 business miles in a tax year and 25p per mile after that, on top of whatever you took home from the platform. For a courier doing 200 miles a week, that is around £4,500 a year you can deduct from your taxable profit, regardless of what Gophr's app shows.</p>

<p>If your records sit only in Gophr's app and Gophr deactivates you, you have a problem. Not catastrophic - HMRC accepts other forms of evidence - but harder than it needs to be.</p>

<h2>This is exactly why I built MileClear</h2>

<p>I built <a href="/">MileClear</a> because I watched too many UK couriers - on Gophr, on Deliveroo, on Just Eat, on Uber Eats - lose money at tax time because their records lived in someone else's app. MileClear tracks every business mile automatically, applies the <a href="/hmrc-mileage-rates">HMRC AMAP rate</a> (45p / 25p / 24p depending on vehicle), and keeps the record on your phone, in your name, exportable to a Self Assessment-ready PDF whenever you want it.</p>

<p>It does not depend on Gophr being active, on Deliveroo accepting your application, or on Just Eat keeping your account alive. The tracker runs in the background, attaches the right platform tag to each trip (Gophr, Stuart, Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri), and gives you a complete audit trail in case HMRC ever ask. If a platform deactivates you tomorrow, every mile you drove for them up to that point is still yours.</p>

<p><strong>What you get on the free tier:</strong> automatic GPS trip tracking, manual classification, HMRC rate calculation, fuel-price lookup, two saved locations (home and depot, typically), all your historical trips. Tracking is the part you actually need - and it is permanent and free.</p>

<p><strong>What Pro adds for £4.99/month:</strong> the export side. CSV and PDF Self Assessment downloads, the HMRC-formatted attestation cover sheet, CSV import from platform earnings statements, unlimited saved locations, and the Self Assessment wizard that walks you through which numbers go in which boxes on your SA103 form. You only need Pro at tax time - so if you are a daily driver, you can run free for 11 months and upgrade in late January.</p>

<h2>Quick checklist if you are dealing with Gophr inactivity right now</h2>

<ul>
<li>Screenshot the Gophr message and contact their support, calmly and specifically.</li>
<li>Check your insurance and document expiry - this is usually the real cause.</li>
<li>Sign on and try a job if the queue is live.</li>
<li>Line up another platform for the week so your income does not stop.</li>
<li><a href="https://apps.apple.com/app/mileclear/id6742044832">Install MileClear free</a> so the next time a platform throws a curveball, your records are yours.</li>
</ul>

<p>Inactivity on Gophr is almost always reversible. Lost mileage records are not. Sort the first; then make sure the second can never happen to you again.</p>
`,
  },
  {
    slug: "whats-new-in-version-1-1-0",
    title: "What's New in Version 1.1.0",
    excerpt:
      "Tax Readiness card, Activity Heatmap, Anonymous Benchmarking, HMRC Reconciliation, MOT History, pickup wait timer. The biggest single update we've shipped, and the reason we're moving from 1.0.x to 1.1.0.",
    date: "26 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.1.0 is a step change. Thirteen new features, two new database tables, six new API endpoints, and a fundamental shift in what the dashboard does. We are moving from 1.0.x to 1.1.0 because the tools added here change MileClear from a mileage tracker into something that actively helps drivers run a self-employed business.</p>

<h2>The Tax Readiness card</h2>

<p>This is the card I am most excited about, and it is the headline of 1.1.0. On the Work mode dashboard, you now see, live, every time you open the app:</p>

<ul>
<li>Your estimated tax + NI for the current tax year, calculated from your real earnings minus your real mileage deduction</li>
<li>How much to set aside this week for HMRC, calculated from your last 7 days of earnings at your effective rate</li>
<li>A countdown to the 31 January filing deadline, which turns amber at 90 days and red at 30</li>
<li>A 3-item readiness check (full name set, primary vehicle with MPG, all trips classified) showing where you stand</li>
<li>A higher-rate-threshold warning if your projected profit is approaching £50,270 - drivers who cross this line lose 20p in the pound to additional tax, and tracking every business mile keeps them below it for longer</li>
</ul>

<p>This is the kind of feature drivers have been telling me they wanted: not "what is my mileage" but "am I going to be OK in January". The card answers that, in real numbers, every time you open the app.</p>

<h2>Activity Heatmap and Anonymous Benchmarking</h2>

<p>Two new dashboard cards built on the data MileClear already collects:</p>

<p><strong>Activity Heatmap</strong> shows when you actually drive and earn most. Seven days × twenty-four hours, intensity-coloured. Filter by platform - Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart - and toggle between trips and earnings. Tap any cell for the breakdown. Built on the last 12 weeks of your own data, so it adapts to how your week actually looks.</p>

<p><strong>Anonymous Benchmarking</strong> compares your weekly miles and trips to all UK MileClear drivers. Median, p25, p75, your position on the distribution, "top X%" framing. Per-platform breakdowns appear when each platform has 5+ active contributors. There is a hard privacy floor of 5 contributors per cell - we never show buckets thinner than that, and we never expose individual data. As more drivers join, more buckets light up automatically.</p>

<p>Anonymous Benchmarking is, I think, the feature most likely to change how drivers think about MileClear. It turns "your data" into "your data plus industry context". Knowing whether you're earning the same as everyone else in your area is genuinely powerful information that gig drivers have basically never had.</p>

<h2>HMRC Reconciliation</h2>

<p>Since 1 January 2024, every UK gig platform has been reporting your earnings directly to HMRC under the OECD Digital Platform Reporting rules. The first batch of reports landed at HMRC by 31 January 2026. That means HMRC now has a per-platform record of what each driver earned, and they can compare it against what was declared on Self Assessment.</p>

<p>The new HMRC Reconciliation screen lets you enter the figures HMRC has reported for each platform (from the notice in your Personal Tax Account) and see the gap against MileClear's tracked earnings. Within £20 either way is fine. A bigger gap is something to investigate before HMRC does.</p>

<p>This is "fighting your corner" software in the most literal sense.</p>

<h2>MOT History and vehicle reminders</h2>

<p>Two pieces of vehicle compliance work, powered by direct integrations with DVLA and DVSA:</p>

<p><strong>Vehicle MOT and tax expiry reminders.</strong> MileClear now refreshes your primary vehicle's DVLA data weekly and pushes a notification when MOT or tax expires within 14 days. Tap the notification to jump straight to the vehicle. A self-employed driver losing income to a missed MOT is a real, expensive problem - this stops it.</p>

<p><strong>MOT History.</strong> Tap "View MOT History" on any vehicle with a registration plate to see the full DVSA record. Test results, expiry dates, advisories, defects with severity tags ("dangerous", "major", "advisory"), and odometer growth between tests. Direct from the DVSA MOT History API. Useful for spotting things flagged at the last test that might fail next time.</p>

<h2>Pickup wait timer</h2>

<p>On the Active Recording screen there is a new "Wait at pickup" tappable card. Tap it when you arrive at a restaurant or depot, and a stopwatch runs. Tap "Picked up" when the order is ready, and the wait is saved with location and platform.</p>

<p>For now, this is just personal data collection - your own waits. A future version will use the aggregated data to surface community insights: "this McDonald's averages 12-minute waits", "Uber pickups in this zone average 4 minutes". You will be able to avoid the slow ones. The infrastructure is in 1.1.0; the community surface comes once enough drivers are contributing.</p>

<h2>First-time Self Assessment guide</h2>

<p>Plain-English walkthrough for drivers filing Self Assessment for the first time. Covers UTR registration, the UK tax year (6 April to 5 April), what you actually pay (income tax + Class 4 NI + Class 2 NI), the AMAP mileage deduction at 45p/25p (or 24p flat for mopeds), and the 31 January deadline.</p>

<p>It is reachable from the Tax Readiness card, and exists to make sure new self-employed drivers do not miss the basics in their first year. UTR registration alone takes 10 working days - drivers who leave it until October regret it.</p>

<h2>Plus</h2>

<ul>
<li><strong>HMRC attestation cover sheet on the Self Assessment PDF</strong> - one-page signed declaration page with your name, UTR, tax year period, and the contemporaneous-record attestation language HMRC inspectors recognise. Pro feature. Accountants will share it.</li>
<li><strong>Earnings adoption nudge</strong> - if you are tracking trips but have not logged earnings recently, the Tax Readiness card shows a one-tap shortcut to the earnings form. Without earnings, the tax estimate cannot work.</li>
<li><strong>Sparse-GPS-trace reliability fix</strong> - solved the bug where iOS could suspend the JS runtime mid-trip and leave recording stuck in low-power detection mode. The recording-mode upgrade now verifies it took effect and retries automatically.</li>
</ul>

<h2>Why 1.1.0 and not 1.0.11</h2>

<p>Version numbers are arbitrary, but they signal something. 1.0.x said "we are still figuring out what this app is". 1.1.0 says "we know what this app is now: it is the tool that helps UK gig drivers stay in control of their tax, their vehicle, and their pricing".</p>

<p>The features in 1.1.0 are not just refinements. The Tax Readiness card is a genuinely new pillar of the product. Anonymous Benchmarking is a new pillar. HMRC Reconciliation is a new pillar. Vehicle compliance is a new pillar. That is four new pillars in one release, on top of the existing tracking and exports. It is the right time for the version line to move.</p>

<h2>Get it</h2>

<p>Version 1.1.0 (build 52) goes to <a href="https://testflight.apple.com/join/SGrmnaaH">TestFlight</a> as soon as the EAS build finishes. Public App Store launch follows once we have a week of TestFlight data confirming nothing rough crept in.</p>

<p>If you have been following along through the 1.0.x cycle, thank you for sticking with it. The diagnostic dumps, the bug reports, the "this would be useful" notes - they all shaped this release.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "whats-coming-next",
    title: "What's Coming Next",
    excerpt:
      "1.2.0 is MTD ITSA: HMRC quarterly submissions in time for the first practical deadline of 7 August 2026. Plus community wait-time insights, deeper Anonymous Benchmarking, and longer-term strategic plays.",
    date: "26 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.1.0 is a substantial step. The natural question is: what comes next? Here is the rough shape of where MileClear is heading, organised by when each piece is realistic.</p>

<p>None of this is a hard commitment. Solo development moves with the data, and the data sometimes says "do this thing instead". But the direction is set.</p>

<h2>1.2.0: MTD ITSA quarterly submissions (target: 7 August 2026)</h2>

<p>This is the big one, and it is happening sooner than originally planned. Build starts the week of 5 May 2026.</p>

<p>The April 2026 MTD ITSA threshold of £50,000 is already in effect. The first practical deadline that matters is <strong>7 August 2026</strong> - the close of the Q1 2026-27 quarterly submission window for self-employed drivers crossing that threshold. That is full-time DPD ODFs, full-time Amazon Flex drivers, full-time Uber drivers, and any multi-app driver running 60+ hour weeks. They need MTD-compliant software now, and whichever app they pick first becomes their default.</p>

<p>So MileClear is shipping it as 1.2.0, on a tight ~12-week timeline:</p>

<ul>
<li><strong>Phase 1 (week of 5 May):</strong> OAuth flow against HMRC sandbox + the 9-15 mandatory fraud-prevention headers HMRC requires on every call.</li>
<li><strong>Phase 2 (10 May - 14 June):</strong> Submission flow against the Self Employment Business API. Mapping MileClear earnings, mileage, and expenses to HMRC's schema; wiring the Obligations and Individual Calculations APIs so drivers see their period status and tax estimate directly.</li>
<li><strong>Phase 3 (parallel):</strong> Mobile UI - connect HMRC, see your obligations, preview the figures, submit, confirm. Pro feature.</li>
<li><strong>Phase 4 (parallel, weeks of 19 May - 21 June):</strong> HMRC production accreditation - 3-4 weeks of HMRC review, submitted early so it runs alongside development.</li>
<li><strong>Phase 5 (21 June - 5 July):</strong> Closed beta with high-earner drivers running real submissions against production HMRC.</li>
<li><strong>By 19 July:</strong> Public TestFlight or App Store availability for &gt;£50k drivers.</li>
<li><strong>7 August 2026:</strong> First real Q1 quarterly submissions land at HMRC via MileClear.</li>
</ul>

<p>The MileClear sandbox application is already registered with HMRC's Developer Hub, with all 9 relevant Self Assessment APIs subscribed. The pre-positioning is done; the build is what is ahead.</p>

<p>The strategic case is simple. Every month MileClear delays MTD ITSA is a month it cedes the highest-value customer segment to QuickBooks, Xero, or TripCatcher. Once a driver has wired their financial life into a tax tool, switching is hard. Better to be the tool they pick first.</p>

<h2>1.3+ (following months)</h2>

<h3>Community pickup-wait insights</h3>

<p>The pickup wait timer in 1.1.0 collects per-driver data. The aggregation surface is what makes that data valuable: "this McDonald's averages 12-minute waits across 8 drivers", "Friday evenings here are 18 minutes". Once enough drivers are using the timer, the average wait at every pickup point becomes a useful piece of intelligence. Privacy floor is the same as Anonymous Benchmarking - never show a bucket with fewer than 5 contributors.</p>

<h3>Deeper Anonymous Benchmarking</h3>

<p>1.1.0 ships national-level benchmarks. As the user base grows, regional breakdowns become statistically meaningful: "drivers in your postcode area average X miles per week". The infrastructure is ready; the data needs to catch up. Greater London, Greater Manchester, Birmingham, Glasgow, and Edinburgh first, then expand outward as density increases.</p>

<h3>Onboarding revamp</h3>

<p>The biggest gap in MileClear's funnel today is users who classify trips but never log earnings. Without earnings, the tax estimate cannot work. The 1.1.0 earnings nudge addresses this for active users; the next step is rebuilding the first-launch experience so new users understand from day one why earnings logging matters.</p>

<h3>HMRC reconciliation auto-fill</h3>

<p>Right now you type in HMRC's reported figure manually. The Self Assessment Accounts API would let MileClear fetch this directly with consent - which becomes natural once the OAuth and accreditation work for MTD ITSA is in place.</p>

<h2>1.4+ (later in 2026)</h2>

<h3>Vehicle maintenance log</h3>

<p>Service intervals, oil changes, tyres, brakes. Push reminders ahead of due dates. For owner-driver-franchisees running £30,000 Sprinters, missing a service is real money. Builds on the existing DVLA + DVSA integrations.</p>

<h3>Insurance broker partnership</h3>

<p>Most UK gig drivers are either underinsured or paying too much for the wrong policy class. A "Find Insurance" screen would let drivers compare quotes from regulated UK gig-insurance brokers (Zego, Inshur, etc.) with one tap. The compliance work is non-trivial - FCA rules about advice vs introduction matter here - but the value to drivers is clear.</p>

<h2>Strategic plays (long-term)</h2>

<h3>Verified mileage handoff to insurers</h3>

<p>None of the gig-economy insurers have built a verified-mileage product, even though pay-per-mile insurance literally needs that data. If MileClear becomes the trusted source-of-truth for "miles driven for work" that insurers consume via API, that is a B2B moat plus a co-marketing channel.</p>

<h3>Native tracking module</h3>

<p>The current tracking layer runs in JavaScript via Expo. iOS can suspend the JS runtime mid-trip, which is the root cause of several reliability bugs we have layered fixes against. The proper long-term solution is a Swift native module that runs outside the JS runtime. This is a serious investment - 4-8 weeks of focused work - and only justified once the user base is big enough that reliability variance becomes a churn problem. Not yet, but on the radar.</p>

<h3>Android</h3>

<p>iOS-only is fine for now: 80% of the gig-driver target audience uses iPhone. But Android coverage is the natural next platform once the iOS app is genuinely stable. Android is a deferred 1.x or 2.0 release.</p>

<h2>Things that are not on the roadmap</h2>

<p>Worth being explicit about a few things MileClear is not going to do, because being focused matters more than being feature-complete.</p>

<ul>
<li><strong>Generic budgeting / savings goals.</strong> Banking apps do this better. MileClear is for drivers, not the general public.</li>
<li><strong>Multi-currency / international.</strong> UK-only. The whole product is built around HMRC, AMAP rates, and UK gig platforms. Going international would require redoing every assumption.</li>
<li><strong>Stocks, crypto, investments.</strong> Out of scope. MileClear is about earning more from driving, not about what to do with the savings.</li>
<li><strong>An Android-style fully customisable dashboard.</strong> The layout-customisation that already exists in 1.0.x is the limit. More flexibility just adds complexity without changing user outcomes.</li>
</ul>

<h2>How to influence what's next</h2>

<p>The roadmap moves with the data. If you are using the app and something feels missing, tell me - either through the in-app feedback screen, the MileClear Facebook group, or directly to gair@mileclear.com.</p>

<p>I read every message. Several of the features in 1.1.0 came directly from things drivers said they wanted: vehicle reminders ("I missed an MOT and lost three days of earnings"), benchmarking ("am I making the same as everyone else?"), HMRC reconciliation ("I do not even know what HMRC has on file for me"). If you have a "this would be useful" thought, it has a real chance of becoming a feature.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "whats-new-in-version-1-0-10",
    title: "What's New in Version 1.0.10",
    excerpt:
      "Self Assessment wizard, accountant sharing, receipt scanning, Siri Shortcuts, the new Active Recording screen, and critical fixes for trip data loss and Apple subscription processing.",
    date: "25 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.0.10 adds four features that make MileClear genuinely useful beyond just tracking miles, a new set of recording surfaces so you always know when GPS is on, plus fixes for two data loss bugs that affected real users.</p>

<h2>Self Assessment wizard</h2>

<p>This is the feature I'm most excited about. Instead of just giving you a PDF at tax time, MileClear now walks you through the actual HMRC Self Assessment form step by step. It maps your earnings, mileage deduction, and allowable expenses to specific SA103 box numbers - Box 9 for your turnover, Box 46 for simplified mileage, Box 27 for other expenses.</p>

<p>Each step shows the real numbers from your MileClear data with a full breakdown. The tax estimate includes income tax by band, Class 2 NI, and Class 4 NI, so you know roughly what to set aside. It is guidance, not tax advice - but it is a lot better than staring at a blank tax return wondering which number goes where.</p>

<h2>Accountant sharing</h2>

<p>You can now invite your accountant to a read-only dashboard by email. They get a private link - no MileClear account needed - showing your trip summaries, mileage deductions, expenses by category, and earnings by platform. They can download CSV and PDF exports directly.</p>

<p>This is a premium feature. The idea is that your accountant sees exactly what you see, formatted for their needs, without you having to export files and email them back and forth.</p>

<h2>Receipt scanning</h2>

<p>Point your camera at a parking ticket, toll receipt, or fuel receipt. MileClear extracts the amount, date, and vendor using Apple's on-device text recognition - your images never leave your phone. The extracted data pre-fills the expense form so you just tap confirm.</p>

<p>It handles most UK receipt formats and recognises common retailers. If the scan gets something wrong, the fields are editable before you save. This requires a development build - it will not work in Expo Go.</p>

<h2>Siri Shortcuts</h2>

<p>Four voice commands, all hands-free:</p>

<ul>
<li>"Hey Siri, start my shift in MileClear" - opens the app and starts GPS tracking</li>
<li>"Hey Siri, how many miles today in MileClear" - reads back your day's stats without opening the app</li>
<li>"Hey Siri, log expense in MileClear" - Siri asks for the amount and logs it</li>
<li>"Hey Siri, weekly goal in MileClear" - tells you your progress percentage</li>
</ul>

<p>The intents that just read data work entirely in the background - Siri responds without launching the app. Start Shift opens the app because GPS tracking needs it in the foreground.</p>

<h2>Fixes that matter</h2>

<p>Two bugs this week affected real users and both are fixed.</p>

<p>A driver ended a 10-hour overnight shift covering 260 miles, and the entire shift's trip data vanished. The cause: the app was deleting GPS coordinates from local storage before confirming that trips had been created from them. If anything went wrong during trip creation - an API error, a crash, memory pressure from processing thousands of coordinates - the data was gone with no recovery. Coordinates now stay in local storage until all trips are confirmed saved.</p>

<p>A separate user subscribed to Pro via Apple In-App Purchase and was charged, but the app never activated their premium access. The cause: Apple sends a webhook notification when a purchase completes, and our server verifies it using Apple's root certificates. The certificate directory was missing from the server. Every webhook verification silently failed. The certificates are now in place and future purchases process immediately.</p>

<h2>Active Recording surfaces</h2>

<p>One thing kept coming up in feedback: people couldn't tell whether MileClear was actually recording. iOS sometimes silently suppresses Live Activities, and the Dynamic Island isn't enough on its own. Build 50 adds three layered surfaces so the answer is never ambiguous.</p>

<p>A new <strong>Active Recording screen</strong> is reachable from the Live Activity, the Dynamic Island, the persistent in-progress notification, or a new amber banner that appears at the top of the dashboard whenever a trip is being tracked. It shows live distance, duration, and a one-tap End Trip button.</p>

<p>A <strong>passive ongoing notification</strong> stays on your lock screen for the duration of every auto-detected trip. Tap it to view live stats, or to end the trip. It does not vanish if iOS reclaims memory the way Live Activities sometimes do.</p>

<p>And every <strong>push notification now deep-links to the right screen</strong> - tax-deadline reminders open Exports, unclassified-trip nudges open the trips list pre-filtered to unclassified, payment-failed alerts open Settings, stuck-recording alerts open the new Active Recording screen.</p>

<h2>Get it</h2>

<p>Version 1.0.10 (build 50) is live on <a href="https://testflight.apple.com/join/SGrmnaaH">TestFlight</a> today. The Self Assessment wizard and accountant sharing are already live on the <a href="/dashboard/self-assessment">web dashboard</a> if you want to try them now.</p>

<p>As always, feedback goes straight to us - use the feedback screen in the app or email <a href="mailto:support@mileclear.com">support@mileclear.com</a>.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "whats-new-in-version-1-0-8",
    title: "What's New in Version 1.0.8",
    excerpt:
      "Weekly earnings goals, a working calendar, business expenses, tax estimates, smarter notifications, and a deep fix for a rare bug that silently lost trips.",
    date: "13 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.0.8 is the biggest update since launch. It adds proper financial tools for work-mode drivers, daily notifications that actually tell you something useful, and a tracking reliability fix that came from debugging my own lost trip.</p>

<h2>Weekly earnings goal</h2>

<p>You can now set a weekly earnings target on the dashboard. A progress bar fills up as you log earnings throughout the week - amber as you approach your goal, green when you hit it. It resets every Monday.</p>

<p>This was one of the most requested features from beta testers. If you're driving to hit a number each week, you should be able to see where you stand without doing mental arithmetic.</p>

<h2>Working calendar</h2>

<p>A month-view heatmap showing which days you drove, how many trips you did, and how much you earned. Colour intensity is based on earnings, so your best days stand out at a glance.</p>

<p>Tap any day to see a breakdown. Useful for spotting patterns - maybe Saturdays are consistently your best days, or maybe you're driving six days a week when five would earn nearly as much.</p>

<h2>Business expenses</h2>

<p>You can now log allowable business expenses - parking, tolls, congestion charges, phone costs, equipment, cleaning, professional fees, and more. Each category is flagged as HMRC-allowable or not, so you know what counts.</p>

<p>Vehicle costs (maintenance, insurance, MOT, road tax) are tracked separately with a clear explanation: HMRC won't let you claim them alongside the mileage allowance. You can log them for your own records, but they won't appear in your deduction total.</p>

<h2>Tax estimate</h2>

<p>Based on your earnings, mileage deduction, and allowable expenses, MileClear now estimates your income tax and National Insurance liability. The breakdown shows each tax band, Class 2 NI, and Class 4 NI individually so you can see exactly how the number is calculated.</p>

<p>This is an estimate, not tax advice. But it gives you a rough idea of what to set aside each month so you're not surprised in January.</p>

<h2>Morning briefing</h2>

<p>A daily push notification at 8am summarising yesterday: how many trips, total miles, earnings, weekly goal progress, and how many trips are waiting to be classified. Personal-mode drivers get a simpler version without the earnings.</p>

<p>The idea is that you start each day knowing where you stand. If you have unclassified trips building up, the briefing nudges you. If you hit your weekly goal yesterday, it tells you.</p>

<h2>Fuel price alerts</h2>

<p>If you have saved locations, MileClear checks the cheapest fuel near them every day using the UK government's mandatory fuel pricing data - over 8,300 stations reporting live prices. If a station near your home or depot is significantly cheaper, you get a notification.</p>

<p>This uses the same gov.uk Fuel Finder API that powers the fuel prices screen in the app. The data is mandatory reporting since February 2026, so it covers virtually every station in the UK.</p>

<h2>Proactive tracking alerts</h2>

<p>This is new and important. If MileClear detects a problem with your tracking setup - your location permission was downgraded, the background task stopped running, or a recording got stuck - it now sends you a push notification explaining what happened and how to fix it.</p>

<p>Before this update, if iOS silently revoked your background location permission (which it does occasionally), your trips would just stop recording and you might not notice for days. Now you'll know within hours.</p>

<h2>Smarter trip notifications</h2>

<p>Trip notifications now include your daily running total. Instead of just "Trip recorded - 3.2 mi", you see "Trip 4 today, 18.7 mi total". It's a small thing, but it makes your day feel like it's building towards something.</p>

<p>There's also a red badge on your avatar and in the navigation menu showing how many unclassified trips you have. It clears as you work through them.</p>

<h2>The trip that disappeared</h2>

<p>The most important fix in this build came from a bug I hit myself. I drove somewhere, the app recorded 429 GPS coordinates over a 30-minute drive, and when I opened the app the trip was gone. No error message, no notification, nothing.</p>

<p>The diagnostics screen (which we added in 1.0.7) told me exactly what happened. When the app tried to save the trip, it needed to read the authentication token from iOS secure storage. But iOS blocked the keychain access - a security restriction that can happen when the app transitions from background to foreground. The error wasn't classified as a network failure, so the app treated it as an API rejection and deleted the local copy of the trip. 429 coordinates, gone.</p>

<p>The fix has two parts. First, the authentication token is now cached in memory so background trip saves never need to touch the iOS keychain at all. Second, if a trip can't sync because of a local device error (as opposed to the server rejecting it), the trip stays saved on your phone and retries later instead of being deleted.</p>

<p>This was a rare edge case - most of the time the keychain access works fine. But "rare" means it will eventually happen to someone, and losing a trip with no explanation is exactly the kind of thing that makes people stop trusting the app. It won't happen again.</p>

<h2>Other fixes</h2>

<ul>
<li>Fixed a bug where tapping the "Looks like you're driving" notification body could accidentally start a background recording that ran for hours. Tapping now confirms the trip without changing the tracking mode.</li>
<li>Trips that fail to save now log the exact error in the diagnostics screen. If a trip ever goes missing on this build, you'll be able to see why.</li>
<li>Each new recording starts with a clean GPS buffer, so stale coordinates from a previous trip can't bleed into the next one.</li>
</ul>

<h2>Get it now</h2>

<p>Version 1.0.8 is live on the App Store. Open the App Store, search MileClear, and tap Update - or it may have updated automatically if you have auto-updates on.</p>

<p>As always, feedback goes straight to us - use the feedback screen in the app or email <a href="mailto:support@mileclear.com">support@mileclear.com</a>.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "what-real-drivers-taught-me",
    title: "What Real Drivers Taught Me About Building a Mileage Tracker",
    excerpt:
      "Six weeks after launch, MileClear has a growing user base, thousands of miles tracked, and a long list of lessons I could not have learned any other way. Here is what real drivers showed me about what actually matters.",
    date: "13 April 2026",
    author: "Anthony Gair",
    category: "announcement",
    content: `
<p>MileClear launched on the App Store on 1 March 2026. Six weeks later, the user base is growing day by day and retention is improving week on week. Thousands of miles have been tracked, hundreds of trips recorded, and a growing number of drivers have upgraded to Pro.</p>

<p>But the numbers are not the point of this post. What matters is what real drivers have shown me about what actually works, what breaks, and what I got wrong. Every trip and every bug report has taught me something I could not have learned by testing on my own phone.</p>

<h2>People want their mileage tracked. That is it.</h2>

<p>The single biggest lesson from the first six weeks is that users care about one thing above everything else: did my trip record? If the answer is yes, they are happy. If the answer is no, nothing else matters. Not the achievements, not the fuel prices, not the weekly P&L. The trip has to be there.</p>

<p>I built MileClear with a lot of features. <a href="/features">Twelve feature cards</a> on the homepage. Shift mode, gamification, fuel prices, business insights, platform tagging, classification rules. But the feedback I get is almost entirely about trip accuracy. "My drive to the shops did not show up." "Only half my commute was saved." "It says I drove somewhere I did not go."</p>

<p>That told me something important about priorities. Every hour I spend on a new dashboard widget is an hour I am not spending on making the next trip record correctly. The features can wait. The detection engine cannot.</p>

<h2>Background location permission is harder than I expected</h2>

<p>MileClear needs "Always Allow" location permission to detect when you start driving. Without it, the app can only track trips when it is open on screen, which defeats the purpose of automatic tracking.</p>

<p>iOS makes this permission deliberately hard to grant. The system asks twice: first "While Using" then later promotes to "Always." Some users never see the second prompt. Others see it and tap "Keep Only While Using" because it sounds safer. A few have their phone set to never allow background location for any app.</p>

<p>The result is that a meaningful number of users have drive detection that simply does not work, and they do not know why. The <a href="/updates/case-of-the-phantom-trip">diagnostics screen I built in 1.0.7</a> shows the permission state, but users have to know to look at it. For 1.0.8 I need the app to surface this problem proactively instead of silently failing.</p>

<h2>The shift and business side is what matters</h2>

<p>I launched MileClear with both a work mode and a personal mode. Work mode is for gig drivers and self-employed people who need to track business miles for <a href="/faq">HMRC tax deductions</a>. Personal mode is for anyone who just wants to see how much they drive.</p>

<p>Most of my current users are using personal mode. But the users who stick around, the ones who open the app every day, are the ones using shifts. They clock on, do their deliveries, clock off, and check their scorecard. That daily loop is what keeps people coming back.</p>

<p>I am happy about this because the shift system is where the real value is. A personal driver might check their mileage once a week. A gig driver checks it every shift. And every shift they run surfaces another edge case I need to fix. The more people who use shifts, the better the app becomes for everyone.</p>

<h2>About 10 trips have been lost</h2>

<p>I want to be honest about this. Across all users and hundreds of tracked trips, roughly 10 trips have been lost due to bugs in the auto-detection engine. Each one is a drive that someone did, that the app detected, that started recording, and that then silently failed to save.</p>

<p>10 is not a lot in absolute terms. But if one of those 10 was your trip to an important meeting, or a delivery run you needed for your tax return, it is 100% of what matters to you. Every lost trip erodes trust. And trust is the only thing a mileage tracker sells.</p>

<p>The causes are documented in the engineering blog. A <a href="/updates/case-of-the-phantom-trip">geofence bug</a> that consumed the departure anchor. A silent exit in the trip-save code path that swallowed errors without logging them. A buffer that bled stale GPS coordinates from one recording into the next. Each one is fixed or being fixed in <a href="/updates">1.0.8</a>.</p>

<h2>Norman's Kingston Park drive</h2>

<p>One user, Norman, sent me a diagnostics dump that changed how I think about debugging. He drove from his home near Newcastle to Kingston Park, stayed for about 45 minutes, then drove home. The outbound trip did not save. The return trip saved but with the wrong start address.</p>

<p>From the outside, that looks like "the app lost my trip." From the inside, it was five separate bugs interacting. A stale finalize that exited silently. Buffer residue from a previous recording bleeding into the new one. A phantom classifier marking a real drive as indoor GPS drift. A stop-detection timer that did not fire. And timestamps stored in UTC that I was comparing against the user's recollection in BST, which cost me 20 minutes of debugging before I noticed the one-hour offset.</p>

<p>Norman did not know any of that. He just knew his trip was missing. But his diagnostics dump, combined with the <a href="/features">detection event log</a> and a database query against the production trips table, let me reconstruct exactly what happened at every millisecond. Without that tooling, I would still be guessing.</p>

<p>Norman's case is why 1.0.7 added the diagnostics screen and why 1.0.8 adds logging at every exit point in the finalize code path. The next time a trip is lost, the diagnostics will say exactly why.</p>

<h2>Silence is the default</h2>

<p>The biggest surprise of launching is how quiet users are. The vast majority have never sent feedback, reported a bug, or asked a question. The feedback screen in the app has a handful of entries. The support email gets almost nothing.</p>

<p>This is not a complaint. It is a reality of building consumer software. Most people do not report bugs. They just stop using the app. The ones who do report bugs are worth their weight in gold, because for every user who sends a diagnostics dump, there are probably five others who had the same issue and silently moved on.</p>

<p>That is why I built the admin dashboard to track drive detection health across all users. I can see diagnostic verdicts (healthy, warning, error) for every user who has uploaded a dump. I can see who has not driven in weeks. I can see who has background permission issues. I do not have to wait for someone to tell me something is wrong.</p>

<h2>The numbers that matter</h2>

<p>I am not going to share exact user counts. MileClear is early stage and the numbers are still small. What I will say is that the trends are in the right direction. New users are signing up every week without any paid advertising. Retention is improving with each build as detection gets more reliable. And the ratio of active users to total signups is healthy enough to tell me the core product works - people who try it keep using it.</p>

<p>The number I watch most closely is how many users are still tracking trips a month after signing up. That is the real test of whether the app delivers on its promise. If your trips record accurately and your tax deduction ticks up every week, you keep using it. If a trip goes missing, you stop trusting it and you leave. Everything I build is in service of that one metric.</p>

<p>Eight app updates have shipped since launch, from 1.0.0 to 1.0.8. That pace is not slowing down.</p>

<h2>What is next</h2>

<p>The immediate priority for 1.0.8 is trip detection reliability. Every lost trip is a broken promise. The silent finalize bug, the buffer residue bug, the stuck recording bug, and the accidental quick-trip bug are all fixed and shipping in the next build.</p>

<p>After that, the focus shifts to making the app smarter. <a href="/features">Predictive trip classification</a> that learns your schedule and pre-fills the right platform tag. A daily morning briefing notification with your yesterday's stats and weekly goal progress. Fuel price alerts when prices drop near your saved locations. Small things that make the app feel like it knows you.</p>

<p>And eventually, Android. The most common question I get is "is it on Android?" Not yet. But the API, the web dashboard, and the business logic are all platform-independent. The mobile app is the only iOS-specific part. It is on the roadmap.</p>

<p>If you are a driver in the UK and you want a mileage tracker that is built here, priced fairly, and actively improving every week, <a href="https://apps.apple.com/app/mileclear/id6742044832">MileClear is free on the App Store</a>. And if something does not work, tell me. I am listening even when it is quiet.</p>
`,
  },
  {
    slug: "case-of-the-phantom-trip",
    title: "The Case of the Phantom Trip",
    excerpt:
      "Users were reporting trips that never showed up. We built a diagnostics screen to catch the bug red-handed, and what came back was a 5-hour phantom recording caused by two separate geofence bugs we never saw coming.",
    date: "8 April 2026",
    author: "Gair",
    category: "engineering",
    content: `
<p>Last week a tester sent me a message: "only half of my trip was recorded." Then another: "my commute this morning is missing." Then I noticed my own Sunday afternoon drive to the golf club was not in my trip list either.</p>

<p>Three reports, same shape. Auto-detection was broken, and we could not see why from the outside. Time to build a debugger.</p>

<h2>Building the diagnostics screen</h2>

<p>The problem with background bugs on mobile is that by the time a user notices, the context is gone. The app has moved on, iOS has flushed its buffers, and all you have is a report like "I drove to X but nothing saved." You cannot rewind time. You cannot attach Xcode to someone's iPhone in Doncaster.</p>

<p>What you can do is build a log. Since 1.0.5 we have had an internal <code>detection_events</code> table that records every state transition the drive detection engine makes: recording started, skipped, finalized, stale, every one tagged with a reason. It has been sitting there collecting data for weeks. What we did not have was a way to see it without pulling the user's SQLite file via Xcode's device container download, which requires the phone to be plugged in and a matching Xcode release installed.</p>

<p>1.0.7 adds a Drive Detection Diagnostics screen under Profile > Settings. It shows the current state of every relevant piece of data (permissions, task running, active shift, auto-recording flag, buffered coordinates, cooldown) plus the last 50 detection events with plain-English explanations. Crucially, it adds a Share button that exports the whole thing as text you can paste into a message or email.</p>

<p>Within a couple of hours of the new build landing, I had a diagnostic dump from my own phone and one from James, one of our testers. What the logs told us was not what I expected.</p>

<h2>Pattern one: the phantom on the sofa</h2>

<p>The first bug was on my device. After getting home from a short drive at 16:15 and parking up, the app saved the trip cleanly. Three minutes later, while I was sitting on the sofa, the event log showed this:</p>

<pre><code>16:31:41  finalize_saved  (1.92 mi, 6m 53s)
16:34:21  recording_started  (force_start, anchor_exit)
... 54 minutes of nothing ...
17:28:11  finalize_no_coords</code></pre>

<p>The geofence around my home had fired an "exit" event at 16:34. I had not moved. It was pure indoor GPS drift: the iPhone's location estimate jittered past the 200 metre anchor boundary while I was sitting still, iOS concluded I must be leaving, and the app dutifully marked a recording as in progress. 54 minutes later the stale-recording timeout fired and cleaned it up. Fine.</p>

<p>Except that while the phantom recording was sitting there doing nothing, iOS Core Location considered the anchor geofence "consumed". A CLCircularRegion can only fire an exit event once per boundary crossing, and until the user re-enters the region, the OS will not fire another exit. I was still physically inside the region, but my location estimate had briefly flickered outside, fired the exit, then flickered back. The OS was now waiting for me to re-enter before it would consider firing another exit.</p>

<p>About an hour later I actually did leave home, drove to Washington Golf Club, played a round, and drove back. The return trip was recorded perfectly. The outbound leg was completely missing. That 101 minute window of driving had zero detection events. iOS never fired the anchor exit, so the app never woke up to start a recording.</p>

<p><strong>Pattern one: indoor drift fires a false exit that consumes the anchor geofence, and the real departure later goes silently untracked.</strong></p>

<h2>Pattern two was worse</h2>

<p>James's diagnostic dump arrived an hour after mine. He had a different, weirder problem. Reading his events in time order:</p>

<pre><code>10:35:20.178  finalize_called (21 coords)
10:35:20.558  finalize_saved  (6.97 mi, 20m 14s)
10:35:20.630  recording_started  (force_start, anchor_exit)
... 81 minutes of zero coordinates ...
11:56:12      finalize_no_coords</code></pre>

<p>Look at that third line. 72 milliseconds after the trip saved, a new recording started. That is not indoor drift. That is iOS firing an exit event the instant the geofence was registered.</p>

<p>Here is what was happening. When a trip finalizes, the app registers a new departure anchor at the end of the drive so the next trip can be detected instantly from a high-confidence "user has moved away from where they last parked" signal. It was doing this by passing the trip's final GPS coordinate as the anchor centre.</p>

<p>But the code that decides the final GPS coordinate trims off any trailing stationary readings. It is trying to find the "real" end of the drive, not a point 30 seconds into a car park. So the anchor was being registered at a coordinate from maybe 30 seconds before "now". By then James had usually rolled another 50 to 200 metres further into his parking spot. iOS takes the new region, asks "is the user currently inside it?", and answers "no, already 150 metres outside". It fires an exit event immediately, the app starts a phantom recording, and the whole 81 minute cycle begins. James had not moved an inch.</p>

<p>James had this happen twice on the same day. Between the two phantom cycles, 5 hours 24 minutes of drive detection was burned on empty recordings. Any real trip he tried to take during those windows was lost.</p>

<p><strong>Pattern two: registering the departure anchor at a stale trimmed coordinate causes an immediate false exit the moment the new geofence comes online.</strong></p>

<h2>The fix, in three layers</h2>

<p>1.0.7 ships three related fixes.</p>

<p><strong>First</strong>, the trip-finalize path now registers the departure anchor using the user's current position from <code>getLastKnownPositionAsync()</code> instead of the trimmed last coord. Current position is fresh at finalize time because the detection task was just processing a location batch a few seconds ago. Centered on where the phone actually is, the user is inside the new region. iOS does not fire an immediate exit. No more 72 millisecond phantom cycles.</p>

<p><strong>Second</strong>, if a phantom does somehow still fire (from indoor drift, say), the finalize bail-out branches now re-register the anchor at the current position before returning. Previously, a <code>finalize_no_coords</code> result would return early without touching the anchor, leaving iOS with a consumed geofence and no way to fire on the next real departure. Now every finalize path (save, too short, no coords) ends with a fresh anchor registration. iOS re-evaluates the user's position against the new region, finds them inside, and is ready to fire on the next real exit.</p>

<p><strong>Third</strong>, the geofence handler no longer deletes the anchor keys from local state the moment an exit fires. Previously it did, which meant any subsequent call to re-register geofences would forget about the anchor entirely. The keys now persist until explicitly replaced.</p>

<h2>A bonus fix from the same investigation</h2>

<p>While I was in the detection code I found something else. A defensive purge added earlier was supposed to protect against stuck recordings from crashes by dropping any coordinates older than 30 minutes from the buffer. Good intent, terrible implementation: on any drive longer than about 25 minutes, the first half of the trip's coordinates were older than 30 minutes by the time finalize ran, and the purge would wipe them out. A 45 minute commute would save as its last 20 minutes only. That is the "only half of my trip was recorded" report.</p>

<p>The fix: replace the blanket age-based purge with gap detection. Walk the buffer looking for large time gaps between consecutive coordinates. A real stuck state from a crash looks like "10 coordinates from a week ago, then 15 coordinates from today, no coordinates in between" - a massive gap. A legitimate 45 minute drive looks like "900 coordinates, each a few seconds apart, no gaps". Trim at the gap if there is one, keep the whole buffer otherwise. A 45 minute drive with no gaps saves as a 45 minute drive.</p>

<h2>What to expect</h2>

<p>If you install 1.0.7 and drive normally for a day or two, three things should be different:</p>

<ol>
<li>Long drives save the whole drive, not just the tail.</li>
<li>Your afternoon trips record properly even if you sat at home for a couple of hours first.</li>
<li>The Drive Detection Diagnostics screen in Profile > Settings will show zero phantom exits in a healthy week. If it ever shows some, send me the screenshot.</li>
</ol>

<h2>Thank you</h2>

<p>None of this would have been caught from my own device alone. What moved this bug from "something feels off" to "root cause, exact line numbers, three layered fixes" was two testers spending twenty minutes each taking screenshots of their diagnostic dumps and sending them over.</p>

<p>If you are on TestFlight and something feels wrong with auto-detection, please: Profile > Settings > Diagnostics, take a screenshot, send it in. The new screen is designed to be a one-glance bug report. The verdict banner tells you what MileClear thinks is wrong. The problems card lists everything suspicious with a plain-English explanation. Even if you cannot tell what it means, I can.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "your-odometer-was-right-fixing-auto-trip-distance",
    title: "Your Odometer Was Right: Fixing Auto Trip Distance in 1.0.6",
    excerpt:
      "Several testers told us their auto-tracked trips were reading short of the real distance. We dug into the code, found the bug, and 1.0.6 fixes it. Here is what was going wrong and what we changed.",
    date: "7 April 2026",
    author: "Gair",
    category: "engineering",
    content: `
<p>Over the past couple of weeks we have heard the same thing from multiple testers: "MileClear says I drove 10.4 miles but my odometer says 12." That is not a small discrepancy. If you are claiming HMRC mileage for self-employed work, under-reporting by 5-10% on every trip adds up to real money over a tax year.</p>

<p>We pulled the code apart, found the root cause, and shipped a fix in 1.0.6. Here is what was going wrong.</p>

<h2>Why GPS undercounts winding roads</h2>

<p>When MileClear records an auto trip, it gets a GPS point roughly every 50 metres. To calculate the total distance, the old code drew a straight line between each pair of consecutive points and added them all up.</p>

<p>This works fine on a dead straight road. But on a winding country lane or a route with lots of gentle curves, the straight line between two GPS points is shorter than the road you actually drove. Mathematicians call this the "chord versus arc" problem. Each little chord shaves a couple of metres off the real distance. Over a 10 mile drive down B-roads, those shavings can add up to half a mile lost.</p>

<p>The effect is worst on:</p>
<ul>
<li>Motorway exits, slip roads, and roundabouts</li>
<li>Country lanes with lots of bends</li>
<li>Hilly routes where samples cluster on flat sections</li>
</ul>

<p>Straight motorway driving was fine because the chords hugged the road. Dense city driving was fine because the samples were close together. But if you earn a living on the rural and suburban roads most gig workers and couriers see every day, you were losing miles.</p>

<h2>The fix: cross-checking against real road data</h2>

<p>Starting in 1.0.6, every auto-detected trip is now cross-checked against UK road data. For each trip we calculate two things: the GPS sum (what we were doing before) and the actual driving distance from start to end along real roads. Whichever is larger wins.</p>

<p>This gives you the best of both worlds:</p>

<ul>
<li>On a simple A to B trip on a winding road, the road data corrects the GPS undercount.</li>
<li>On a trip with detours or multiple stops, the GPS sum captures the full path you actually took.</li>
<li>If the road data lookup fails for any reason (no signal, server blip), we fall back to the GPS sum. Your trip is still saved and still accurate to within a few percent.</li>
</ul>

<p>In testing we saw trips that were previously reading 10-11% short now matching the odometer within 2-3%. For HMRC purposes that is the difference between a defensible mileage claim and one that looks suspiciously round.</p>

<h2>The other complaint: trips not starting at all</h2>

<p>Alongside the distance reports we kept hearing "sometimes my trips are not starting, or they are starting a quarter mile down the road." Separate bug, separate cause.</p>

<p>The old detection logic needed to see two consecutive bursts of driving-speed GPS readings before it would mark a trip as in progress. This was a safety measure to avoid false triggers from GPS drift and bad cold-start fixes. But it cost you the first 400 metres or so of every trip, because the app was still waiting for confirmation.</p>

<p>1.0.6 changes this in three ways:</p>

<ul>
<li><strong>Leaving a saved location is now a high-confidence trip start.</strong> If you save your home, work, or a regular depot in MileClear, the app starts recording the moment you cross the geofence boundary. No more waiting for a second confirmation.</li>
<li><strong>A single fast reading is enough.</strong> If the GPS reports 25 mph or faster with decent accuracy on one reading, we skip the two-burst gate entirely and start recording immediately. Nothing fakes highway speeds.</li>
<li><strong>Cold-start GPS is trusted sooner.</strong> When you pull out of a garage or a shaded driveway, your first location fix might have 60-75 metres of accuracy while the chip is still settling. Previously we ignored those readings. Now we trust them for speed detection purposes.</li>
</ul>

<p>The net effect is that the first mile of your trip is captured properly. If your commute goes straight onto a motorway, the motorway entry is in the trip, not the second junction.</p>

<h2>A few smaller fixes</h2>

<ul>
<li>If iOS downgrades your location permission (it happens, especially after iOS updates), the app now reminds you within 4 hours instead of waiting a full day. Permission issues were one of the stealthier reasons trips were going missing.</li>
<li>The Trip Complete screen now formats long trips as HH:MM:SS. A bug in the formatter meant a 2 hour trip was displaying as a runaway four-digit minute counter, which was confusing at best.</li>
<li>We added internal event logging across the entire auto-trip detection path. If you report a wrong or missing trip from 1.0.6 onwards, we can look at exactly what the detection engine was doing at that moment instead of guessing.</li>
</ul>

<h2>What we are still investigating</h2>

<p>We are not calling auto-trip detection "done". The next edge cases on our list:</p>

<ul>
<li>Stop-start residential driving where the app never sees a single high-speed reading.</li>
<li>Trips that begin inside underground car parks where GPS is blind for the first few minutes.</li>
<li>Very short errands (under half a mile) that we currently filter out, which a few users have asked to be logged anyway.</li>
</ul>

<p>If you hit any of these or anything else, please use the Feedback button in your profile. With the new diagnostics we can actually debug what happened, not just shrug.</p>

<h2>Thank you</h2>

<p>Half the job of shipping software is hearing about the problems. Every person who took the time to say "my trip was wrong" made this fix happen. Particularly to the testers who included rough times and locations, that is what lets us narrow things down fast. Thank you.</p>

<p>1.0.6 is rolling out to TestFlight now. It will hit the App Store after a few days of beta testing. If you are on TestFlight, please drive a familiar route and check the distance against your odometer. We want to know if we got it right.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "happy-easter-from-mileclear",
    title: "Happy Easter from MileClear",
    excerpt:
      "A quick thank you to our beta testers, a look at what we shipped this week, and a reminder about the new tax year starting tomorrow.",
    date: "5 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Happy Easter from the MileClear team. Whether you're on the road today, spending the weekend with family, or doing both - we hope you're having a good one.</p>

<h2>A quick thank you</h2>

<p>We launched MileClear just over a month ago and the feedback from our beta testers has been brilliant. Every bug report, feature suggestion, and "me too" vote directly shapes what gets built next. If you've taken the time to report something or share an idea, thank you - it genuinely makes a difference.</p>

<p>Speaking of which, you can now see our replies directly on your feedback in the app. We've also added a Known Issues section at the top of the feedback screen so you always know what bugs we're aware of and where we are with fixing them. If something affects you, tap "Me too" and we'll prioritise accordingly.</p>

<h2>What we shipped this week</h2>

<p>Version 1.0.4 went live on the App Store this week, and 1.0.5 is already in TestFlight. Here are the highlights:</p>

<ul>
<li><strong>Smarter trip detection</strong> - Multi-stop journeys now stay as one trip. Fuel stops, school drop-offs, and drive-throughs no longer split your route into fragments. We doubled the stop timeout and added GPS drift filtering so parked cars don't generate phantom mini-trips.</li>
<li><strong>Trip merging</strong> - If a trip does split, consecutive segments are automatically merged back together.</li>
<li><strong>Live Activity fixes</strong> - The timer no longer resets to zero when you switch apps, and tapping the lock screen widget now opens the app properly.</li>
<li><strong>Notification tap opens your trip</strong> - Tapping the "Are you driving?" notification now opens the live trip map showing your full route from the moment we detected you driving.</li>
</ul>

<h2>New tax year starts tomorrow</h2>

<p>The 2025-26 tax year ends today, 5 April. The new tax year begins tomorrow. If you haven't checked your mileage records for the year that's ending, now is the time. Open MileClear, check for any unclassified trips, and export your records while everything is fresh.</p>

<p>If you're starting fresh for 2026-27, you're in a great position. Every trip from tomorrow is a clean slate. Set up your vehicle, save your regular locations, and let MileClear learn your routes over the first few weeks. By the end of April, most of your trips will classify themselves.</p>

<p>HMRC rates for 2026-27 remain the same: 45p per mile for the first 10,000 business miles (cars and vans), 25p after that, and 24p flat for motorbikes.</p>

<h2>What's next</h2>

<p>We're working on business expense tracking so your weekly P&L shows real costs instead of estimates, receipt scanning for fuel and maintenance, and deeper analytics. More on all of that soon.</p>

<p>Enjoy the bank holiday. And if you are driving this weekend, at least your miles are being tracked.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "why-we-built-smart-classification",
    title: "Why We Built Smart Classification (And Why You'll Never Need to Swipe)",
    excerpt:
      "Most mileage apps make you classify every single trip manually. We think you shouldn't have to classify at all. Here's how MileClear learns your patterns and does it for you.",
    date: "28 March 2026",
    author: "Gair",
    category: "engineering",
    content: `
<p>Every mileage tracking app has the same problem: you drive somewhere, the app records the trip, and then you have to tell it whether it was business or personal. Every. Single. Time.</p>

<p>Some competitors solve this with a swipe gesture. Left for business, right for personal. It's satisfying the first few times. It's tedious by trip number fifty. And by trip number two hundred, most people stop doing it altogether. Their mileage log fills up with unclassified trips, their HMRC deduction is wrong, and the whole point of tracking is undermined.</p>

<p>We think the answer isn't a better swipe. It's no swipe at all.</p>

<h2>The insight: you already know</h2>

<p>Think about your driving for a second. If you're a Deliveroo rider, you probably drive the same route to the same area every shift. If you're an Uber driver, you leave from home, drive to a busy area, and come back. If you visit clients, you drive to the same offices on the same days.</p>

<p>Your driving is far more predictable than you think. And if a human can look at your trip history and say "obviously that's a work trip", so can software - it just needs enough context.</p>

<h2>Five signals, one answer</h2>

<p>MileClear's classification engine checks five things, in order, every time an auto-detected trip is recorded:</p>

<ol>
<li><strong>Were you on a shift?</strong> If you started a shift in MileClear and the trip happened during it, it's business. 100% confidence. No question.</li>
<li><strong>Do your classification rules match?</strong> You can set rules like "Monday to Friday, 6am to 2pm = business" or "any trip starting from my depot = business". If a rule matches, the trip is classified automatically.</li>
<li><strong>Has this route been classified before?</strong> If you've classified the same route (within 300 metres of the same start and end points) three times with the same answer, MileClear remembers. The fourth time, it's automatic.</li>
<li><strong>Is the trip near a saved location?</strong> If you've saved your workplace or depot as a location, trips starting or ending there get a suggested classification.</li>
<li><strong>Does it fall within your work schedule?</strong> If you've set up a work schedule, trips during those hours get a suggestion.</li>
</ol>

<p>The engine evaluates these from top to bottom and stops at the first confident match. Shifts and rules auto-classify immediately. Route learning auto-classifies after three confirmations. Saved locations and work schedules produce suggestions that you confirm with one tap.</p>

<h2>When it can't decide, you get buttons - not a form</h2>

<p>For trips where the engine isn't confident enough to auto-classify, we don't dump you into a classification screen. Instead, the "Trip recorded" notification on your lock screen gets two buttons: <strong>Business</strong> and <strong>Personal</strong>. Tap one. Done. You never opened the app.</p>

<p>And that tap isn't wasted - it feeds back into the route learning system. Classify that route three times from your lock screen, and the fourth time it's automatic.</p>

<h2>When you fall behind, batch classify</h2>

<p>Life happens. Maybe you ignored your notifications for a week and now you've got twenty unclassified trips. Competitors would make you swipe through each one individually.</p>

<p>MileClear groups your unclassified trips by route. If you drove the same route five times this week, they're grouped together with a header showing the route, the dates, and the total distance. Tap "Business (5)" and all five are classified in one go. The route is learned. You're caught up in seconds, not minutes.</p>

<h2>The goal: invisible classification</h2>

<p>The ideal mileage tracker is one where you never think about classification. You drive, the app records, and when tax time comes your trips are already sorted. That's what we're building towards.</p>

<p>Right now, the system gets smarter every time you classify a trip. After a few weeks of normal use, most regular routes are learned. Your work hours are set. Your saved locations are configured. The percentage of trips that need manual attention drops rapidly.</p>

<p>We're not there yet for every edge case. A trip to a new client, a one-off delivery to an unusual address, a personal errand in the middle of a work day - these still need a tap. But the everyday commute to the depot, the regular route to the sorting centre, the drive home after a shift - those should just work.</p>

<h2>Why this matters for your tax return</h2>

<p>The biggest risk with mileage tracking isn't that the GPS is inaccurate. It's that you stop classifying. An unclassified trip is a trip that doesn't count towards your HMRC deduction. If you drove 15,000 business miles but only classified 8,000 of them, you're leaving roughly 3,150 in unclaimed deductions on the table - that's over 600 in tax at the basic rate.</p>

<p>The classification UX isn't a nice-to-have. It's the difference between the app actually saving you money and the app being a GPS logger you forget about.</p>

<p>Try it out. Set up a classification rule, save your work location, and drive your normal routes for a week. You'll be surprised how quickly the inbox empties itself.</p>

<p>MileClear is free to download from the <a href="https://apps.apple.com/gb/app/mileclear-mileage-tracker-uk/id6759671005">App Store</a>.</p>
    `.trim(),
  },
  {
    slug: "tax-year-ends-5-april-mileage-checklist",
    title: "Tax Year Ends 5 April - Here's Your Mileage Checklist",
    excerpt:
      "The 2025-26 tax year ends on 5 April. Here's a quick checklist to make sure your mileage records are ready before the deadline.",
    date: "1 April 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>The 2025-26 UK tax year ends on 5 April. If you've been driving for work - whether that's Uber, Deliveroo, Amazon Flex, courier work, or any other self-employed driving - now is the time to get your mileage records in order.</p>

<p>You don't need to file your Self Assessment until January 2027, but the tax year boundary is what matters for your numbers. Any business miles driven after 5 April count towards next year's return, not this one.</p>

<p>Here's a quick checklist to make sure you're sorted.</p>

<h2>1. Check your trip classifications</h2>

<p>Open MileClear and go to your Trips tab. Filter by "Unclassified" - these are trips the app recorded but you haven't confirmed as business or personal yet. Go through them and classify each one. It only takes a tap per trip, but it makes a big difference to your deduction total.</p>

<p>If you're not sure whether a trip counts as business, the general rule is: if you were driving to earn money (heading to a pickup, driving between deliveries, going to a depot), it's business. Driving from home to your first job of the day is commuting and doesn't count - but once you're "on the clock", everything in between does.</p>

<h2>2. Check your vehicle details</h2>

<p>HMRC rates differ by vehicle type. Cars and vans get 45p/25p, motorbikes get 24p flat. Make sure your vehicle in MileClear is set to the right type - it affects every calculation.</p>

<p>If you changed vehicles during the year, make sure both are in the app and trips are assigned to the correct one.</p>

<h2>3. Fill in any gaps</h2>

<p>Did you do any business trips that MileClear didn't record? Maybe your phone was dead, or you hadn't installed the app yet at the start of the tax year. You can add manual trips with the date, start/end locations, and distance. MileClear will calculate the route distance for you if you enter the addresses.</p>

<p>It's better to add them now while you remember than to try and reconstruct them in January.</p>

<h2>4. Review your totals</h2>

<p>Go to your dashboard and check the tax year summary. You should see:</p>
<ul>
<li>Total business miles</li>
<li>Total personal miles</li>
<li>Your HMRC deduction amount</li>
</ul>

<p>Does the business mileage look about right for the year? If you drove 200 miles a week for work across 48 weeks, you'd expect roughly 9,600 business miles. If your number is wildly different, some trips might be misclassified or missing.</p>

<h2>5. Export your records</h2>

<p>Once everything looks right, export your records. MileClear Pro lets you download:</p>
<ul>
<li><strong>CSV</strong> - for your accountant or bookkeeping software</li>
<li><strong>PDF Trip Report</strong> - a detailed log of every trip with dates, times, routes, and distances</li>
<li><strong>HMRC Self Assessment PDF</strong> - a summary with your total deduction, broken down by vehicle and month</li>
</ul>

<p>Save these somewhere safe. If HMRC ever asks questions about your mileage claim, this is your evidence.</p>

<h2>The numbers that matter</h2>

<p>As a reminder, the HMRC mileage rates for 2025-26 are:</p>
<ul>
<li><strong>Cars and vans:</strong> 45p per mile (first 10,000 miles), 25p per mile (after 10,000)</li>
<li><strong>Motorbikes:</strong> 24p per mile (flat rate)</li>
</ul>

<p>These rates cover fuel, wear and tear, insurance, and servicing - you can't claim those separately if you're using the mileage allowance.</p>

<p>If you haven't been tracking your mileage yet, it's not too late to start for the new tax year beginning 6 April. Download MileClear, add your vehicle, and every trip gets recorded automatically from day one.</p>

<p>Get started free at <a href="https://mileclear.com">mileclear.com</a>.</p>
`,
  },
  {
    slug: "5-things-uber-drivers-should-track-for-tax",
    title: "5 Things Every Uber Driver Should Track for Tax (That Most Don't)",
    excerpt:
      "Most gig drivers know about mileage. But there are at least four other things you can claim that most people completely miss - and they add up fast.",
    date: "23 March 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>If you drive for Uber, Deliveroo, Amazon Flex, or any other gig platform in the UK, you're self-employed. That means you file a Self Assessment tax return, and you can deduct legitimate business expenses from your earnings before you pay tax on them.</p>

<p>Most drivers know about mileage. But there are at least four other things you can claim that most people completely miss - and they add up to hundreds of pounds a year.</p>

<h2>1. Mileage (obviously)</h2>

<p>This is the big one. HMRC lets you claim 45p per mile for the first 10,000 business miles in a tax year, then 25p per mile after that. If you're on a motorbike, it's 24p per mile flat.</p>

<p>Let's say you drive 12,000 business miles in a year. That's:</p>
<ul>
<li>10,000 miles x 45p = £4,500</li>
<li>2,000 miles x 25p = £500</li>
<li><strong>Total deduction: £5,000</strong></li>
</ul>

<p>That £5,000 comes off your taxable income. If you're a basic rate taxpayer (20%), that's £1,000 back in your pocket. And you don't need receipts - just a log of your business trips with dates, distances, and start/end points.</p>

<p>The catch? You need to actually track it. HMRC won't accept a guess. You need a proper mileage log, which is exactly what MileClear does automatically in the background.</p>

<h2>2. Your phone bill</h2>

<p>You can't do gig work without a phone. The Uber app, Google Maps, the Deliveroo rider app - they all run on your phone, and you're paying for that phone and the data it uses.</p>

<p>If you use your phone for both personal and business, you can claim the business proportion. A common approach is to estimate the split - if you reckon 60% of your phone usage is for work (maps, rider apps, customer calls), you can claim 60% of your monthly bill.</p>

<p>On a £30/month contract, that's £216 a year. Not huge on its own, but it adds up when you combine it with everything else.</p>

<h2>3. Car cleaning and valeting</h2>

<p>If you drive passengers (Uber, Bolt) or deliver food, keeping your car clean is a business expense. Regular car washes, interior valeting, air fresheners - all claimable as long as they're for the business vehicle.</p>

<p>Even if you're just doing deliveries, a monthly wash at £8 is nearly £100 a year. Keep the receipts or bank statements.</p>

<h2>4. Parking and tolls</h2>

<p>Any parking charges or road tolls you pay while working are fully deductible. The Dartford Crossing, congestion charges, parking at a collection point - all of it counts.</p>

<p>This one catches out a lot of drivers because parking charges feel like they're just part of driving. They are - but they're a deductible part. The key is keeping a record. A photo of the parking receipt or a note in your mileage log is enough.</p>

<p>Note: parking fines and speeding tickets are NOT deductible. HMRC draws the line at penalties.</p>

<h2>5. Equipment and accessories</h2>

<p>Phone mounts, charging cables, delivery bags, hi-vis vests, phone cases - anything you buy specifically for your gig work is a business expense. If you bought a thermal bag for Deliveroo deliveries, that's claimable. If you bought a phone mount so you can see Google Maps while driving, that's claimable too.</p>

<p>Some drivers also claim for dashcams on the basis that they protect them while working. This is a grey area - talk to an accountant if you want to be sure - but it's worth knowing about.</p>

<h2>The bottom line</h2>

<p>Most gig drivers only track mileage - if they track anything at all. But when you add up your phone bill, car cleaning, parking, and equipment, you could easily be looking at an extra £500-800 in deductions per year on top of your mileage.</p>

<p>At the 20% basic tax rate, that's £100-160 extra back from HMRC. Not life-changing, but not nothing either - especially when you're already doing the work.</p>

<p>The mileage is the biggest piece by far, and it's the one most people get wrong because they don't track it properly. MileClear handles that automatically - your phone records every business trip in the background, calculates the HMRC deduction, and gives you a ready-to-export report when Self Assessment time comes around.</p>

<p>Start tracking for free at <a href="https://mileclear.com">mileclear.com</a>, or download the app from the App Store.</p>
`,
  },
  {
    slug: "why-i-built-mileclear",
    title: "Why I Built MileClear",
    excerpt:
      "Most mileage apps are American, confusing, and way too expensive for someone doing a few Deliveroo shifts a week. I wanted something that actually made sense for UK drivers.",
    date: "15 March 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>I built MileClear because I couldn't find a mileage tracker that did what I actually needed.</p>

<p>A couple of years back, I was doing some delivery driving on the side  - nothing serious, a few Deliveroo and Amazon Flex shifts a week. I knew I could claim mileage back against my tax bill (45p per mile, first 10,000 miles  - it adds up faster than you'd think), but keeping a proper log was a nightmare. I tried the popular apps. Most of them were clearly designed for American users: they talked about "IRS rates" and "Schedule C", the UI looked like it hadn't been touched since 2018, and they wanted £8–12 a month for basic export functionality. For someone doing part-time gig work, that felt completely wrong.</p>

<h2>The UK gig worker gap</h2>

<p>What struck me was how specifically UK this problem is. Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD  - we have a huge population of self-employed drivers who are leaving real money on the table because they don't track their mileage properly. And HMRC is pretty generous about it: you don't need receipts, you don't need to justify anything. You just need a log of your business trips with dates, start and end points, and distances.</p>

<p>That's a solved problem, technically. GPS can do all of it automatically. But none of the existing apps were thinking about the UK gig worker specifically. There was no concept of "platforms"  - you couldn't tag a trip as an Uber job versus a personal run to the shops. There was no shift model that matched how gig work actually happens (you clock on, do several jobs, clock off  - that's a shift). And the pricing was just wrong for the market.</p>

<h2>What I wanted to build</h2>

<p>MileClear started as a notes file. My rough spec was:</p>

<ul>
  <li>Free trip tracking  - no artificial limits on the core feature</li>
  <li>Platform tags  - Uber, Deliveroo, Amazon Flex, etc., so you can see which platforms are worth your time</li>
  <li>Shift model  - clock on, do your jobs, clock off</li>
  <li>HMRC-native  - UK tax year (6 April boundary), pence not dollars, 45p/25p rates baked in</li>
  <li>Exports behind a paywall, but a cheap one  - £4.99/month felt right</li>
  <li>Offline first  - your GPS data shouldn't need an internet connection</li>
</ul>

<p>The gamification came later, and honestly it's one of my favourite parts of the app now. Streaks, achievements, personal records  - it sounds silly for a tax tool, but it actually works. Tracking mileage is one of those habits that's easy to forget about until it's too late (hello, January scramble). Having a streak to protect keeps you honest.</p>

<h2>The technical reality of building this solo</h2>

<p>Building a production iOS app solo is humbling. Background GPS tracking alone has about fifteen different failure modes across different iPhone models and iOS versions. Auto-trip detection  - where the app figures out you're driving without you tapping anything  - took months to get right. I'm still tuning it.</p>

<p>I made a deliberate choice to keep the stack boring: React Native with Expo, Fastify API, MySQL, no fancy infrastructure. Self-hosted on a cPanel server. The whole thing costs less than a coffee a month to run. That matters when you're bootstrapping something and you don't know if it's going to work.</p>

<h2>What's next</h2>

<p>MileClear is live on the App Store now, in early access. The core loop  - track trips, see your HMRC deduction, export when you need to  - works well. I'm adding an annual plan, improving the auto-trip detection, and listening carefully to what beta testers actually want before I build anything else.</p>

<p>If you're a UK driver of any kind  - gig worker, sole trader, employee who uses their personal car for work  - and you're not tracking your mileage, you're leaving money with HMRC that's legally yours. MileClear is free to try. Give it a go.</p>
    `.trim(),
  },
  {
    slug: "how-auto-trip-detection-works",
    title: "How Auto-Trip Detection Works",
    excerpt:
      "Getting an app to reliably know you're driving  - without draining your battery or triggering false positives on the sofa  - is harder than it sounds. Here's how MileClear does it.",
    date: "18 March 2026",
    author: "Gair",
    category: "engineering",
    content: `
<p>One of the trickiest problems in a mileage tracker is answering a deceptively simple question: "Is this person driving right now?"</p>

<p>Get it wrong one way and you're firing off notifications to someone sitting on their sofa watching TV. Get it wrong the other way and you're missing real trips, which is the entire point of the app. And all of this has to run on a phone that's trying to conserve battery, with iOS doing its best to kill background processes.</p>

<h2>The basic approach</h2>

<p>MileClear uses iOS's significant location change monitoring as the trigger. This is a low-power mode that wakes the app when the phone moves roughly 500 metres. The moment that happens, we check speed. If the phone is moving faster than about 15mph, we assume driving has started and begin recording coordinates at tighter intervals (100 metres).</p>

<p>Coordinates are buffered silently  - no notification, no UI, nothing. We're just collecting GPS breadcrumbs in the background.</p>

<h2>When does a trip end?</h2>

<p>This is where it gets more nuanced. We don't end a trip the moment you stop  - you might be at a red light, or queuing at a McDonald's drive-through, or briefly parked to drop off a package. Instead, we wait for five consecutive minutes of movement below 2.2mph (about walking pace).</p>

<p>Once that threshold is hit, we finalise the trip: calculate the distance, record the start and end times, save it to the local SQLite database, and mark it as "unclassified". It lands in your trip inbox waiting for you to tag it as business or personal.</p>

<h2>The Driver/Passenger problem</h2>

<p>Pure GPS detection can't tell the difference between you driving and you sitting in the back of an Uber. Both look identical from a location perspective: fast movement, then stopped.</p>

<p>The solution is a lock-screen notification. When MileClear detects a trip starting, it fires a notification with two action buttons: "Driver" and "Passenger". You can tap one without even unlocking your phone. If you're the passenger, the recording is cancelled and a 20-minute cooldown starts so you're not pestered again.</p>

<p>If you don't respond at all, the trip still gets recorded  - we'd rather have a false positive you can delete than miss a real business journey.</p>

<h2>GPS accuracy filtering</h2>

<p>Raw GPS is noisy. A phone sitting still on a desk will drift by 10–15 metres. When you're doing speed calculations from sequential coordinates, that drift can make a stationary phone look like it's moving at 5mph  - enough to cause false positives if you're not careful.</p>

<p>We filter out any location fix where iOS reports accuracy worse than 65 metres horizontal. We also require two consecutive readings above the speed threshold before registering movement. One blip doesn't start a trip.</p>

<h2>Quiet hours</h2>

<p>Nobody wants a phone notification at 2am because iOS decided to wake up the location service. Detection notifications are suppressed between 10pm and 7am. Trips still get recorded silently during those hours  - the quiet hours only affect the Driver/Passenger prompt.</p>

<h2>The battery reality</h2>

<p>Background GPS is the number one complaint in every mileage app review section. MileClear uses significant location changes (not continuous GPS) when not actively recording, which is very low power. Even during active recording, 100-metre intervals are much less aggressive than the 50-metre intervals used during manual shift tracking.</p>

<p>The honest answer is: it does use some battery. Any app that tracks your location uses battery. But "significant location change" monitoring adds maybe 2–5% battery drain per day in practice  - about the same as having Wi-Fi enabled. We're constantly tuning this.</p>

<h2>What doesn't work yet</h2>

<p>Train journeys are a known issue. A fast train exceeds the speed threshold and looks exactly like motorway driving from GPS. We're experimenting with CoreMotion activity recognition (the API that knows whether you're walking, cycling, or in a vehicle) to filter these out. It's not in the app yet, but it's coming.</p>

<p>If you spot a false positive, long-press the trip in your inbox and delete it. It takes two seconds and helps me understand where the thresholds need tuning.</p>
    `.trim(),
  },
  {
    slug: "hmrc-mileage-deduction-guide",
    title: "Understanding Your HMRC Mileage Deduction",
    excerpt:
      "If you drive for work in the UK  - whether that's gig work, visiting clients, or using your personal car for your employer  - you can claim up to 45p per mile back from HMRC. Here's exactly how it works.",
    date: "20 March 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>The HMRC Approved Mileage Allowance Payment (AMAP) scheme is one of the most straightforward tax reliefs available to UK drivers  - but a surprising number of people who are entitled to it never claim it. This guide explains who qualifies, what the rates are, what counts as business mileage, and how to calculate your deduction.</p>

<h2>The rates</h2>

<p>For the 2025–26 tax year, HMRC's approved mileage rates are:</p>

<ul>
  <li><strong>Cars and vans:</strong> 45p per mile for the first 10,000 business miles, 25p per mile after that</li>
  <li><strong>Motorcycles:</strong> 24p per mile (flat rate, no threshold)</li>
  <li><strong>Bicycles:</strong> 20p per mile</li>
</ul>

<p>These rates have been frozen since 2011, which is a mild annoyance given that fuel costs have roughly doubled since then  - but they're still a meaningful deduction, especially if you're putting in high mileage.</p>

<h2>What does "business mileage" actually mean?</h2>

<p>This is where a lot of people get confused. The key rule is that business mileage is travel you do in the course of your work  - it is <em>not</em> your commute.</p>

<p>For a typical employee: driving from your home to your regular office is commuting and you can't claim it. But driving from your office to visit a client, or from one work site to another, counts as business mileage.</p>

<p>For self-employed gig workers, the picture is simpler. If you're an Uber driver, Deliveroo rider, or Amazon Flex courier, <strong>every mile you drive during your working shift is business mileage</strong>  - including deadmiles (driving to pick up a delivery, for example). Your home is your base of operations, so journeys from home to your first job and from your last job home can also qualify.</p>

<h2>The 10,000-mile threshold</h2>

<p>The threshold applies per tax year, which in the UK runs from 6 April to 5 April. If you hit 10,000 business miles before 5 April, every mile after that is claimed at 25p instead of 45p.</p>

<p>At 45p per mile, 10,000 miles gives you a £4,500 deduction. That's real money. At 25p for the miles beyond that, each additional 1,000 miles is worth £250 off your tax bill.</p>

<h2>How does the deduction actually work?</h2>

<p>The mileage deduction reduces your taxable profit, not your tax bill directly. If you're a basic rate taxpayer (20%), a £4,500 mileage deduction reduces your tax bill by £900. If you're a higher rate taxpayer (40%), it's £1,800.</p>

<p>On your Self Assessment return, you enter your total business miles on the Self-employment pages. HMRC applies the approved rates automatically. You don't need to show your calculations  - you just need to have records if they ask.</p>

<h2>What records do you need to keep?</h2>

<p>HMRC doesn't prescribe a specific format, but your mileage log should include:</p>

<ul>
  <li>Date of each journey</li>
  <li>Start and end locations (postcodes are fine)</li>
  <li>Business purpose (e.g. "Uber shift", "client visit", "Amazon Flex route")</li>
  <li>Miles driven</li>
</ul>

<p>You need to keep these records for at least five years after the relevant tax return deadline. HMRC can ask to see them in an investigation, and a handwritten log in a notebook is perfectly acceptable  - though GPS evidence from an app like MileClear is considerably more convincing.</p>

<h2>Employees vs self-employed</h2>

<p>If you're an <strong>employee</strong> who uses their personal vehicle for work, your employer can pay you up to the AMAP rates tax-free. If your employer pays you less than the approved rate (or nothing), you can claim the difference as a <em>Mileage Allowance Relief</em> deduction  - same calculation, just a different box on your Self Assessment return.</p>

<p>If you're <strong>self-employed</strong>, you claim it as a business expense under the simplified expenses method (which is what the AMAP rates are). You can't also claim actual fuel costs and vehicle expenses separately  - it's one or the other. For most drivers, AMAP wins.</p>

<h2>How MileClear calculates it</h2>

<p>Every trip you classify as "business" in MileClear gets counted towards your annual total. The app tracks your cumulative business mileage per tax year across all your vehicles, applies the 45p rate until you hit 10,000 miles, then switches to 25p automatically. You can see your running deduction total on the Work dashboard at any time.</p>

<p>When you export at the end of the year, the PDF includes a vehicle-by-vehicle breakdown of your business miles, the deduction calculations, and the tax year totals  - everything you need for your Self Assessment return in one document.</p>

<h2>One more thing</h2>

<p>If you haven't been tracking your mileage but you do drive for work, it's worth going back and estimating what you might have been owed for previous tax years. You can amend a Self Assessment return up to four years after the original filing deadline. Just something worth knowing.</p>
    `.trim(),
  },
];

// ----------------------------------------------------------------
// Helper functions
// ----------------------------------------------------------------

export type Post =
  | { type: "blog"; post: BlogPost }
  | { type: "release"; note: ReleaseNote };

/** All blog posts, newest first (by array order). */
export function getAllBlogPosts(): BlogPost[] {
  return BLOG_POSTS;
}

/** A single blog post by slug, or undefined if not found. */
export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** All release notes (newest first by array order). */
export function getAllReleaseNotes(): ReleaseNote[] {
  return RELEASE_NOTES;
}

// ----------------------------------------------------------------
// Guides - evergreen reference pages, separate from time-sensitive Blog
// ----------------------------------------------------------------
export const GUIDES: Guide[] = [
  {
    slug: "hmrc-mileage-rates",
    title: "HMRC Mileage Rates for Cars and Vans",
    excerpt:
      "The 45p/25p approved rates with a worked example: 18,800 miles a year reaches a £6,700 tax deduction. Covers sole traders, employees, and limited company directors.",
    category: "tax",
    readTime: "5 min read",
  },
  {
    slug: "business-mileage-guide",
    title: "The UK Business Mileage Guide",
    excerpt:
      "Everything a UK driver needs to know about tracking business miles for tax. Why the fuel-AND-mileage double claim is the trap most drivers fall into, and how to keep a log HMRC will accept.",
    category: "tracking",
    readTime: "8 min read",
  },
  {
    slug: "what-counts-as-business-mileage",
    title: "What Counts as Business Mileage?",
    excerpt:
      "Eight real-world situations with plain answers: home-to-first-job, trips between sites, training, supplier runs, client lunches, charity volunteering, and the school-run detour.",
    category: "rules",
    readTime: "6 min read",
  },
];

export function getAllGuides(): Guide[] {
  return GUIDES;
}

export const GUIDE_CATEGORY_LABELS: Record<Guide["category"], string> = {
  tax: "Tax",
  tracking: "Tracking",
  rules: "Rules",
};

export const CATEGORY_LABELS: Record<BlogPost["category"], string> = {
  engineering: "Engineering",
  guide: "Guide",
  announcement: "Announcement",
};
