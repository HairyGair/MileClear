// Help and how-tos: ONE source for every place MileClear explains itself.
//
//   - the app's Help and how-tos screen and the (i) help sheets
//     (apps/mobile/lib/help/topics.ts reads this)
//   - the website's help page (apps/web/src/lib/helpTopics.ts reads this)
//   - EmSee's mileclear_help tool (apps/api/src/services/assistantHelp.ts)
//
// Every menu path and button name here was checked against the app's code on
// 11 Oct 2026 (new Home, Insights, Tax tab and Settings of 10 Oct). The code is
// the truth: when a screen, label or free/Pro rule changes, change it here in
// the same commit. Tests check the wording rules, that every `goTo` is a real
// app route, and that a bank of real driver questions finds the right answer.
//
// Rules for the text: UK English, plain words, no em dashes, never an
// adjective next to HMRC about MileClear (ready, approved and the like), never a
// claim that MileClear files or sends anything to HMRC (quarterly updates are a
// test version on HMRC's test service only), and no promises about features
// that are not live. Paths use " > " between steps.

export const HELP_AREAS = [
  "getting_started",
  "recording_trips",
  "missing_or_wrong_trips",
  "managing_trips",
  "tax_and_claims",
  "money",
  "vehicles_and_places",
  "pro_and_billing",
  "account_and_app",
  "insights_and_alerts",
] as const;

export type HelpArea = (typeof HELP_AREAS)[number];

/** What each area covers (EmSee picks an area from these). */
export const HELP_AREA_LABELS: Record<HelpArea, string> = {
  getting_started: "What MileClear is, first steps, Home, Work and Personal mode, You drive for, the Settings check-up",
  recording_trips: "Automatic trips, Start Trip, Still on your trip, shifts, pausing, battery, permissions, the lock screen, Siri",
  missing_or_wrong_trips: "A trip is missing, late, split, too long, the wrong distance, or wasn't a real drive; uploads",
  managing_trips: "Classifying, adding a past trip, editing, merging, splitting, deleting, platforms, projects, odometer readings",
  tax_and_claims: "Mileage rates, the Tax tab, Box by box, Downloads, payment plan, accountant, employees, company cars, Mileage Allowance Relief, quarterly updates and Making Tax Digital (who must, connecting, errors, corrections), certificate",
  money: "Earnings, Snap a statement, CSV import, expenses, receipts, bank import, invoices, fuel, fines and clean air zones",
  vehicles_and_places: "Your cars, MOT and road tax reminders, saved places, work hours",
  pro_and_billing: "What's free, what's Pro, price, cancelling, restoring, inviting friends, team Pro",
  account_and_app: "Sign-in, email and password, deleting your account, your data, app lock, the website, updates, Android, contacting the team, EmSee, privacy",
  insights_and_alerts: "Insights, records, badges, streaks, weekly goal, drivers near you, notifications, fuel prices, road alerts",
};

/** Section headings for the help screens (app and website), in area order. */
export const HELP_AREA_SECTIONS: Record<HelpArea, { title: string; icon: string }> = {
  getting_started: { title: "Getting started", icon: "rocket-outline" },
  recording_trips: { title: "Recording trips", icon: "navigate-outline" },
  missing_or_wrong_trips: { title: "Missing or wrong trips", icon: "construct-outline" },
  managing_trips: { title: "Sorting and editing trips", icon: "car-outline" },
  tax_and_claims: { title: "Tax and claims", icon: "calculator-outline" },
  money: { title: "Earnings, expenses and fuel", icon: "card-outline" },
  vehicles_and_places: { title: "Cars and places", icon: "car-sport-outline" },
  pro_and_billing: { title: "Pro and your plan", icon: "star-outline" },
  account_and_app: { title: "Account and app", icon: "person-circle-outline" },
  insights_and_alerts: { title: "Insights and notifications", icon: "stats-chart-outline" },
};

export interface HelpEntry {
  /** Stable id (kebab-case). Screens link to these; don't rename. */
  id: string;
  area: HelpArea;
  q: string;
  /** The answer, as the driver reads it. Under 900 characters. */
  a: string;
  /** Replaces `a` on Android phones, where steps differ. */
  android?: string;
  /** App route for a "Go there" button. Must be a real route (tested). */
  goTo?: string;
  /** Only shown on iPhone (Live Activities, Siri). */
  iosOnly?: boolean;
  /** Only shown on Android phones. */
  androidOnly?: boolean;
  /** About something only the phone app does (tagged "In the app" on the website). */
  appOnly?: boolean;
  /** Extra words drivers use for this, to help search find it. */
  keywords?: string[];
  externalUrl?: string;
}

const SETTINGS = "More > Settings";

