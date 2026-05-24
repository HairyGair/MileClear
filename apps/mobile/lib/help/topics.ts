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
        a: "Quarterly HMRC submissions, HMRC self-assessment PDF, CSV earnings import, Open Banking auto-import, auto-classify rules, business insights, journey map, accountant sharing, unlimited invoices, unlimited saved locations and vehicles.\n\n£4.99/month or £44.99/year. Cancel anytime from your Apple ID settings.",
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
