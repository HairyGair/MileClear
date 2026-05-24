// Single source of truth for in-app help topics. Used by:
//   - /help (the full Help & Tutorials screen) — renders all topics
//   - ContextualHelp component — looks up a single topic by id and
//     renders it in a bottom sheet next to the UI it explains
//
// When you add a new topic, give it a stable `id` (kebab-case) and
// add it to the appropriate section. Don't break existing ids — they
// might be referenced from ContextualHelp call sites across screens.

import type { Ionicons } from "@expo/vector-icons";

export interface HelpTopic {
  id: string;
  q: string;
  a: string;
  /** Optional deep-link to the screen this topic is about — shown as
   *  "Open" instead of "Got it" on the contextual help sheet. */
  goTo?: string;
  /** Optional external article. */
  externalUrl?: string;
}

export interface HelpSection {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  topics: HelpTopic[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Getting started",
    icon: "rocket-outline",
    topics: [
      {
        id: "what-it-does",
        q: "What does MileClear do for me?",
        a: "MileClear automatically records every mile you drive for work and calculates the tax deduction HMRC owes you back. Unlike most mileage trackers, the tracking itself is unlimited and free - no monthly drive cap, no \"upgrade to keep recording\" paywall. MileIQ stops you at 40 drives a month, Driversnote at 20; MileClear never does.\n\nAt year-end you can export a PDF Self Assessment, submit quarterly returns direct to HMRC, or hand the numbers to your accountant.\n\nFrom tax year 2026-27 (trips on or after 6 April 2026) the standard rate is 55p per mile for the first 10,000 business miles and 25p after - up from the previous 45p first tier. MileClear applies the correct rate per tax year automatically.",
      },
      {
        id: "trip-detection",
        q: "How does MileClear know when I'm driving?",
        a: "Two ways. Drive past 15mph for more than a few minutes and the app starts a recording automatically (\"watch-and-wait\" detection). Or set up saved locations like Home and Work, and we'll auto-detect when you leave one and arrive at another — the Lock Screen shows a Live Activity from the moment you cross the boundary.\n\nYou can also add trips manually from the dashboard if the detection missed one.",
      },
      {
        id: "modes",
        q: "Work mode vs Personal mode?",
        a: "Top of the dashboard — switch between Work and Personal whenever your day changes. Work mode shows your tax deduction, business insights, and HMRC tooling. Personal mode shows journey timeline, milestones, and fuel costs.\n\nIf you do both, set your dashboard mode to \"Both\" in Settings to see everything at once.",
        goTo: "/settings/general",
      },
      {
        id: "first-trip",
        q: "I just installed the app — what should I do first?",
        a: "Five things in order:\n\n1. Add your vehicle in Settings → Vehicles. We need fuel type + MPG to calculate fuel costs.\n2. Allow notifications when prompted. Push is how we send trip-classify nudges, MOT reminders, and the streak / recap pings.\n3. Pin Home and Work as saved locations (Settings → Saved Locations). The app will then auto-detect trips between them. After you've taken a handful of trips MileClear suggests other places to pin, surfaced as a sparkles card on the dashboard.\n4. Take your first drive. You'll see a \"Trip Active\" Live Activity on the Lock Screen.\n5. Optional but recommended: join the Discord (Profile → Settings → Community) for tax tips, platform talk and product updates from other UK drivers.",
      },
      {
        id: "unlimited-free",
        q: "Why is MileClear free? What's the catch?",
        a: "There isn't one. Trip tracking, auto-detection, classification, HMRC rate calculation, fuel prices, gamification, Tax Readiness, Anonymous Benchmarking, HMRC Reconciliation, MOT history, two saved locations - all free, with no monthly drive cap.\n\nFor comparison: MileIQ caps the free tier at 40 drives a month then charges £5.99 to keep tracking. TripLog also caps at 40. Driversnote caps at 20. MileClear doesn't cap the tracker, ever - that's the whole point.\n\nPro (£4.99/month or £44.99/year) only covers tax-time work and analyst extras: PDF / CSV / Self Assessment exports, the SA103 wizard, Accountant Portal, receipt scanning, CSV earnings import, Open Banking auto-import, business insights, unlimited saved locations and vehicles. It never gates the tracker.",
      },
      {
        id: "discord-community",
        q: "Is there a community I can join?",
        a: "Yes - Profile → Settings → Community, or jump straight to discord.gg/Wxnvr3rzaq. UK drivers (gig + employee + sole trader), tax chat, platform talk, fuel deals, and product updates from Anthony (founder). No obligation, no DMs from us unless you start a thread.\n\nLaura's tip: pin the #tax-questions channel - tax season gets busy and answers there save you an accountant call.",
        externalUrl: "https://discord.gg/Wxnvr3rzaq",
      },
      {
        id: "siri-shortcuts",
        q: "What Siri Shortcuts does MileClear support?",
        a: "Hands-free commands (set up once in iOS Settings → Siri & Search → MileClear):\n\n• \"Hey Siri, start my shift\" - kicks off a new shift\n• \"Hey Siri, end my shift\" - ends the active shift + shows scorecard\n• \"Hey Siri, how many miles today?\" - speaks your today's total\n• \"Hey Siri, log expense\" - opens the expense form\n• \"Hey Siri, what's my tax estimate?\" - speaks current Tax Readiness figure\n\nGreat for CarPlay - you can use them while driving without picking up the phone. Customise the trigger phrase to whatever you want (e.g. \"start work\", \"end work\") in the Shortcuts app.",
      },
    ],
  },
  {
    title: "Tax & HMRC",
    icon: "calculator-outline",
    topics: [
      {
        id: "tax-readiness",
        q: "What's the Tax Readiness card?",
        a: "Real-time estimate of what you'll owe HMRC at the end of the current tax year, based on the trips and earnings you've recorded so far. The \"Set aside\" line tells you what to save each week to cover both income tax and Class 4 NI on your gig profits.\n\nThe more accurate your earnings + trip data is, the better the estimate.",
      },
      {
        id: "mtd-itsa",
        q: "What is MTD ITSA?",
        a: "Making Tax Digital for Income Tax Self Assessment. From April 2026, sole traders earning over £50k a year must submit four quarterly returns to HMRC plus a year-end statement — no more single January 31 Self Assessment.\n\nMileClear's Pro tier handles all four quarters automatically. Avatar → Work & Tax → MTD ITSA. Currently in sandbox mode while HMRC reviews our production accreditation.",
        goTo: "/tax-mtd",
      },
      {
        id: "paye-offset",
        q: "I have a day job too — does MileClear handle that?",
        a: "Yes. Settings → Work & Tax → enter what your employer has already deducted in PAYE this year (it's on your most recent payslip, year-to-date tax line). Tax Readiness then shows what you STILL owe on top of PAYE, rather than the full gross liability.",
        goTo: "/settings/work-tax",
      },
      {
        id: "cash-vs-accruals",
        q: "Cash or accruals basis — what's the difference?",
        a: "Cash basis (default since April 2024 for most sole traders) counts invoice income when the money actually arrives in your account. Accruals counts it when you sent the invoice, regardless of payment.\n\nUnless your accountant has told you otherwise, leave it on cash. It matches how the money actually flows.",
      },
      {
        id: "accountant",
        q: "I pay an accountant — can I factor that in?",
        a: "Settings → Work & Tax → Sole Trader → My Accountant. Enter their annual filing fee. We spread it across 52 weeks and add it to your weekly set-aside, so by filing season the cash is already there for both the tax and the accountant.",
        goTo: "/accountant",
      },
      {
        id: "employer-mileage",
        q: "My employer reimburses me for mileage — what do I enter?",
        a: "Settings → Work & Tax → set Work type to \"Employee using own vehicle\" or \"Both\", then enter your employer's per-mile rate. MileClear shows you the gap between what they pay and HMRC's 55p / 25p (up from 45p / 25p on 6 April 2026) - that's the amount you can recover at year-end via Mileage Allowance Relief on a P87 or Self Assessment.",
        goTo: "/settings/work-tax",
      },
      {
        id: "accountant-sharing",
        q: "Can my accountant log in to see my numbers? (Pro)",
        a: "Yes — Settings → Work & Tax → Accountant Sharing. Generate a read-only link, send it to your accountant. They get a clean dashboard with all your trips, earnings, invoices, and HMRC figures. No password handover, no email forwarding. Pro feature.",
      },
      {
        id: "hmrc-rates",
        q: "What are the HMRC mileage rates?",
        a: "Car / van: 55p per mile for the first 10,000 business miles, 25p per mile after that (rate rose from 45p to 55p on 6 April 2026 - tax year 2026-27 onwards). Motorbike: 24p flat rate, unchanged. MileClear applies the correct rate per tax year to every business trip automatically and tracks where you sit on the 10,000-mile threshold.",
      },
      {
        id: "which-rate-applies",
        q: "Why is one trip at 45p and another at 55p?",
        a: "The HMRC car/van rate for the first 10,000 business miles went up from 45p to 55p on 6 April 2026 - the start of the 2026-27 tax year. MileClear uses the rate that was in force on the date each trip happened, automatically:\n\n• Trips on or before 5 April 2026 → 45p first 10k, 25p after\n• Trips on or after 6 April 2026 → 55p first 10k, 25p after\n• The 24p motorbike rate is unchanged across both years\n\nSo if you have trips in both tax years, the totals split correctly - you don't lose anything from older trips, and you get the new rate the moment 6 April 2026 ticked over. Same applies if HMRC change the rate again in future.",
      },
      {
        id: "tax-readiness-breakdown",
        q: "How is the Tax Readiness estimate calculated?",
        a: "Earnings (gig + invoices) minus AMAP mileage deduction minus expenses = taxable profit. Then we apply:\n\n• Personal allowance £12,570 (free of income tax)\n• Basic rate 20% (£12,570 to £50,270)\n• Higher rate 40% (£50,270 to £125,140)\n• Additional rate 45% (over £125,140)\n• Class 4 NI 6% on profits over £12,570\n• Class 2 NI £3.45/week if profits over £6,725\n\nIf you've also got PAYE income, Settings → Work & Tax → enter your year-to-date PAYE tax. We then show only what you still owe on top, not the full gross liability.\n\nThe Set-aside line divides what you owe by the number of weeks left in the tax year, so you can drip money into a savings pot rather than scramble at filing time.",
      },
      {
        id: "hmrc-reconciliation",
        q: "What's HMRC Reconciliation?",
        a: "From 2024, UK gig platforms (Uber, Deliveroo, Amazon Flex etc) must report your earnings directly to HMRC via the Digital Platform Reporting Rules. HMRC pre-populates your Self Assessment with their figures.\n\nDashboard → HMRC Reconciliation lets you enter what each platform told HMRC, side-by-side with what MileClear tracked. Differences are flagged - usually a platform's figure includes tips you got in cash and didn't log, OR excludes the side jobs you did off-app. Catch it now, not in a year-end HMRC enquiry.",
        goTo: "/hmrc-reconciliation",
      },
      {
        id: "anonymous-benchmarking",
        q: "What's the Anonymous Benchmarking card?",
        a: "Shows how your weekly miles, trips and earnings compare to the median of other UK MileClear drivers in your area. Per-platform breakdowns light up when at least 5 other drivers contribute to a cell (the privacy floor - no individual can be identified). Helps answer \"is my £18/hr from Uber normal or am I underperforming?\" without having to ask in a Facebook group.\n\nFree tier. Your figures contribute anonymously when there are enough other drivers in your area; below the privacy floor, nothing is shared.",
      },
      {
        id: "activity-heatmap",
        q: "What does the Activity Heatmap show?",
        a: "7-by-24 grid of when you actually drive and earn most across the last 12 weeks. Brighter cells = more activity. Switch between trips and earnings views; filter by platform (Pro) to see, for example, whether Just Eat Friday-night peaks beat Saturday-lunch.\n\nGreat for spotting your real \"golden hours\" so you can stop guessing when to start a shift. Tap any cell for the trip count, total earnings and average pence per mile in that slot.",
      },
      {
        id: "sa-wizard",
        q: "How does the Self Assessment wizard work? (Pro)",
        a: "Avatar → Work & Tax → Self Assessment. Walks you box-by-box through the HMRC SA103 (self-employment) form your tax return needs.\n\nEach box shows the figure MileClear calculated, the rule HMRC uses, and where to enter it on the actual return. Boxes 9 (turnover), 20 (allowable expenses), 31 (motor expenses or simplified mileage), 64 (taxable profit). At the end, generate a signed PDF with an attestation cover sheet HMRC inspectors recognise.\n\nFree wizard view; PDF export is Pro.",
        goTo: "/self-assessment",
      },
      {
        id: "first-tax-return",
        q: "It's my first ever Self Assessment - help?",
        a: "Avatar → Work & Tax → First Self Assessment? Read the guide. Plain-English walkthrough covering UTR registration (10-digit number HMRC issues, takes 10 working days), the tax year (6 April to 5 April), what you actually pay (income tax + Class 2 NI + Class 4 NI), the AMAP mileage deduction (45p/55p per car/van mile), and the 31 January deadline.\n\nIf you've earned over £1,000 from self-employment in a tax year, you must register and file - even if you also have a day job.",
        goTo: "/first-tax-return",
      },
    ],
  },
  {
    title: "Trips",
    icon: "car-outline",
    topics: [
      {
        id: "manual-trip",
        q: "How do I add a trip manually?",
        a: "Dashboard → Start Trip → Manual. Enter the start and end address (or pick on the map), set the date, classify as Work or Personal, save.\n\nManual trips use our routing engine for accurate distance — the same address pair always returns the same mileage.",
      },
      {
        id: "classification",
        q: "How does auto-classification work?",
        a: "Tag the same A → B journey as Work three times consistently, and the fourth time MileClear suggests Work automatically. After saving you'll see a toast confirming the auto-decision — tap to override if it's wrong.\n\nFor auto-detected trips, the Lock Screen confirmation push leads with the suggestion: \"Work trip detected — Tap Yes, Work to confirm.\"",
      },
      {
        id: "wrong-distance",
        q: "A trip's distance looks wrong",
        a: "Open the trip → Recalculate distance. Hits our routing engine on demand. For sparse-GPS trips, also try Settings → Data Quality → Recheck suspicious trips — we'll re-route any trip with low confidence in bulk.",
      },
      {
        id: "confidence",
        q: "What does the High / Medium / Low badge mean?",
        a: "Confidence level for each trip's distance figure, based on GPS sample quality, breadcrumb count, route verification, and average speed sanity. Tap any badge for the plain-English breakdown. High = bulletproof for HMRC defence; Low = worth a Recalculate before you rely on it.",
      },
      {
        id: "saved-location-suggestions",
        q: "MileClear suggested some places I should save - what are they?",
        a: "After you've taken at least 3 trips ending in roughly the same spot, MileClear clusters those endpoints and surfaces them as a sparkles card on the dashboard: \"MileClear spotted N places in your recent trips.\"\n\nTap Review suggestions to see them on a list. Each one shows how many times you've visited and where. Save the ones that mean something - Home, your usual depot, the gym, your kid's school - so journeys appear in the trip list with a name you recognise instead of a postcode.\n\nSaved suggestions don't auto-enable geofencing (no trip auto-confirming from them yet); they're just anchor points. Pinning the right places makes the trip log read like a diary instead of a map.",
        goTo: "/saved-locations-suggest",
      },
      {
        id: "saved-locations-pin",
        q: "How do I pin a place manually?",
        a: "Profile menu → Saved Locations → Add. Search by name or address, drop the pin precisely with the map picker, set the type (home / work / depot / custom) and the geofence radius (default 100m, MileClear adapts based on observations).\n\nFree tier: 2 saved locations. Pro: unlimited. Once pinned, MileClear stops auto-detecting trips while you're parked there (saves battery), uses the name in your trip list, and can auto-classify trips between two saved locations.",
        goTo: "/saved-locations",
      },
      {
        id: "live-activity",
        q: "What's the Lock Screen \"Trip Active\" thing?",
        a: "iOS Live Activity. While a trip is recording, the Lock Screen and Dynamic Island show live distance, duration, and a tap-to-end-trip button - no need to unlock the phone or open the app.\n\nLong-press the Dynamic Island to expand it (full controls). Tap the live indicator to jump straight to the Active Recording screen. End the trip from the Lock Screen with a single press of the End Trip button.\n\nNot showing? See \"Live Activity not showing on the Lock Screen\" in the Troubleshooting section.",
      },
      {
        id: "shift-mode",
        q: "What's Shift mode?",
        a: "A wrapper around multiple trips that belong to one work session. Dashboard → Start Shift. While a shift is active, every trip you take is grouped into it - so an Uber driver's Friday-night shift shows total earnings, total miles, and the pickup-to-pickup wait times in one screen.\n\nEnd the shift to get a Shift Scorecard - A to F grade based on miles, earnings per mile, dead-mile %, and shift length. Useful for figuring out which night of the week is actually worth driving.\n\nDoesn't have to be gig work - couriers, taxi drivers, anyone who works in identifiable blocks gets value from shifts.",
      },
      {
        id: "shift-scorecard",
        q: "How is my Shift Scorecard graded?",
        a: "A to F based on four factors:\n\n• Earnings per mile (higher = better)\n• Earnings per hour (factoring in dead time)\n• Dead-mile % (miles between paid jobs)\n• Shift length sanity (very short or 14h+ shifts score lower)\n\nGrade thresholds are calibrated against UK gig-driver medians, so a B is genuinely above-average, not a participation trophy. Free for all users.",
      },
      {
        id: "pickup-wait-timer",
        q: "What's the Pickup Wait timer?",
        a: "When you arrive at a restaurant or depot to collect an order, tap \"Wait at pickup\" - a stopwatch starts. Survives app suspension and locks. Tap again when the food/parcel is in the car to log how long you waited.\n\nFree: see your own wait times in the shift recap. Pro: community insights light up - \"Wagamama Aldgate averages 12 min, Pret Holborn 4 min\" - so you know which restaurants to avoid stacking and which are quick.",
      },
      {
        id: "trip-merge",
        q: "Can I merge trips that were split incorrectly?",
        a: "Yes. Trip list → long-press a trip to enter selection mode → tap each one you want to merge (up to 20). Set the classification + platform for the merged trip and confirm. Useful when a fuel stop or a brief restaurant pickup split one journey into two.\n\nMerge is irreversible (you can't unsplit later) so double-check before confirming. MileClear also suggests merges automatically when two trips are <2 min apart with low confidence - look for the \"merge suggestion\" banner on the trip detail screen.",
      },
      {
        id: "auto-classify-rules",
        q: "How do auto-classify rules work? (Pro)",
        a: "Settings → Auto-classify. Three triggers:\n\n• Time of day - e.g. trips between 06:00 and 18:00 on weekdays = Work\n• Saved-location pair - trips between Home and Depot = Work\n• Work Schedule - link to your Work Schedule (Profile → Schedule) so Monday-Friday 9-5 trips classify Work, Saturday classifies Personal\n\nRules run in priority order. After a rule matches, the trip auto-saves with the classification - no Lock Screen prompt needed. You can always override an auto-classified trip later.\n\nPro feature. Free users still get the per-A-to-B learning ('three Works = suggest Work').",
        goTo: "/settings/auto-classify",
      },
    ],
  },
  {
    title: "Money",
    icon: "card-outline",
    topics: [
      {
        id: "earnings",
        q: "Earnings vs invoices?",
        a: "Earnings = gig platform income (Uber, Deliveroo, Just Eat). Either typed in manually, imported from a platform CSV (Pro), or auto-imported via Open Banking (Pro).\n\nInvoices = freelance / consultancy work you've billed clients for. Free tier covers 3 invoices per calendar month; Pro unlimited.",
        goTo: "/(tabs)/earnings",
      },
      {
        id: "fuel",
        q: "Should I log fuel?",
        a: "Optional — but logging fuel unlocks running-cost analytics. The Personal dashboard shows pence-per-mile, monthly fuel spend, recent fill-ups. Doesn't affect HMRC mileage calculation (HMRC's rates already cover fuel as a notional allowance), just gives you the real picture of your driving costs.",
      },
      {
        id: "pro-features",
        q: "What's in Pro?",
        a: "Quarterly HMRC submissions, HMRC self-assessment PDF, CSV earnings import, Open Banking auto-import, the Bank-feed Inbox, receipt scanning, auto-classify rules, business insights, journey map, accountant sharing, unlimited invoices, unlimited saved locations and vehicles.\n\n£4.99/month or £44.99/year. Cancel anytime from your Apple ID settings.",
      },
      {
        id: "expenses",
        q: "What can I put in Expenses?",
        a: "Avatar menu → Expenses. Any taxable purchase that supports your work: parking, tolls, congestion / ULEZ, fuel (when you're claiming actual costs not the AMAP rate), insurance, phone bill, hotel for an out-of-town gig, repairs, accountant fees, subscriptions, equipment.\n\n17 categories mapped to the SA103S boxes HMRC actually uses on Self Assessment - so when tax time rolls around your numbers slot straight in. Add manually (Add expense) or via Scan Receipt to OCR the amount, date and vendor off a photo automatically.",
        goTo: "/expenses",
      },
      {
        id: "receipt-scanning",
        q: "How does receipt scanning work?",
        a: "Avatar → Expenses → Scan Receipt. Snap a photo or pick one from your library. Apple's on-device Vision OCR reads the amount, date and vendor straight off the paper and pre-fills the expense form for one-tap save.\n\nNothing leaves your phone - the OCR runs locally on the iPhone's Neural Engine, so receipts for sensitive stuff (medical, hotel) stay private. Apple Vision is the same engine that powers Live Text and Translate, so it handles thermal-print fuel receipts, faded parking stubs and crumpled hotel bills better than most cloud OCR services.\n\nWorks on Pro. The earnings receipt scanner uses the same pipeline.",
      },
      {
        id: "inbox",
        q: "What's the Bank-feed Inbox? (Pro)",
        a: "Connect your bank with Open Banking (Profile → Settings → Open Banking) and every transaction lands in a triage screen at Avatar → Inbox. Each row shows the merchant, amount, date and a suggested category dot - green for high confidence, amber for medium, grey for low.\n\nOne tap to Accept as Earning, Accept as Expense, or Ignore. The categoriser learns from every override - if you mark \"Costa Coffee\" as Subsistence twice, the third time it auto-suggests Subsistence with high confidence.\n\nKnown gig platforms (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, Gophr) still auto-import as Earnings in the background - the Inbox is for everything else.",
        goTo: "/inbox",
      },
      {
        id: "subsistence-rules",
        q: "Why is my meal expense flagged with a warning?",
        a: "HMRC rule SE57240 - daily meals on your regular working route aren't deductible (you'd have eaten anyway). Irregular journeys away from your normal pattern usually are - business travel that takes you well outside your usual area.\n\nMileClear shows the inline warning when you pick Subsistence or Accommodation so you only claim what's actually deductible. It's a guide, not a block - you can still save the expense if it qualifies. The warning helps you avoid the most common over-claim that triggers HMRC enquiries.",
      },
      {
        id: "project-labels",
        q: "What are project / client labels?",
        a: "Optional freeform tag on trips, earnings and expenses. Useful if you bill multiple clients (theatre techs, freelance photographers, mobile hairdressers with a regular salon list) - tag everything related to one gig with the same project name and the per-project P&L view tells you which client actually paid after fuel, parking and expenses came out.\n\nLeave blank if you're a single-stream gig driver - the field doesn't get in the way.",
      },
      {
        id: "open-banking",
        q: "What's Open Banking auto-import? (Pro)",
        a: "Profile → Settings → Open Banking → Connect. Use TrueLayer (FCA-authorised) to link your bank account read-only. Every transaction from that point on lands in the Bank-feed Inbox for one-tap triage.\n\nKnown gig platforms auto-promote straight to Earnings (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, Gophr). Everything else - fuel, parking, phone bill, hotel - goes to the Inbox with a suggested category.\n\nRead-only access only - we cannot move money or see account numbers. Disconnect any time from the same screen. Supports Monzo, Starling, Lloyds, Barclays, HSBC, NatWest, Santander, Revolut and ~20 more UK banks.",
        goTo: "/open-banking",
      },
      {
        id: "csv-earnings-import",
        q: "How do I import earnings from a platform CSV? (Pro)",
        a: "Avatar → Earnings → Import CSV. Drop in the CSV file you exported from the platform (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart - all auto-detected).\n\nMileClear maps the columns, shows a preview of what will be imported (with duplicate detection via external ID), and you confirm. Existing earnings won't be double-imported. Useful for back-filling weeks before you connected Open Banking, or for platforms we don't yet support via the bank feed.",
      },
      {
        id: "invoices",
        q: "How do invoices work?",
        a: "Avatar → Invoices. Track freelance / consultancy work you've billed clients for - sent date, due date, paid status, project label. When you mark an invoice paid, MileClear surfaces matching earnings (within ±50p / ±14 days) so you can link them - avoids double-counting the same money as both an earning and an invoice.\n\nFree tier: 3 invoices per calendar month. Pro: unlimited. Goal is a neat package for tax-time, not a full collections workflow - if you need that, use Xero or FreeAgent.",
      },
    ],
  },
  {
    title: "Vehicles & reminders",
    icon: "car-sport-outline",
    topics: [
      {
        id: "add-vehicle",
        q: "How do I add a vehicle?",
        a: "Profile → Settings → Vehicles → Add. Enter the registration plate and tap Look up - DVLA returns make, model, fuel type, and engine size automatically. Add MPG (rough figure is fine, MileClear refines it over time from your fuel logs) and you're done.\n\nMultiple vehicles: free tier supports 1, Pro supports unlimited. Each trip gets assigned to a vehicle so the right HMRC rate (car/van vs motorbike) applies.",
        goTo: "/vehicle-form",
      },
      {
        id: "mot-history",
        q: "How do I see my MOT history?",
        a: "Profile → Vehicles → tap a vehicle → View MOT History. The full DVSA record: every test, pass/fail, mileage at test, advisories, and minor / major / dangerous defects. Useful for spotting recurring issues (the same advisory three years running probably means a real problem) and for selling the car later (buyers love a clean history).\n\nFree feature - same DVSA data as gov.uk/check-mot-history, but laid out for drivers rather than mechanics.",
        goTo: "/vehicle-mot-history",
      },
      {
        id: "mot-tax-reminders",
        q: "How do MOT and road tax reminders work?",
        a: "Once you've added a vehicle by plate, MileClear refreshes the DVLA / DVSA data weekly. Push notification 14 days before either expires, with the exact date and a deep link to gov.uk to renew. Free feature.\n\nWorks for both MOT (annual roadworthiness test) and road tax (vehicle excise duty). If we get the dates wrong, tap the notification → Report issue → Anthony reads them and updates the cache.",
      },
      {
        id: "mpg-tracking",
        q: "What's MPG used for?",
        a: "Two things. First, the Personal dashboard estimates your fuel cost per mile from MPG + current fuel prices, so you can see total driving costs at a glance. Second, the per-shift fuel-cost estimate (when you haven't logged actual fuel) uses MPG to apportion fuel by miles driven.\n\nMPG entry is rough on day one. As you log fuel fill-ups with odometer readings, MileClear refines it from the actual miles-per-litre maths.",
      },
    ],
  },
  {
    title: "Progress & motivation",
    icon: "trophy-outline",
    topics: [
      {
        id: "achievements",
        q: "How do achievements work?",
        a: "18 milestone badges across miles driven, trips logged, shifts completed, classification consistency, and streaks. Unlock notifications appear in real-time as you hit each threshold; the full grid lives at Avatar → Achievements.\n\nGamification is intentionally subtle - no flashing animations or coin-collecting. The point is to make it satisfying to keep logging, not to manipulate you into using the app more than you need to. Free for all users (was a Pro perk until May 2026; we moved it to free because gating motivation felt wrong).",
        goTo: "/achievements",
      },
      {
        id: "streaks",
        q: "What counts as a streak?",
        a: "Any day where you've taken at least one trip (business or personal). Streak resets if you skip a day. Visible on the dashboard as a flame icon with the day count.\n\nIf you genuinely don't drive every day, streaks can feel punishing - feel free to ignore them. The Tax Readiness card and Tax Summary are the metrics that actually matter for HMRC. Streaks are just a nudge to make sure you don't forget to record trips when you do drive.",
      },
      {
        id: "personal-records",
        q: "Where are my personal records shown?",
        a: "Dashboard (Personal mode) → Personal Records card. Longest single trip, most miles in a day, most miles in a week, longest streak, busiest day. Updates automatically; tap any record for the date and trip detail.\n\nFree feature. The same data feeds the shareable Personal Recap card (Avatar → Recaps → Share) if you want to brag on Discord.",
      },
      {
        id: "recaps",
        q: "What are the Weekly / Monthly / Yearly Recap modals?",
        a: "Friday afternoon and the first of every month, MileClear shows a recap modal on next app open: total miles, deduction earned, top platform, busiest day, achievements unlocked. End-of-tax-year (5 April) gets a bigger Yearly Recap with the full HMRC-deduction headline figure.\n\nIf you've dismissed one and want to see it again: Dashboard → tap the date period header. Recaps are also shareable as a clean card to Discord, WhatsApp, or wherever you brag about your numbers.",
      },
    ],
  },
  {
    title: "Account & subscription",
    icon: "person-circle-outline",
    topics: [
      {
        id: "sign-in-methods",
        q: "Email / password or Apple Sign-In - which should I use?",
        a: "Either works fine; pick whichever you find easier. Apple Sign-In skips password creation and is the fastest path (one tap with Face ID), but you'll need the same Apple ID forever - if you switch to Android one day, the account is tied to Apple.\n\nEmail + password works on iOS today and survives platform changes. We use bcrypt + JWT - no password ever stored in plaintext.\n\nIMPORTANT: don't mix methods. If you signed up with Apple, always sign in with Apple. Signing in with email after an Apple signup creates a new blank account, not access to your old data.",
      },
      {
        id: "restore-purchases",
        q: "I subscribed but Pro features aren't unlocked",
        a: "Profile → Settings → Subscription → Restore Purchases. Apple's StoreKit reads your account history and re-applies the Pro flag. Usually fixes it instantly.\n\nIf still no luck: email support@mileclear.com with the App Store receipt (Settings → [your name] → Media & Purchases → View Account → Purchase History). Anthony will manually link the purchase. Free turnaround - we don't leave anyone stranded after they've paid.",
      },
      {
        id: "cancel-pro",
        q: "How do I cancel Pro?",
        a: "Settings (iOS, the system one - not in MileClear) → [your name at top] → Subscriptions → MileClear Pro → Cancel Subscription. Apple handles the cancellation. You keep Pro features until the current billing period ends, then drop to free.\n\nYour data, trips, vehicles - all stay exactly as they are. You can resubscribe any time without losing anything.",
      },
      {
        id: "delete-account",
        q: "How do I delete my account?",
        a: "Profile → Settings → Delete Account. Type your password to confirm. Within 30 days, all your data is permanently erased - trips, vehicles, fuel logs, earnings, expenses, invoices - from MileClear's servers and any backups. If you have an active Pro subscription it'll be cancelled (you'll need to do this from Apple's Subscriptions screen too if you want a refund).\n\nThis is GDPR-compliant erasure. Once it's gone we cannot recover it. If you just want to take a break, sign out instead.",
      },
      {
        id: "gdpr-export",
        q: "Can I download all my data?",
        a: "Yes - Profile → Settings → Export My Data. Generates a JSON file with everything we hold about you: account, all trips and coordinates, vehicles, fuel logs, earnings, expenses, invoices, saved locations. Free, GDPR-compliant.\n\nUse it to import into another tool, hand to your accountant, or just to know what we have. We don't compress it or strip anything - what you see is what we have.",
      },
      {
        id: "marketing-emails",
        q: "How do I stop the product update emails?",
        a: "Either tap Unsubscribe in any email's footer (one-click, no login needed), or Profile → Settings → Email Preferences → toggle off Product Updates.\n\nWe keep this separate from transactional emails (verification codes, password reset, billing receipts) - those keep working because you need them. Marketing-only emails are the only ones the toggle silences.",
      },
    ],
  },
  {
    title: "Troubleshooting",
    icon: "construct-outline",
    topics: [
      {
        id: "la-not-showing",
        q: "Live Activity not showing on the Lock Screen",
        a: "Two things to check:\n\n1. Settings (iOS) → Notifications → MileClear → Live Activities — must be ON.\n2. Settings (iOS) → MileClear → Live Activities → also ON.\n\nIf both are on and you still don't see one, restart the app once.",
      },
      {
        id: "trips-not-syncing",
        q: "Trips not appearing on the web dashboard",
        a: "Open Settings → Sync Status. Pending trips upload as soon as you're back online. If you see \"failed\" items, tap Retry. Trips are always saved locally first — they don't get lost if sync is delayed.",
        goTo: "/sync-status",
      },
      {
        id: "logged-out",
        q: "I got logged out and ended up in a blank profile",
        a: "Known issue we've now fixed (1.2.0). If it happens, log out of the blank profile and sign in again using the method you originally signed up with (email + password, OR Apple ID — whichever you used first). You'll be back in your real account with all your data.",
      },
      {
        id: "battery",
        q: "Is GPS tracking going to kill my battery?",
        a: "MileClear uses iOS's significant-location-change API while you're stationary, and only escalates to active GPS during a recording. Typical impact is 2-4% per 8-hour shift. If you notice more than that, check Settings → Data Quality — your tracking permissions might be sub-optimal.",
      },
      {
        id: "notification-permission",
        q: "Why does MileClear keep asking for notifications?",
        a: "Three things stop working if push notifications are off:\n\n1. Trip-classify nudges. When MileClear auto-detects a trip ending, we send a Lock Screen push so you can tap \"Yes, Work\" or \"No, Personal\" in one tap - no opening the app.\n2. Recovery wakes. If iOS suspends the JS runtime mid-trip (common in deep background), our server-side watchdog sends a silent push to wake the app and drain the recording. Without push permission, stuck trips can sit for hours.\n3. MOT / road tax expiry reminders, streak prompts, and the weekly / monthly recap.\n\nIf you originally said no, you can flip it back on: Settings (iOS) → MileClear → Notifications → Allow Notifications.",
      },
      {
        id: "auto-detection-missed",
        q: "Auto-detection missed a trip - what now?",
        a: "Three layered fixes:\n\n1. Add it manually. Dashboard → Start Trip → Manual. Enter start + end address (or pick on the map), set the date, classify, save. The routing engine gives the same mileage for the same address pair every time, so HMRC accepts it.\n2. Check why it was missed. Settings → Data Quality. Common culprits: Location set to \"While Using\" instead of \"Always\", Background App Refresh off, app force-quit before the trip started, signal blackspot for the whole journey.\n3. Pin Home / Work / regular stops as saved locations. With those in place we don't need to rely on speed detection - the geofence picks up the moment you leave / arrive.\n\nIf detection's missing trips often, send a screenshot of Settings → Data Quality to support@mileclear.com - Anthony will work out what's tripping it.",
      },
      {
        id: "offline",
        q: "Will MileClear work without signal?",
        a: "Yes. Trip recording, classification, manual entries, fuel logs, earnings — all written to local SQLite first, no network needed. As soon as you're back online, the sync queue uploads everything to the server. You won't lose a mile in a tunnel, multi-storey car park, or rural blackspot.",
      },
      {
        id: "phantom-trip",
        q: "A trip got recorded that I didn't actually take",
        a: "Two common causes:\n\n1. Indoor GPS drift - the phone thinks it's moving when it's not (e.g. on a window sill, signal bouncing off walls). MileClear flags these as phantom trips and hides them from your HMRC totals by default. Trip list → filter Show Phantom to see them.\n2. The detection started but didn't end cleanly - the recording sat open with no movement. Open the trip and tap Delete; the next detection will work fine.\n\nIf phantom trips happen daily, send a screenshot of Settings → Data Quality to support@mileclear.com - usually a permission or accuracy setting issue.",
      },
      {
        id: "watchdog-wakes",
        q: "Why is my trip suddenly being saved hours after I drove?",
        a: "iOS sometimes suspends MileClear's background process before a trip finalises (low battery, thermal pressure, you've been off your phone). Our server-side watchdog notices when a recording has been quiet for >30 minutes and sends a silent push to wake the app and finish saving the trip. That's the gap you're seeing.\n\nIt's working as designed - the trip is captured, just saved late. If it bothers you, keep the app open at the end of your shift for 10 seconds before locking - that gives the periodic-tick a chance to drain the queue before iOS suspends the runtime.",
      },
      {
        id: "still-stuck",
        q: "Still stuck?",
        a: "Email support@mileclear.com with a description of what's happening + your device model. Anthony (founder) reads every email personally. Usual response within a few hours.",
      },
    ],
  },
];

// Flat lookup map for ContextualHelp.
const TOPIC_INDEX: Map<string, HelpTopic> = new Map();
for (const section of HELP_SECTIONS) {
  for (const topic of section.topics) {
    TOPIC_INDEX.set(topic.id, topic);
  }
}

/**
 * Look up a single topic by its stable id. Returns null when the id
 * isn't registered — call sites should fall back gracefully (e.g.
 * hide the help icon) rather than crash.
 */
export function getHelpTopic(id: string): HelpTopic | null {
  return TOPIC_INDEX.get(id) ?? null;
}