export const HELP_ENTRIES: HelpEntry[] = [
  // ── Getting started ──────────────────────────────────────────────────────
  {
    id: "what-it-does",
    area: "getting_started",
    q: "What does MileClear do?",
    a: "MileClear records your drives by itself, lets you mark each one Business or Personal, and works out your mileage claim at the approved mileage rates. It also keeps your earnings, expenses and fuel in one place and helps you with the self-employment pages of your Self Assessment. Recording trips is free, with no monthly limit.",
    keywords: ["about", "purpose", "actually"],
  },
  {
    id: "first-steps",
    area: "getting_started",
    q: "I've just installed it. What should I do first?",
    a: `1. Set location to "Always" with Precise Location. It's the one setting that lets trips record with the app closed. If you missed the question, tap the line at the top of Home.\n2. Allow Motion & Fitness and notifications when asked.\n3. Tell MileClear what you drive for: ${SETTINGS} > You drive for.\n4. Then just drive. Trips record by themselves, and the line at the top of Home says "Recording automatically" when all is well.\n5. When a trip appears, tap Business or Personal.\nAdd your vehicle in More > Your cars when you like (a motorbike claims a different rate). Saving Home and your depot (More > Saved places) makes your trip list easier to read. For a one-minute tour: More > Help and how-tos > Take the tour.`,
    android: `1. Set location to "Allow all the time" with precise location. It's the one setting that lets trips record with the app closed. If you missed the question, tap the line at the top of Home.\n2. Allow Physical activity and notifications when asked.\n3. Tell MileClear what you drive for: ${SETTINGS} > You drive for.\n4. Then just drive. Trips record by themselves, and the line at the top of Home says "Recording automatically" when all is well.\n5. When a trip appears, tap Business or Personal.\nAdd your vehicle in More > Your cars when you like (a motorbike claims a different rate). Saving Home and your depot (More > Saved places) makes your trip list easier to read. For a one-minute tour: More > Help and how-tos > Take the tour.`,
    keywords: ["installed", "downloaded", "new", "start", "setup", "begin", "now"],
  },
  {
    id: "tour",
    area: "getting_started",
    q: "Can I see the tour of the app again?",
    a: "Yes. More > Help and how-tos > Take the tour. It takes about a minute: how MileClear records your drives, the four places in the app, and a check of your phone's settings with a button for anything that needs you. Your answers and trips stay as they are.",
    goTo: "/tour",
    appOnly: true,
    keywords: ["tour", "tutorial", "walkthrough", "intro", "introduction", "guide", "replay", "quick start", "show me around"],
  },
  {
    id: "home-screen",
    area: "getting_started",
    q: "What's on the Home screen?",
    a: "From the top: the Work | Personal switch, a status line that says whether MileClear is recording (tap it for Automatic trips and Pause), your headline figure, the Start Trip button (plus Start Shift in Work mode for gig drivers and anyone who has used shifts before), your last trip with Business and Personal buttons, your odometer once a vehicle has a reading, and up to three shortcuts (such as Tax, Insights, Earnings, Badges, Fuel, and Invoices if you have made an invoice in the last 90 days). Press and hold the odometer or a shortcut to hide it; bring it back in More > Settings > Home screen.",
    goTo: "/settings/home",
    keywords: ["home", "dashboard", "shortcut", "shortcuts", "hide", "status", "line"],
  },
  {
    id: "home-first-trips",
    area: "getting_started",
    q: "What is the first-week line on Home?",
    a: "In your first two weeks, once you have 3 trips and none sorted yet, Home shows how many miles they add up to. In Work mode (not for a company car) it also says what that could be worth as a mileage claim, at the approved rate for a car or your employer's rate if you've set one. It's an \"up to\" figure: only what you mark Business counts. Tap Business or Personal and the line goes for good. It also goes after 14 days.",
    appOnly: true,
    keywords: ["you can claim", "first week", "worth"],
  },
  {
    id: "work-personal-mode",
    area: "getting_started",
    q: "What's the difference between Work and Personal mode?",
    a: "Use the Work | Personal switch at the top of Home. Work mode leads with your mileage claim and tax, with a Tax tab. Personal mode is for everyday driving, with an Insights tab (drivers who drive for work keep the Tax tab too). Trips record the same in both modes. If you never drive for work, choose \"Just me, not for work\" in More > Settings > You drive for to stop tax and work reminders.",
    keywords: ["switch", "mode", "personal", "toggle", "change"],
  },
  {
    id: "you-drive-for",
    area: "getting_started",
    q: "What does \"You drive for\" in Settings do?",
    a: "It tells MileClear how you work, so you get the right tax tools and reminders. Choose Self-employed or gig work (deliveries, taxi, trades, your own business), An employer in my own car, Self-employed and an employer, A company car, or Just me, not for work. It's in More > Settings > You drive for (the same screen as Tax > Your tax details). Change it any time.",
    goTo: "/settings/work-tax",
    keywords: ["drive for", "gig", "employer", "just me", "type", "kind", "work type", "which", "pick", "choose", "myself", "only drive for myself", "not for work", "never drive for work", "personal use", "self-employed", "sole trader", "own business"],
  },
  {
    id: "company-car",
    area: "getting_started",
    q: "I drive a company car. How should I set it up?",
    a: "In More > Settings > You drive for, choose \"A company car\". There's no mileage claim to work out when your employer provides the car, so MileClear won't show tax estimates or send tax reminders. The Tax tab shows your work miles and a \"Share my mileage log\" button for your employer. Mark trips Business or Personal as usual.",
    goTo: "/settings/work-tax",
    keywords: ["company car", "pool car", "fleet", "works car", "benefit"],
  },
  {
    id: "settings-checks",
    area: "getting_started",
    q: "What are the ticks at the top of Settings?",
    a: "The \"Is MileClear working?\" check-up at the top of More > Settings: whether trips are recording (the same line as on Home), your last trip, whether your phone lets MileClear send notifications, and whether all your trips are saved to your account. A line that needs you shows a button such as Fix, Turn on, Retry or Resume: tap it and MileClear takes you to the fix. Tap any line for more.",
    goTo: "/settings",
    keywords: ["ticks", "green", "red", "check", "checkup", "working", "fix button", "settings top"],
  },
  {
    id: "who-for",
    area: "getting_started",
    q: "Who is MileClear for?",
    a: "Self-employed and gig drivers (Uber, Deliveroo, Just Eat, Amazon Flex, Evri, DPD and others), employees who drive their own car for work, company car drivers who need a mileage log, and anyone who wants to keep track of their own driving. Set which you are in More > Settings > You drive for.",
    keywords: ["employed", "self-employed", "who", "suitable"],
  },

  // ── Recording trips ──────────────────────────────────────────────────────
  {
    id: "automatic-trips",
    area: "recording_trips",
    q: "How does MileClear know I'm driving?",
    a: "With Automatic trips on, MileClear notices when you're moving at driving speed (about 15 mph) and records the trip by itself, then ends it when you stop. You don't need to press anything. It needs location \"Always\" with Precise Location, and Motion & Fitness allowed. Automatic trips is switched on and off from the status line at the top of Home, or More > Settings > Recording options.",
    android: "With Automatic trips on, MileClear notices when you're moving at driving speed (about 15 mph) and records the trip by itself, then ends it when you stop. You don't need to press anything. It needs location \"Allow all the time\" with precise location, and Physical activity allowed. Automatic trips is switched on and off from the status line at the top of Home, or More > Settings > Recording options.",
    appOnly: true,
    keywords: ["automatic", "auto", "press", "know", "detect", "start by itself"],
  },
  {
    id: "start-trip",
    area: "recording_trips",
    q: "What is Start Trip?",
    a: "Start Trip records one trip from the moment you start it until you say you've arrived. Tap Start Trip on Home, then Start Trip again on the next screen. When you get there tap I've Arrived (I'm Here in Personal mode), then Save Trip. With Automatic trips on it saves by itself after 15 minutes parked, unless you turn on \"Start Trip runs until I tap Arrived\" in More > Settings > Recording options. With Automatic trips off it always runs until you tap Arrived.",
    appOnly: true,
    keywords: ["start trip", "button", "manually start", "arrived", "im here", "record now", "ending", "ends", "waiting", "depot"],
  },
  {
    id: "start-trip-vs-automatic",
    area: "recording_trips",
    q: "Should I use Start Trip or automatic trips?",
    a: "Most drivers leave Automatic trips on and never press anything. Start Trip is for when you want one trip to cover everything until you arrive, such as a delivery block with waits. Turn on \"Start Trip runs until I tap Arrived\" (More > Settings > Recording options) so waits and stops stay in the same trip. If you turn Automatic trips off, only Start Trip and shifts record, and Start Trip then always runs until you tap Arrived.",
    goTo: "/settings/recording",
    appOnly: true,
    keywords: ["which", "better", "versus", "vs", "difference", "or"],
  },
  {
    id: "still-on-your-trip",
    area: "recording_trips",
    q: "What is the \"Still on your trip?\" notification?",
    a: "When a Start Trip runs until you tap Arrived (the setting is on, or Automatic trips is off), MileClear reminds you once you've been stopped for 10 minutes. Tap Arrived to save the trip up to where you stopped driving, or Keep going if you're still working. You get one reminder per stop and it works without signal. It needs notifications allowed.",
    appOnly: true,
    keywords: ["still on your trip", "keep going", "reminder", "message", "stopped 10 minutes"],
  },
  {
    id: "shifts",
    area: "recording_trips",
    q: "What is a shift?",
    a: "A shift groups every trip you make into one work session. In Work mode, gig drivers and anyone who has used shifts before see Start Shift next to Start Trip on Home. Not there? Set More > Settings > You drive for to Self-employed or gig work. When you end it you get a Shift Complete scorecard with your trips, miles and claim, and you can add your earnings for the shift. Shifts are free. Past shifts and your working calendar are in More > Shifts.",
    goTo: "/shifts",
    keywords: ["shift", "session", "start shift", "end shift", "scorecard", "grade", "graded"],
  },
  {
    id: "past-shift",
    area: "recording_trips",
    q: "How do I add a past shift?",
    a: "Go to More > Shifts and tap Add a past shift. Set when the shift started and ended, then add each trip: where from, where to and when you set off. MileClear works out the road miles, and Add the next trip starts the next one where and when the last one arrived. You can add what you earned too. Every trip is saved as Business in that shift, and you get its scorecard. If a trip clashes with one you already have, you're told before saving. Saving needs a connection. Shifts are free.",
    goTo: "/past-shift-form",
    appOnly: true,
    keywords: ["past shift", "add shift", "earlier shift", "old shift", "backfill", "log shift", "whole shift", "several trips", "many trips"],
  },
  {
    id: "past-shift-totals",
    area: "recording_trips",
    q: "Can I add a past shift with just the total miles?",
    a: "Yes. In More > Shifts > Add a past shift, choose Just the totals instead of Every trip. Type the shift's total miles, how many drops you did if you know, and where the shift started and finished (your saved Home is filled in for you). It saves as one Business trip across the shift, with exactly the miles you typed, and counts as one trip for badges. A single total is a thinner record than trip by trip, so keep the platform's own shift history, for example from Deliveroo or Uber, as back-up. Shifts are free.",
    goTo: "/past-shift-form",
    appOnly: true,
    keywords: ["total miles", "just the totals", "totals", "bulk", "drops", "drop count", "number of trips", "trip count", "tedious", "thousands of trips", "mileage total", "deliveroo"],
  },
  {
    id: "pickup-wait",
    area: "recording_trips",
    q: "What is \"Wait at pickup\"?",
    a: "On the screen of a trip being recorded, tap Wait at pickup when you arrive at a restaurant or depot, and Picked up when you leave. It times how long you waited, which shows in your shift figures.",
    appOnly: true,
    keywords: ["pickup", "wait", "waiting", "restaurant", "timer", "collect"],
  },
  {
    id: "pause-recording",
    area: "recording_trips",
    q: "Can I pause recording?",
    a: "Yes. Tap the status line at the top of Home, then under Pause recording choose \"Until 6am tomorrow\" or \"For a week\". It's also in More > Settings > Recording options > Pause recording. While paused, Home says \"Paused until...\" with a Resume button, and recording switches back on by itself when the time is up. Drives while paused aren't recorded, but you can add them with Add a past trip.",
    goTo: "/settings/recording",
    appOnly: true,
    keywords: ["pause", "holiday", "stop for a while", "week off", "resume", "temporarily"],
  },
  {
    id: "turn-off-automatic",
    area: "recording_trips",
    q: "How do I stop it recording every drive?",
    a: "Tap the status line at the top of Home and switch off Automatic trips, or use More > Settings > Recording options. Then only Start Trip and shifts record. To stop just for a while, use Pause recording instead. Personal trips never count towards your claim, so leaving them recorded does no harm.",
    goTo: "/settings/recording",
    appOnly: true,
    keywords: ["turn off", "automatic", "every drive", "disable", "stop recording", "switch off tracking"],
  },
  {
    id: "battery",
    area: "recording_trips",
    q: "Does it drain my battery?",
    a: "Most drivers see a few per cent over a working day. \"Save battery when it's low\" (More > Settings > Recording options, on by default) eases off when the battery is low and unplugged, without dropping trips. Low Power Mode can stop drives recording: Home then says \"Low Power Mode is on. Drives may not record\". Leave it off while you're driving if you can.",
    android: "Most drivers see a few per cent over a working day. \"Save battery when it's low\" (More > Settings > Recording options, on by default) eases off when the battery is low and unplugged, without dropping trips. Battery Saver can stop drives recording: Home then says \"Battery Saver is on. Drives may not record\". Leave it off while you're driving if you can.",
    appOnly: true,
    keywords: ["battery", "drain", "kill", "low power", "battery saver", "save battery", "low battery"],
  },
  {
    id: "journey-end",
    area: "recording_trips",
    q: "How long does a stop have to be before a new trip starts?",
    a: "A stop of 4 minutes or more somewhere usually starts a new trip. Shorter stops, like traffic, stay in one. Any stop longer than your End a trip after time always ends the trip: More > Settings > Recording options > End a trip after, with 5, 10, 20 or 30 minutes, or 1 hour. The default is 30 minutes. To keep a long wait in one trip, use Start Trip with \"Start Trip runs until I tap Arrived\" on.",
    goTo: "/settings/recording",
    appOnly: true,
    keywords: ["stop", "split", "new trip", "minutes", "end a trip after", "how long"],
  },
  {
    id: "live-activity",
    area: "recording_trips",
    q: "What is the card on my lock screen while I drive?",
    a: "That's the Live Activity, showing the trip as it records, with End Trip and Not Driving buttons. Tap it to open the trip. To stop it showing, turn off \"Show a trip on your lock screen\" in More > Settings > Notifications. If it doesn't show, check iPhone Settings > MileClear > Live Activities is on.",
    iosOnly: true,
    appOnly: true,
    keywords: ["lock screen", "live activity", "dynamic island", "card", "get rid"],
  },
  {
    id: "android-notification",
    area: "recording_trips",
    q: "Why is there a MileClear notification while I drive on Android?",
    a: "Android needs an ongoing notification so MileClear can keep recording in the background: \"MileClear is recording your trip\" while you drive, and \"Monitoring for driving activity\" while it watches for drives. Please leave it on; hiding it can stop trips recording.",
    androidOnly: true,
    appOnly: true,
    keywords: ["android", "ongoing", "notification", "monitoring", "persistent"],
  },
  {
    id: "permissions",
    area: "recording_trips",
    q: "Which permissions does MileClear need?",
    a: "Location \"Always\" with Precise Location on, Motion & Fitness, Background App Refresh, and notifications. Without \"Always\" it can only record while the app is open. More > Settings > Recording options shows what your phone allows, with Fix buttons, and \"Check recording in detail\" goes further.",
    android: "Location \"Allow all the time\" with precise location, Physical activity, notifications, and battery use not restricted. Without \"Allow all the time\" it can only record while the app is open. More > Settings > Recording options shows what your phone allows, with Fix buttons, and \"Check recording in detail\" goes further.",
    goTo: "/settings/recording",
    appOnly: true,
    keywords: ["permission", "permissions", "location", "always", "precise", "motion", "fitness", "physical activity", "allow"],
  },
  {
    id: "offline",
    area: "recording_trips",
    q: "Does it work without signal?",
    a: "Yes. Trips, earnings, expenses and fuel are saved on your phone first and upload when you're back online. The check-up at the top of More > Settings says \"All trips saved\" once everything has uploaded, or how many are waiting.",
    appOnly: true,
    keywords: ["signal", "offline", "tunnel", "no internet", "data", "reception"],
  },
  {
    id: "siri",
    area: "recording_trips",
    q: "Can I use Siri with MileClear?",
    a: "Yes, on iPhone. Say \"Hey Siri, start my shift in MileClear\", \"How many miles today in MileClear\", \"Log expense in MileClear\" or \"Weekly goal in MileClear\". They also show in the Shortcuts app.",
    iosOnly: true,
    appOnly: true,
    keywords: ["siri", "voice", "shortcuts", "hands free", "hey siri"],
  },

  // ── Missing or wrong trips ────────────────────────────────────────────────
  {
    id: "missing-trip",
    area: "missing_or_wrong_trips",
    q: "A trip is missing. What do I do?",
    a: "1. Check the Trips tab, including To sort: some trips arrive late, and a drive under \"Drives we may have missed\" can be added with one tap.\n2. If it isn't there, tap \"Missing a trip? Tell us\" at the bottom of the Trips tab or To sort. Say roughly where and when, and you can add the trip there and then. It sends us your phone's recording log so we can see what happened.\n3. Check the line at the top of Home or More > Settings: it says if location, pause or Low Power Mode stopped recording, with a Fix button.",
    goTo: "/(tabs)/trips",
    keywords: ["missing", "didn't record", "not recorded", "lost", "gone", "where is my trip", "isn't there", "missed"],
  },
  {
    id: "journeys-to-check",
    area: "missing_or_wrong_trips",
    q: "What are \"Drives we may have missed\"?",
    a: "Drives MileClear may have missed or set aside, such as a short hop, or a recording it thought was a walk or phone drift. When there are some, the Trips tab says \"We may have missed 2 drives\" with Check, which opens To sort. For each one tap Add trip, Extend trip (when an existing trip started earlier than recorded) or Not a trip.",
    goTo: "/(tabs)/trips?filter=unclassified",
    keywords: ["journeys to check", "might have missed", "may have missed", "missed drives", "extend trip", "dismiss", "not a trip"],
  },
  {
    id: "late-trip",
    area: "missing_or_wrong_trips",
    q: "Why did a trip appear hours after I drove?",
    a: "Your phone sometimes stops MileClear in the background before it finishes saving a trip. The trip is kept on the phone and saved the next time MileClear gets a chance to run, often when you open the app. Opening MileClear for a few seconds at the end of a shift helps.",
    appOnly: true,
    keywords: ["late", "hours later", "delayed", "appeared later", "show up later"],
  },
  {
    id: "split-trip",
    area: "missing_or_wrong_trips",
    q: "One journey was split into two trips.",
    a: "A stop of 4 minutes or more somewhere usually starts a new trip, so a shop stop gives you two. Shorter stops, like traffic, stay in one, and a stop longer than your \"End a trip after\" time (30 minutes unless you changed it) always ends the trip. Nothing is lost. Join them: in the Trips tab, press and hold one trip, choose Join trips, tap the other, then Join. Or open the trip and choose Join with the next trip (or Join with the trip before) under Fix this trip. To keep a wait in one trip in future, use Start Trip with \"Start Trip runs until I tap Arrived\" on (More > Settings > Recording options), and tap Keep going when it asks if you're still on your trip.",
    keywords: ["split", "two trips", "broken up", "chopped", "wait split", "one drive two trips", "shop stop", "4 minutes"],
  },
  {
    id: "wrong-distance",
    area: "missing_or_wrong_trips",
    q: "A trip's distance looks wrong.",
    a: "Open the trip and, under Fix this trip, tap Work out the miles again to measure it along the roads. Or tap Edit trip and type the distance. When MileClear isn't sure of a distance, the trip shows \"The distance may be off\" with the reason and a Check button. To check every trip at once: More > Settings > Your data > Check my trips for odd ones.",
    keywords: ["distance", "wrong", "miles wrong", "too long", "too short", "way off", "recalculate", "work out the miles again", "confidence", "badge", "distance may be off"],
  },
  {
    id: "phantom-trip",
    area: "missing_or_wrong_trips",
    q: "A trip was recorded that I didn't make.",
    a: "GPS drift indoors, or a trip that didn't end cleanly, can do this. Open the trip and tap Delete trip at the bottom (or press and hold it in the Trips list and choose Delete trip). If it keeps happening, use More > Tell us about a problem or idea > Something's not right so the team can look at your phone's details.",
    keywords: ["didn't make", "fake", "ghost", "phantom", "sat at home", "not driving", "drift"],
  },
  {
    id: "passenger",
    area: "missing_or_wrong_trips",
    q: "It recorded a trip when I was a passenger or on a bus or train.",
    a: "Mark it Personal so it never counts towards your claim, or delete it (open the trip, Delete trip at the bottom). If MileClear asks \"Looks like you're driving\", tap \"No, I'm a passenger\". Personal trips are never in your mileage claim.",
    keywords: ["passenger", "bus", "train", "taxi", "lift", "walk", "walking"],
  },
  {
    id: "trip-not-ending",
    area: "missing_or_wrong_trips",
    q: "A trip is still recording after I've stopped.",
    a: "Open MileClear: an automatic trip finishes once the app sees you've stopped, and you can end it yourself from the trip screen. For a Start Trip, tap I've Arrived (I'm Here in Personal mode), or Arrived on the \"Still on your trip?\" notification. If it still won't end, tell us at More > Tell us about a problem or idea > Something's not right.",
    appOnly: true,
    keywords: ["still recording", "won't stop", "not ending", "parked", "end trip"],
  },
  {
    id: "web-missing",
    area: "missing_or_wrong_trips",
    q: "My trips aren't showing on the website.",
    a: "Trips upload when your phone is online. Open More > Settings: the check-up says \"All trips saved\", \"N waiting to upload\", or \"N trips couldn't upload\" with a Retry button. Tap it to open Uploads, where Sync Now and Retry send them again. Make sure you're signed in to the same account on the website.",
    goTo: "/sync-status",
    keywords: ["website", "web", "sync", "upload", "uploads", "not showing", "laptop"],
  },

  // ── Managing trips ───────────────────────────────────────────────────────
  {
    id: "classify",
    area: "managing_trips",
    q: "How do I mark trips as Business or Personal?",
    a: "Several ways: the Business and Personal buttons on your last trip on Home; To sort in the Trips tab, which holds every trip still to sort (its number matches the Trips tab badge); opening a trip and choosing Business or Personal; or the buttons on the notification after a trip. Only Business trips count towards your mileage claim.",
    goTo: "/(tabs)/trips?filter=unclassified",
    keywords: ["mark", "business", "personal", "classify", "sort", "to sort", "tag", "inbox", "unclassified"],
  },
  {
    id: "what-is-business",
    area: "managing_trips",
    q: "Which trips count as business?",
    a: "Generally, driving to do paid work counts: between jobs, pickups and drops, and to a temporary place of work. Ordinary commuting from home to a permanent workplace usually doesn't. This is general guidance, not personal tax advice; ask an accountant if you're unsure.",
    keywords: ["count", "commute", "commuting", "depot", "allowed", "business mileage"],
  },
  {
    id: "add-past-trip",
    area: "managing_trips",
    q: "How do I add a trip I forgot to record?",
    a: "Tap Add a past trip (under your last trip on Home, at the bottom of the Trips tab, or the + at the top of Trips). Enter where you started and finished (or pick them on the map), the date and time, and Business or Personal. MileClear works out the distance along the roads, or you can type it.",
    goTo: "/trip-form?mode=manual",
    keywords: ["forgot", "add", "manual", "manually", "past trip", "add trip", "log a trip"],
  },
  {
    id: "edit-trip",
    area: "managing_trips",
    q: "How do I edit a trip?",
    a: "Open the trip and tap Edit trip to change the places, times, distance, app, note, project or Business or Personal. Which app, Purpose and Note are also rows on the trip you can tap. Under Fix this trip are Work out the miles again, Split into separate trips and Odometer readings; under Use this trip are Save a place and New trip from here. Delete trip is at the bottom.",
    keywords: ["edit", "change", "time", "address", "notes", "update trip"],
  },
  {
    id: "merge-trips",
    area: "managing_trips",
    q: "How do I join two trips?",
    a: "In the Trips tab, press and hold one of the trips and choose Join trips. Tap the other trips to join, tap Join, then pick Business or Personal and tap Join into one trip. When the next trip starts soon after, the trip also offers Join with the next trip under Fix this trip. Joining can't be undone.",
    keywords: ["merge", "join", "combine", "together", "long press"],
  },
  {
    id: "split-a-trip",
    area: "managing_trips",
    q: "How do I split a trip?",
    a: "Open the trip and, under Fix this trip, tap Split into separate trips, then choose the stops to split at.",
    keywords: ["split", "separate", "break", "divide"],
  },
  {
    id: "delete-trip",
    area: "managing_trips",
    q: "How do I delete a trip?",
    a: "Open the trip and tap Delete trip at the bottom. In the Trips list you can also press and hold a trip and choose Delete trip, or swipe it left. Deleting can't be undone, so if a trip is just personal, mark it Personal instead.",
    keywords: ["delete", "remove", "get rid"],
  },
  {
    id: "platform-tag",
    area: "managing_trips",
    q: "How do I say which platform a trip was for?",
    a: "Open the trip, tap the Which app row and pick the app (Uber, Deliveroo, Amazon Flex and so on), or tap Edit trip. It shows once the trip is Business.",
    keywords: ["platform", "uber", "deliveroo", "amazon flex", "just eat", "which app", "tag"],
  },
  {
    id: "auto-classify",
    area: "managing_trips",
    q: "Can trips be sorted automatically?",
    a: "Yes. MileClear learns your regular journeys: once you've marked the same journey the same way 3 times, it sorts it for you and the trip says \"Sorted for you\". If it got it wrong, tap Undo on the trip in the Trips list (or press and hold it and choose Put back in To sort) within 7 days. You can add rules by work hours or saved place in More > Settings > Recording options > Sort trips automatically. Sorting by your work hours, set in More > Work hours, is part of Pro.",
    goTo: "/classification-rules",
    keywords: ["automatically", "auto", "rules", "sort trips automatically", "classify automatically", "undo"],
  },
  {
    id: "projects",
    area: "managing_trips",
    q: "Can I label trips by client or project?",
    a: "Yes, free. Add a project or client name (Project / client) when you edit a trip, earning or expense. Once you have some, the Filters button at the top of Trips has Which client, to show just one client's trips (or No client, for trips still to label), and \"Miles by project\" with your business miles per project. Tap a project there to see its trips. The same filter is on the website's Trips page.",
    keywords: ["project", "client", "customer", "label", "per client", "filter", "which client", "separate", "more than one business", "business type"],
  },
  {
    id: "odometer",
    area: "managing_trips",
    q: "Can MileClear keep an odometer reading?",
    a: "Yes. In More > Odometer, tap Add reading and type what your dashboard shows; MileClear adds your recorded miles to it, giving a start and end reading for each day. You can also add readings to one trip (open it, then Odometer readings under Fix this trip). The Trips list shows each day's readings under the date, and Home (in the app and on the website) shows each vehicle's running reading, marked est. when it includes trips since your last reading; tap it to open the log. The log is free; downloading it as a CSV for your employer is Pro.",
    goTo: "/odometer-log",
    keywords: ["odometer", "mileometer", "reading", "clock", "dashboard reading"],
  },

  // ── Tax and claims ───────────────────────────────────────────────────────
  {
    id: "rates",
    area: "tax_and_claims",
    q: "What mileage rates does MileClear use?",
    a: "Cars and vans: 55p a mile for the first 10,000 business miles in a tax year and 25p after that, for trips from 6 April 2026. Trips before then use 45p and 25p. Motorbikes: 24p a mile. MileClear uses the rate for the date of each trip, and cars and vans share one 10,000-mile count. The rate doesn't depend on engine size.",
    keywords: ["rate", "rates", "per mile", "55p", "45p", "25p", "24p", "pence", "amap", "this year"],
  },
  {
    id: "claim-meaning",
    area: "tax_and_claims",
    q: "What is my mileage claim?",
    a: "Your business miles multiplied by the approved rates. If you're self-employed it's an allowable expense that comes off your profit, so you pay less tax; it isn't money paid to you. It covers fuel, insurance, servicing and wear, so you can't also claim those running costs for the same vehicle.",
    keywords: ["claim", "deduction", "paid", "money", "fuel as well", "both"],
  },
  {
    id: "tax-tab",
    area: "tax_and_claims",
    q: "What does the Tax tab show?",
    a: "For self-employed drivers: the return you file next with what's left to sort, then this tax year so far with your tax so far and \"Put by each week\". Below are Box by box, Check your platform figures, New to Self Assessment?, Downloads, Mileage certificate, Your accountant and Your tax details. Employees see their Mileage Allowance Relief, and company car drivers their work miles. The Tax tab is there in Work mode, and in Personal mode too if you drive for work.",
    goTo: "/(tabs)/tax",
    keywords: ["tax tab", "tax screen", "put by", "return card", "tax so far"],
  },
  {
    id: "your-return",
    area: "tax_and_claims",
    q: "How do I get my Self Assessment return ready?",
    a: "On the Tax tab, the card for your next return lists what's left to sort before 31 January. Tap Sort my return (or See my list) for the checklist: trips logged and sorted, earnings, expenses, vehicles and your full name. When it's done, File at GOV.UK takes you to HMRC's site. You or your accountant file the return; MileClear doesn't file anything.",
    goTo: "/sa-checklist",
    keywords: ["ready", "checklist", "31 january", "sort my return", "prepare", "file", "filing"],
  },
  {
    id: "sa-wizard",
    area: "tax_and_claims",
    q: "How does Box by box (the Self Assessment helper) work?",
    a: "Tax > Box by box walks you through the short self-employment pages (SA103S) box by box, showing the figure from your records and where it goes on your return, such as box 9 (turnover) and box 12 (car, van and travel). If your turnover was £90,000 or more you need the full pages, which number boxes differently. Box by box is free; the printable PDF is Pro. MileClear doesn't file your return; you or your accountant do.",
    goTo: "/self-assessment",
    keywords: ["box by box", "wizard", "sa103", "fill in", "tax return", "self assessment", "boxes", "submit"],
  },
  {
    id: "exports",
    area: "tax_and_claims",
    q: "How do I download my mileage for my accountant or employer?",
    a: "Tax > Downloads (also More > Settings > Downloads). Choose a tax year or dates, then the Self Assessment PDF, Trip Report (PDF), Trip Data (CSV) or Odometer readings (CSV). Downloads are Pro (included for drivers on an employer's MileClear team). For your full data instead, use More > Settings > Your data, which is free.",
    goTo: "/exports",
    keywords: ["download", "downloads", "export", "csv", "pdf", "spreadsheet", "report", "send", "mileage log"],
  },
  {
    id: "exports-one-car",
    area: "tax_and_claims",
    q: "Can I get a report for just one car?",
    a: "Yes, if you have more than one vehicle. In Tax > Downloads, tap Trip Report (PDF) or Trip Data (CSV) and choose the vehicle, or All vehicles. On the website, pick the vehicle above the downloads. Trips with no vehicle count towards your primary vehicle, or your oldest one if none is set as primary. The higher mileage rate covers your first 10,000 business miles a tax year across all your cars and vans, not 10,000 per car, so a one-vehicle report shows that vehicle's share of your claim. Claim the total from the All vehicles report.",
    goTo: "/exports",
    keywords: ["one car", "two cars", "each car", "per car", "vehicle", "second car", "separate report", "report"],
  },
  {
    id: "exports-one-client",
    area: "tax_and_claims",
    q: "Can I get a report for just one client?",
    a: "Yes, with Pro, once your trips have a Project / client. In Tax > Downloads, tap Trip Report (PDF) or Trip Data (CSV) and choose the client, or All clients; with more than one vehicle you then choose the vehicle too. On the website, pick the client above the downloads. The report names the client and counts trips by their Project / client, however you typed it. The higher mileage rate covers your first 10,000 business miles a tax year across all your work, not 10,000 per client, so a one-client report shows that client's share of your claim. The Self Assessment summary always covers all your work.",
    goTo: "/exports",
    keywords: ["one client", "each client", "per client", "client report", "customer", "charge", "bill", "invoice client", "more than one business", "separate", "report"],
  },
  {
    id: "accountant",
    area: "tax_and_claims",
    q: "Can my accountant see my records?",
    a: "Yes, free for every driver. In Your accountant, type their email or practice code and tap Send, or say yes when their practice asks you. They see your business trips, earnings and expenses, read only. Personal trips stay private unless you turn them on. Sharing lasts until the next 31 January deadline and you're asked once a year to keep it going. You can see every time they look or download, and stop sharing at any time. Your accountant's name, contact and yearly fee are kept there too, and the fee is added to your weekly put-by.",
    goTo: "/accountant",
    keywords: ["accountant", "bookkeeper", "share", "log in", "access", "fee", "practice", "stop sharing"],
  },
  {
    id: "tax-estimate",
    area: "tax_and_claims",
    q: "How is the tax estimate worked out?",
    a: "From your recorded earnings, minus the mileage on your tax return and allowable expenses, giving your profit. MileClear applies the personal allowance, the income tax bands for that tax year (the Scottish ones if you pay Scottish income tax) and Class 4 National Insurance, and takes your other income into account if you've entered it in Tax > Your tax details. It's only as good as what you've recorded, and it's an estimate, not a bill.",
    keywords: ["estimate", "how much tax", "worked out", "calculate", "owe", "tax so far"],
  },
  {
    id: "scottish-income-tax",
    area: "tax_and_claims",
    q: "I live in Scotland. Does MileClear use the Scottish tax rates?",
    a: "Yes, once you tell it. Go to Tax > Your tax details (the same screen as More > Settings > You drive for), tap Scottish income tax and choose Yes. You pay Scottish income tax if you live in Scotland. Your tax estimate, Box by box, the payment plan and Mileage Allowance Relief then use the Scottish rates: 19% starter, 20% basic, 21% intermediate, 42% higher, 45% advanced and 48% top, for the tax year each figure is for. National Insurance and the £12,570 personal allowance are the same across the UK, so they don't change. Box by box asks if you haven't answered yet. Until you answer, MileClear uses the England, Wales and Northern Ireland rates.",
    goTo: "/settings/work-tax",
    keywords: ["scotland", "scottish", "scottish rate", "scottish tax", "live in scotland", "intermediate rate", "starter rate", "21%", "42%", "edinburgh", "glasgow"],
  },
  {
    id: "payment-plan",
    area: "tax_and_claims",
    q: "When do I pay my tax, and how much should I put by?",
    a: "On the Tax tab, tap See payment plan. It shows your next payment, what to put by each week (including your accountant's fee if you've added it), the payment dates including payments on account on 31 January and 31 July, and reminds you 14 and 3 days before each payment. It's free. Filing online and paying are due by 31 January after the tax year ends.",
    goTo: "/tax-planner",
    keywords: ["pay", "payment", "put by", "save", "weekly", "payments on account", "when", "bill", "set aside"],
  },
  {
    id: "first-return",
    area: "tax_and_claims",
    q: "It's my first Self Assessment. Where do I start?",
    a: "Tax > New to Self Assessment? is a plain guide: whether you're self-employed, getting a UTR, the tax year (6 April to 5 April), what you pay, mileage on your return and the 31 January deadline. Then use the checklist on the Tax tab's return card.",
    goTo: "/first-tax-return",
    keywords: ["first", "never", "new", "utr", "register", "beginner"],
  },
  {
    id: "employee",
    area: "tax_and_claims",
    q: "I'm an employee and my employer pays me per mile.",
    a: "In More > Settings > You drive for, choose \"An employer, in my own car\" and set your Employer mileage rate. If they pay less than the approved rates, the Tax tab shows your Mileage Allowance Relief: the tax back you can claim on the difference. Tap How to claim for the GOV.UK and P87 steps. It's free.",
    goTo: "/settings/work-tax",
    keywords: ["employee", "employer", "boss", "pays", "per mile", "30p", "45p", "reimburse", "rest"],
  },
  {
    id: "mileage-relief",
    area: "tax_and_claims",
    q: "What is Mileage Allowance Relief?",
    a: "If your employer pays less than the approved rates for business miles in your own car, you can claim tax relief on the difference from HMRC. MileClear works it out from your business trips and your employer's rate, and shows How to claim (online at GOV.UK or by post on form P87). It's on the Tax tab for employees, and under Claims for drivers who also do gig work. Free.",
    goTo: "/mileage-relief",
    keywords: ["relief", "p87", "tax back", "mar", "refund", "allowance"],
  },
  {
    id: "other-income",
    area: "tax_and_claims",
    q: "I have a job as well as driving.",
    a: "In Tax > Your tax details (or More > Settings > You drive for), enter your Other annual income, or the Tax already taken off your pay through PAYE. The tax estimate then shows only the extra tax your driving profit adds. If your employer also pays you mileage, choose \"Self-employed and an employer\".",
    goTo: "/settings/work-tax",
    keywords: ["job", "full-time", "salary", "paye", "other income", "pension", "second job"],
  },
  {
    id: "cash-basis",
    area: "tax_and_claims",
    q: "Cash or accruals: how should I count income?",
    a: "In Tax > Your tax details > How you count income, choose \"When I'm paid\" (cash basis, most drivers) or \"When I earn it\" (when you invoice). Unless your accountant says otherwise, leave it on when you're paid.",
    goTo: "/settings/work-tax",
    keywords: ["cash", "accruals", "basis", "count income", "invoice"],
  },
  {
    id: "hmrc-check",
    area: "tax_and_claims",
    q: "Can I compare my figures with what platforms told HMRC?",
    a: "Yes. Tax > Check your platform figures lets you enter what each gig app reported and shows the differences next to what you recorded in MileClear, with Add missing earnings. It's free, for self-employed drivers.",
    goTo: "/hmrc-reconciliation",
    keywords: ["platform figures", "reported", "compare", "uber told", "check", "reconcile"],
  },
  {
    id: "certificate",
    area: "tax_and_claims",
    q: "Can I prove my mileage to an insurer or employer?",
    a: "Tax > Mileage certificate makes a PDF of the miles you recorded for a period, with a code anyone can check at mileclear.com/verify. You can see the figures free; creating and sharing the certificate is Pro.",
    goTo: "/mileage-certificate",
    keywords: ["prove", "proof", "insurer", "insurance", "certificate", "evidence"],
  },
  {
    id: "hmrc-approved",
    area: "tax_and_claims",
    q: "Is MileClear approved by HMRC?",
    a: "No. HMRC doesn't approve or endorse mileage apps, and MileClear isn't endorsed by HMRC. MileClear uses HMRC's approved mileage rates and keeps a record of each business trip (date, distance, start and end), which is the kind of record HMRC asks you to keep. You or your accountant are responsible for your tax return.",
    keywords: ["approved", "accepted", "allowed", "recognised", "legit", "valid"],
  },
  {
    id: "mtd",
    area: "tax_and_claims",
    q: "Does MileClear do Making Tax Digital?",
    a: "Only as a test. Quarterly updates (test version) is in Tax > Your tax details for self-employed Pro drivers, and works with HMRC's test service only: nothing is sent to HMRC and your tax account isn't changed. We're waiting for HMRC to let MileClear send real updates. When that happens, you'll be able to send your quarterly updates to HMRC from MileClear, and we'll say so in the app. Until then, keep filing your Self Assessment as normal.",
    goTo: "/settings/work-tax",
    keywords: ["mtd", "making tax digital", "quarterly", "itsa", "test version", "real", "live", "when"],
  },
  {
    id: "mtd-who",
    area: "tax_and_claims",
    q: "Do I have to use Making Tax Digital, and from when?",
    a: "It depends on your income before expenses from self-employment plus any rental (property) income, as on your Self Assessment. Over £50,000 in 2024-25: from 6 April 2026. Over £30,000 in 2025-26: from 6 April 2027. Over £20,000 in 2026-27: from 6 April 2028. Below that, you don't need to yet. Tax > Your tax details > Quarterly updates (test version) checks your MileClear earnings against these limits before you connect. MileClear doesn't hold rent, so add any you get yourself. GOV.UK has HMRC's own checker.",
    goTo: "/tax-mtd",
    keywords: ["mtd", "start", "income", "who", "have to", "need to", "must", "threshold", "limit", "50,000", "30,000", "20,000", "2027", "2028", "in scope", "mandatory", "qualifying income"],
  },
  {
    id: "mtd-connect",
    area: "tax_and_claims",
    q: "How do I connect MileClear to HMRC?",
    a: "Tax > Your tax details > Quarterly updates (test version) > Continue. You'll go to HMRC's sign-in page, sign in and agree. While it's a test version this is HMRC's test service, so you sign in with test details, not your own Government Gateway account. Then enter your National Insurance Number (stored encrypted) and choose your self-employment trade. It's for self-employed Pro drivers. The connection renews itself while you use it; if it runs out, tap Connect again. Disconnect is at the top of the screen.",
    goTo: "/tax-mtd",
    appOnly: true,
    keywords: ["connect", "link", "sign in", "government gateway", "nino", "national insurance", "authorise", "trade", "business", "disconnect"],
  },
  {
    id: "mtd-quarterly-update",
    area: "tax_and_claims",
    q: "What does quarterly reporting mean?",
    a: "Under Making Tax Digital you tell HMRC your self-employment income and expenses every three months, instead of only once a year. Each update is a running total from 6 April. The quarters end on 5 July, 5 October, 5 January and 5 April, and the updates are due by 7 August, 7 November, 7 February and 7 May. MileClear works the figures out from your earnings, expenses and business miles, and you see them all before anything is sent. An update isn't a tax return: after the tax year you still need to finish the year. MileClear has a test version of End of year, but it only works with HMRC's test service for now, so until HMRC lets us send real ones, send your tax return with HMRC or other software.",
    goTo: "/tax-mtd",
    keywords: ["what is", "every three months", "deadline", "due", "quarter", "7 august", "7 november", "7 february", "7 may", "running total", "cumulative", "final declaration"],
  },
  {
    id: "mtd-amend",
    area: "tax_and_claims",
    q: "How do I correct figures I've already sent to HMRC for a quarter?",
    a: "Fix the trip, earning or expense in MileClear first. Each update is a running total from 6 April, so the next update you send carries the corrected figures. If the quarter is still listed on Quarterly updates, you can open it and send it again: the new figures replace the old ones. Update history shows what was sent. Mistakes found after the last quarter are put right when you finish the year with HMRC.",
    goTo: "/tax-mtd-history",
    appOnly: true,
    keywords: ["correct", "amend", "change", "mistake", "wrong", "fix", "resend", "send again", "history", "already sent"],
  },
  {
    id: "mtd-errors",
    area: "tax_and_claims",
    q: "What do the errors on quarterly reporting mean?",
    a: "\"Connect to HMRC first\" or \"connection has expired\": tap Connect again and sign in. \"This version of the app can't report your device details\": update MileClear from the App Store or Google Play (HMRC needs your phone's details with every update). \"Only available from the MileClear mobile app\": send it from the phone app, not the website. HMRC can't find your business or National Insurance Number: check the NINO you entered and that your trade is registered with HMRC. \"Couldn't load your updates\": HMRC didn't answer, so pull down to try again later; it doesn't mean nothing is due. If HMRC turns down the figures, nothing has changed at HMRC: check them and try again, or tell us from More > Tell us about a problem or idea.",
    goTo: "/tax-mtd",
    appOnly: true,
    keywords: ["error", "rejected", "failed", "won't send", "expired", "device details", "not found", "couldn't load", "hmrc says", "problem"],
  },
  {
    id: "tax-year",
    area: "tax_and_claims",
    q: "When does the tax year start and end?",
    a: "The UK tax year runs from 6 April to 5 April. MileClear groups your figures and downloads by tax year.",
    keywords: ["tax year", "april", "end", "start"],
  },

  // ── Money ────────────────────────────────────────────────────────────────
  {
    id: "earnings",
    area: "money",
    q: "How do I add my earnings?",
    a: "More > Earnings > Add manually, then the platform, amount and dates. With Pro you can also Snap a statement (read it from a screenshot), Import CSV from platform, or Connect Bank to bring payouts in.",
    goTo: "/(tabs)/earnings",
    keywords: ["earnings", "income", "pay", "add", "deliveroo", "uber", "money"],
  },
  {
    id: "snap-statement",
    area: "money",
    q: "What is Snap a statement?",
    a: "A Pro feature on the Earnings screen that reads the total and dates from a screenshot of your Uber, Deliveroo, Just Eat, Amazon Flex or other earnings screen. You check it before it's saved.",
    goTo: "/snap-statement",
    keywords: ["screenshot", "snap", "photo", "statement", "picture"],
  },
  {
    id: "csv-import",
    area: "money",
    q: "Can I import my earnings from a platform CSV?",
    a: "Yes, with Pro: More > Earnings > Import CSV from platform. MileClear reads the file from your platform, shows a preview and skips anything you've already added.",
    goTo: "/csv-import",
    keywords: ["csv", "import", "file", "upload", "spreadsheet"],
  },
  {
    id: "expenses",
    area: "money",
    q: "How do I add an expense?",
    a: "More > Expenses, then Scan Receipt or Add manually. There are 16 categories, each matched to the self-employment pages. Parking, tolls, congestion and clean air zone charges can be claimed on top of the mileage rate; fuel, insurance and repairs can't, if you claim mileage for that vehicle.",
    goTo: "/expenses",
    keywords: ["expense", "expenses", "parking", "toll", "receipt", "cost", "claim"],
  },
  {
    id: "receipts",
    area: "money",
    q: "How does receipt scanning work?",
    a: "More > Expenses > Scan Receipt. Take a photo or pick one, and MileClear reads the amount, date and shop to fill in the expense for you to check. It's read on your phone and nothing is uploaded. Free for everyone.",
    goTo: "/receipt-scan",
    appOnly: true,
    keywords: ["scan", "receipt", "photo", "camera", "ocr"],
  },
  {
    id: "meal-warning",
    area: "money",
    q: "Why does a meal or hotel expense show a warning?",
    a: "Meals on your normal working pattern usually can't be claimed; meals and hotels on irregular trips away from your usual area often can. The warning is a reminder of that rule. It doesn't stop you saving the expense if it qualifies.",
    keywords: ["meal", "food", "subsistence", "hotel", "warning", "lunch"],
  },
  {
    id: "bank",
    area: "money",
    q: "Can MileClear read my bank account?",
    a: "With Pro, More > Bank > Connect Bank links your bank read-only through Open Banking (TrueLayer). Payouts from known platforms come in as earnings, and other payments wait in More > Bank (Bank payments) for you to tap Accept as earning, Accept as expense or Ignore this one. MileClear can't move money, and you can disconnect at any time.",
    goTo: "/open-banking",
    keywords: ["bank", "open banking", "truelayer", "inbox", "bank payments", "link", "connect", "transactions"],
  },
  {
    id: "invoices",
    area: "money",
    q: "Can I send invoices?",
    a: "Yes, from More > Invoices. The free plan covers 3 invoices a month. Pro removes the limit and adds sharing the invoice PDF, emailing it to the client and chasing late payment. Set your logo, trading name and bank details in Invoice details at the top of More > Invoices.",
    goTo: "/invoices",
    keywords: ["invoice", "invoices", "bill", "client", "chase"],
  },
  {
    id: "fuel",
    area: "money",
    q: "Should I log fuel?",
    a: "It's optional. Logging fill-ups in More > Fuel > Add Fuel Log shows your real running costs and fuel economy. It doesn't change your mileage claim, because the mileage rate already covers fuel.",
    goTo: "/(tabs)/fuel",
    keywords: ["fuel", "petrol", "diesel", "fill up", "log fuel", "need"],
  },
  {
    id: "ticket-defender",
    area: "money",
    q: "I got a parking or speeding fine. Can MileClear help?",
    a: "With Pro, More > Ticket defender (or \"Got a fine for this trip?\" under Use this trip on a trip) finds what MileClear recorded at the time on the notice and makes an evidence pack PDF you can send with an appeal. It can only show what was recorded; it can't promise an appeal will succeed.",
    goTo: "/ticket-defender",
    keywords: ["fine", "ticket", "pcn", "parking ticket", "speeding", "appeal", "prove where"],
  },
  {
    id: "caz",
    area: "money",
    q: "Does MileClear tell me about clean air zone charges?",
    a: "If a recorded trip goes through a Clean Air Zone or ULEZ, the trip shows it and you can tap Log charge to add it as an expense. Ticket defender lists charges to pay. With Pro you can turn on Clean Air Zone pay-by reminders in More > Settings > Notifications.",
    keywords: ["ulez", "clean air zone", "caz", "congestion", "charge", "london"],
  },

  // ── Vehicles and places ──────────────────────────────────────────────────
  {
    id: "add-vehicle",
    area: "vehicles_and_places",
    q: "How do I add a vehicle?",
    a: "More > Your cars > Add Vehicle (or More > Settings > Your car). Enter your registration and tap Look up to fill in the details from the DVLA. Set Car, Van or Motorbike, because that sets the mileage rate. The free plan has 1 vehicle; Pro has as many as you need.",
    goTo: "/vehicles",
    keywords: ["vehicle", "car", "van", "motorbike", "add", "registration", "reg"],
  },
  {
    id: "mot-reminders",
    area: "vehicles_and_places",
    q: "Does MileClear remind me about MOT and road tax?",
    a: "Yes, free, for a vehicle added by registration: you get a notification from 14 days before the MOT or vehicle tax runs out. To see the MOT history, open the vehicle in More > Your cars and tap View MOT History.",
    goTo: "/vehicles",
    keywords: ["mot", "road tax", "vehicle tax", "reminder", "history", "due", "expiry"],
  },
  {
    id: "saved-places",
    area: "vehicles_and_places",
    q: "What are saved places?",
    a: "Places like Home or your depot, saved in More > Saved places > Add Location. Trips show the name instead of an address, MileClear ignores GPS drift while you're there, and they help it suggest Business or Personal. They don't start trips. The free plan has 2 saved places; Pro has as many as you need. MileClear also suggests places you visit often.",
    goTo: "/saved-locations",
    keywords: ["saved places", "home", "address", "depot", "location", "save", "pin", "suggested places"],
  },
  {
    id: "work-schedule",
    area: "vehicles_and_places",
    q: "How do I set my working hours?",
    a: "More > Work hours (also in More > Settings) is where you set your working days and hours. That's free. With Pro, it can also mark trips in your working hours as Business and switch you to Work mode while you're working.",
    goTo: "/work-schedule",
    keywords: ["hours", "schedule", "working days", "work hours", "rota"],
  },

  // ── Pro and billing ──────────────────────────────────────────────────────
  {
    id: "free-vs-pro",
    area: "pro_and_billing",
    q: "What is free and what is Pro?",
    a: "Free: unlimited trip recording, sorting trips, shifts and scorecards, earnings and expenses by hand, receipt scanning, fuel, Box by box, the tax estimate and payment plan, Mileage Allowance Relief, the odometer log, badges, 1 vehicle and 2 saved places. Pro adds: Downloads and the Self Assessment PDF, the mileage certificate, Snap a statement, CSV import, bank import and Bank payments, unlimited invoices, Ticket defender, the deeper Insights, the journey map, work hours sorting, EmSee, and unlimited vehicles and saved places.",
    keywords: ["free", "pro", "premium", "what do i get", "included", "difference", "paid"],
  },
  {
    id: "price",
    area: "pro_and_billing",
    q: "How much is Pro?",
    a: "£4.99 a month, or yearly where your app store offers it (£44.99). The price is shown in More > Settings > Your plan. Pro never limits how many trips are recorded; that's always free.",
    keywords: ["price", "cost", "how much", "monthly", "yearly", "annual"],
  },
  {
    id: "cancel",
    area: "pro_and_billing",
    q: "How do I cancel Pro?",
    a: "More > Settings > Your plan shows how you pay. Subscribed on iPhone: Manage in App Store, or iPhone Settings > your name > Subscriptions. Paid by card on the website: Cancel subscription there, or Settings on mileclear.com. Pro stays on until the end of the period you've paid for, and your records stay as they are.",
    android: "More > Settings > Your plan shows how you pay. Subscribed through Google Play: Manage in Google Play, or Google Play > Payments & subscriptions. Paid by card on the website: cancel from your account at mileclear.com. Pro stays on until the end of the period you've paid for, and your records stay as they are.",
    goTo: "/settings/plan",
    keywords: ["cancel", "unsubscribe", "stop paying", "subscription", "end"],
  },
  {
    id: "restore",
    area: "pro_and_billing",
    q: "I paid but Pro isn't unlocked.",
    a: "More > Settings > Your plan > Restore purchase, signed in to your phone with the account you paid with. Check you're signed in to the MileClear account you subscribed on. If it still isn't unlocked, use More > Tell us about a problem or idea > Something's not right or email support@mileclear.com.",
    goTo: "/settings/plan",
    keywords: ["restore", "paid", "not unlocked", "still free", "purchase", "says free"],
  },
  {
    id: "refer",
    area: "pro_and_billing",
    q: "Can I get Pro free?",
    a: "Invite friends from More > Invite a friend, get Pro free. When a friend signs up with your code and records their first trip, they start with a month of Pro and you get a free month too, up to 3 months for you.",
    goTo: "/refer",
    keywords: ["free pro", "refer", "invite", "friend", "code", "referral"],
  },
  {
    id: "team-pro",
    area: "pro_and_billing",
    q: "My employer uses MileClear. Do I get Pro?",
    a: "If your employer adds you to their MileClear team, you join through the invite link they email you (it works once and lasts 7 days) and sign in to the app with the same email. Pro comes with the team while you're a member. If your employer pays your mileage but doesn't use MileClear, More > Invite your manager sends them an invite.",
    goTo: "/nominate-manager",
    keywords: ["employer", "team", "company", "manager", "milesheet", "invite link"],
  },

  // ── Account and app ──────────────────────────────────────────────────────
  {
    id: "sign-in",
    area: "account_and_app",
    q: "I signed in and my account is empty.",
    a: "You've probably signed in a different way from when you joined, which makes a new empty account. Log out (bottom of More > Settings) and sign in the way you first did: with Apple, Google, or your email and password. If that doesn't fix it, email support@mileclear.com.",
    keywords: ["empty", "blank", "trips gone", "logged in", "sign in", "new account", "everything gone"],
  },
  {
    id: "change-email",
    area: "account_and_app",
    q: "How do I change my email or password?",
    a: "More > Settings, tap your name at the top (the You screen), then Email or Change password. Changing your email needs your current password, and MileClear sends a code to the new address to confirm it. If you joined with Apple or Google, use Forgot password on the sign-in screen first to set a password.",
    goTo: "/settings/account",
    keywords: ["email", "password", "change", "update", "forgot"],
  },
  {
    id: "names",
    area: "account_and_app",
    q: "How do I change my name or picture?",
    a: "More > Settings, tap your name at the top (the You screen). Display name is what the app calls you; Full name goes on your tax records. Tap your picture to choose another.",
    goTo: "/settings/account",
    keywords: ["name", "picture", "avatar", "photo", "full name", "display name"],
  },
  {
    id: "kilometres",
    area: "account_and_app",
    q: "Can I see kilometres instead of miles?",
    a: "Yes, free. More > Settings > Distances, then choose Kilometres. Your trips (on the website too), Home, Insights and the live drive screen then show km, and a distance you type when you add a trip or report a missing one is in km (a past shift's total stays in miles). Tax figures, the 10,000-mile count, Miles by project and every download stay in miles, because HMRC mileage rates are per mile. The lock screen and Dynamic Island still show miles for now. The choice is saved to your account, so it follows you to a new phone.",
    goTo: "/settings",
    keywords: ["kilometres", "kilometers", "km", "metric", "units", "miles or km", "distance unit"],
  },
  {
    id: "delete-account",
    area: "account_and_app",
    q: "How do I delete my account?",
    a: "More > Settings, tap your name at the top, then Delete account at the bottom and enter your password (leave it blank if you only sign in with Apple or Google). It permanently removes your account and records straight away. Cancel any App Store or Google Play subscription yourself first. To keep a copy, use More > Settings > Your data > Get a copy of your data before you delete.",
    goTo: "/settings/account",
    keywords: ["delete", "account", "close", "remove", "gdpr", "erase"],
  },
  {
    id: "my-data",
    area: "account_and_app",
    q: "Can I download all my data?",
    a: "Yes, free: More > Settings > Your data > Get a copy of your data gives you one file with everything MileClear holds about you. For tax, use Tax > Downloads instead (Pro).",
    goTo: "/settings/data",
    keywords: ["data", "copy", "download everything", "gdpr", "hold about me"],
  },
  {
    id: "app-lock",
    area: "account_and_app",
    q: "Can I lock the app?",
    a: "Yes. Turn on App lock in More > Settings to ask for Face ID, Touch ID or your passcode when MileClear opens. \"Ask again\" sets how soon it locks again.",
    android: "Yes. Turn on App lock in More > Settings to ask for your fingerprint, face unlock or screen lock when MileClear opens. \"Ask again\" sets how soon it locks again.",
    goTo: "/settings",
    appOnly: true,
    keywords: ["lock", "password on the app", "face id", "fingerprint", "pin", "secure"],
  },
  {
    id: "website",
    area: "account_and_app",
    q: "Is there a website version?",
    a: "Yes. Sign in at mileclear.com with the same account to see and edit your trips, earnings, expenses, vehicles and tax figures on a bigger screen. Recording trips needs the phone app.",
    keywords: ["website", "laptop", "computer", "browser", "pc", "web"],
  },
  {
    id: "updates",
    area: "account_and_app",
    q: "How do I get the latest version?",
    a: "Most fixes arrive by themselves. When \"A new version of MileClear is ready\" shows, tap Restart. If something you've been told about isn't there, close MileClear fully (swipe it away) and open it again, twice. New builds also come through the App Store or Google Play.",
    appOnly: true,
    keywords: ["update", "latest", "version", "new version", "restart"],
  },
  {
    id: "android",
    area: "account_and_app",
    q: "Is MileClear on Android?",
    a: "Yes, on Google Play (search MileClear, or see mileclear.com/android). Your account works on both iPhone and Android.",
    keywords: ["android", "samsung", "google play", "play store"],
  },
  {
    id: "contact",
    area: "account_and_app",
    q: "How do I contact the team?",
    a: "More > Tell us about a problem or idea (also in More > Settings). \"Something's not right\" sends a private report with your phone's details and optional screenshots, and you can follow the reply under Your messages. \"Suggest an idea\" goes on the public board. You can also email support@mileclear.com, and EmSee can pass a message on.",
    goTo: "/feedback",
    keywords: ["contact", "support", "speak", "help", "email", "report", "problem", "bug", "idea", "suggest"],
  },
  {
    id: "emails",
    area: "account_and_app",
    q: "How do I stop the update emails?",
    a: "Tap Unsubscribe at the bottom of any update email, or on mileclear.com go to Settings > Notifications and emails and turn off Product news and tips. Emails you need, like sign-in codes and receipts, keep coming.",
    keywords: ["emails", "unsubscribe", "newsletter", "marketing", "stop sending"],
  },
  {
    id: "emsee",
    area: "account_and_app",
    q: "What can EmSee do?",
    a: "EmSee (More > Ask EmSee) answers questions about your MileClear records (miles, earnings, expenses, fuel, your mileage claim and tax-year figures), explains how MileClear works, gives general guidance on what drivers can usually claim, and passes your suggestions and problems to the team. It's part of Pro, with a daily question limit. It can't see your routes or addresses, and it can't change your records.",
    keywords: ["emsee", "assistant", "ai", "chat", "what can you do", "bot"],
  },
  {
    id: "community",
    area: "account_and_app",
    q: "Is there a community of drivers?",
    a: "Yes, a Discord for UK drivers: More > Settings > MileClear community, or discord.gg/Wxnvr3rzaq.",
    goTo: "/settings/community",
    keywords: ["community", "discord", "group", "chat", "other drivers", "forum"],
  },
  {
    id: "privacy",
    area: "account_and_app",
    q: "Who can see my data?",
    a: "Only you, plus anyone you choose to share with: your accountant (in Your accountant, where you can see every time they look) or your employer's team if you join one. Community figures like \"Drivers near you\" only show when at least 5 drivers contribute, so no one can be picked out. The privacy policy is on mileclear.com.",
    keywords: ["privacy", "who can see", "see", "see my trips", "safe", "share", "data", "private"],
  },

  // ── Insights and alerts ──────────────────────────────────────────────────
  {
    id: "insights",
    area: "insights_and_alerts",
    q: "Where are my stats and trends?",
    a: "Insights: a tab in Personal mode, and More > Insights in Work mode. Choose Week, Month or Tax year to see your miles, trips and claim, your records, badges and how you compare with drivers near you. Comparison with last week, pay per mile and the \"Go deeper\" sections are Pro. Tap Share to send a summary.",
    goTo: "/(tabs)/insights",
    keywords: ["stats", "statistics", "trends", "insights", "numbers", "summary", "monthly", "weekly", "recap", "share"],
  },
  {
    id: "records",
    area: "insights_and_alerts",
    q: "Where are my personal records?",
    a: "On Insights, in the records card: things like your longest trip and your best day and week for miles. They fill in after a few trips.",
    goTo: "/(tabs)/insights",
    keywords: ["records", "personal best", "longest", "best day"],
  },
  {
    id: "achievements",
    area: "insights_and_alerts",
    q: "How do badges and streaks work?",
    a: "Badges unlock as you hit milestones in miles, trips, shifts and money earned (your earnings plus invoices marked paid, with any earning linked to a paid invoice counted once): see them in More > Badges or the badges row on Insights. Your streak counts days in a row with a trip in Work mode, and weeks in a row in Personal mode. Both are free.",
    goTo: "/achievements",
    keywords: ["badges", "achievements", "streak", "milestones", "awards"],
  },
  {
    id: "weekly-goal",
    area: "insights_and_alerts",
    q: "Can I set a weekly miles goal?",
    a: "Yes. On Insights, tap Set a weekly goal and enter the miles. Tap it again to change or remove it.",
    goTo: "/(tabs)/insights",
    keywords: ["goal", "target", "weekly goal", "miles goal"],
  },
  {
    id: "benchmarks",
    area: "insights_and_alerts",
    q: "Can I compare myself with other drivers?",
    a: "Drivers near you, on Insights, compares your miles over the last 4 weeks with other MileClear drivers in your area. It's free, and only shows when at least 5 drivers contribute, so no one can be identified.",
    goTo: "/(tabs)/insights",
    keywords: ["compare", "other drivers", "near me", "average", "benchmark", "normal"],
  },
  {
    id: "notifications",
    area: "insights_and_alerts",
    q: "How do I choose which notifications I get?",
    a: "More > Settings > Notifications. The top line shows whether your phone allows MileClear notifications. Below, switch each on or off: trip reminders, the lock screen trip, shift alerts, tax deadlines, cheapest fuel near me, road alerts, streak reminders, the morning briefing and evening summary. Pro adds the end-of-shift summary, clean air zone reminders, mileage milestones and weekly and monthly summaries.",
    goTo: "/settings/notifications",
    keywords: ["notifications", "too many", "turn off", "alerts", "push", "reminders", "quiet"],
  },
  {
    id: "fuel-prices",
    area: "insights_and_alerts",
    q: "Does MileClear show fuel prices?",
    a: "Yes. More > Fuel shows Nearby Fuel Prices from the UK government's fuel price data; the map follows your main vehicle's fuel (diesel or unleaded). Electric car drivers see running costs and a link to rapid chargers nearby. You can also get a morning notification when a station near you is at least 3p a litre under the local average (More > Settings > Notifications).",
    goTo: "/(tabs)/fuel",
    keywords: ["fuel prices", "cheapest", "petrol station", "near me", "diesel price", "charger", "electric", "ev"],
  },
  {
    id: "road-alerts",
    area: "insights_and_alerts",
    q: "What are road alerts?",
    a: "A free trial that warns you before you usually set off if a road you use often is closed or badly delayed, at most once a day and never while you're driving. Turn on \"Road alerts on my usual roads\" in More > Settings > Notifications. More > Road alerts shows what's on your usual roads now and planned for the week ahead.",
    goTo: "/road-alerts",
    keywords: ["road alerts", "roadworks", "closures", "traffic", "delays"],
  },
  {
    id: "trip-roadworks",
    area: "insights_and_alerts",
    q: "Why does my trip show roadworks?",
    a: "Open a recorded trip and, if your route went through roadworks while they were in place, it lists them under \"Roadworks on your route\", for example temporary lights or a road closure booked there, with the works company. It helps explain a slow drive. It never changes your miles, times or business or personal choice. The works come from DfT Street Manager (England), so recent trips show them best; about two weeks after works finish they drop off.",
    keywords: ["roadworks on your route", "roadworks", "temporary lights", "road closed", "slow trip", "slow drive", "street manager"],
  },
];

/** Look up one answer by id. */
export function getHelpEntry(id: string): HelpEntry | undefined {
  return HELP_ENTRIES.find((e) => e.id === id);
}

/**
 * "Can I use MileClear outside the UK?" (23 Oct 2026). Held back while the
 * Country setting is off (COUNTRY_SETTING on the server): it points at
 * Settings > Country, which drivers can't see yet. Move it into HELP_ENTRIES
 * (account_and_app, after "kilometres") when the setting goes on for everyone.
 */
export const OUTSIDE_UK_HELP_ENTRY: HelpEntry = {
  id: "outside-uk",
  area: "account_and_app",
  q: "Can I use MileClear outside the UK?",
  a: "Yes. Recording, your trips, Business or Personal, shifts, earnings, expenses, fuel logs, badges and the trip report and trips CSV work in any country, and you can show distances in kilometres (More > Settings > Distances). Set where you drive in More > Settings > Country. The tax figures and UK features are for UK drivers for now, so outside the UK MileClear hides them: HMRC mileage claims, Self Assessment, Making Tax Digital, DVLA and MOT, UK fuel prices, roadworks, Clean Air Zones and the UK bank connection. In New Zealand, MileClear works out your claim at IRD kilometre rates instead.",
  goTo: "/settings/country",
  keywords: ["abroad", "outside the uk", "country", "ireland", "australia", "new zealand", "canada", "usa", "overseas", "international", "another country"],
};

/**
 * "How does MileClear work out my claim in New Zealand?" (23 Oct 2026). Held
 * back with OUTSIDE_UK_HELP_ENTRY: only New Zealand drivers can see the claim,
 * and only once the Country setting is on. The rates are IRD's 2025-26 ones
 * (packages/shared/src/tax/nz.ts); update both together each year.
 */
export const NZ_CLAIM_HELP_ENTRY: HelpEntry = {
  id: "nz-claim",
  area: "account_and_app",
  q: "How does MileClear work out my claim in New Zealand?",
  a: "With Inland Revenue's (IRD) kilometre rates, in NZ dollars, for the tax year 1 April to 31 March. Mark trips as Business and the claim shows on Home and Insights in Work mode; tap it to see each vehicle's figures. Tier 1 is for the business share of the first 14,000 km a vehicle travels in the year, personal driving included, and Tier 2 is for the business share of the rest. IRD's 2025-26 rates per km are petrol $1.20 then 37c, diesel $1.30 then 38c, petrol hybrid 90c then 24c, and electric $1.22 then 23c. IRD sets each year's rates after it ends, so until then the current year uses the latest ones and MileClear says so. IRD has no kilometre rate for plug-in hybrids, LPG or motorbikes, so there's no figure for those. Set your car's fuel type in your vehicle, and check with IRD or your accountant before you file.",
  goTo: "/(tabs)/insights",
  keywords: ["new zealand", "nz", "ird", "inland revenue", "kilometre rates", "km rates", "tier 1", "tier 2", "14,000", "ir3", "claim"],
};

/** The answer text for a phone platform ("ios" or "android"). */
export function helpAnswerFor(entry: HelpEntry, platform: "ios" | "android"): string {
  return platform === "android" && entry.android ? entry.android : entry.a;
}
