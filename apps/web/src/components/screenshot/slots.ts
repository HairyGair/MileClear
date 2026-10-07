// Source of truth for App Store screenshot slots. Each slot is a
// fully-designed composition: a headline, an accent gradient, a device
// capture source, and optional callouts pointing at on-screen features.
//
// Order matters: App Store Connect uploads slot 1 → 10 in this exact
// sequence and Apple's gallery shows them left-to-right. 60-70% of
// viewers see only slots 1-3 - those carry the conversion weight, so
// the order is benefit-first (saving, tax) then feature-detail.
//
// Add a new slot by extending the array. The composer route renders any
// slot at the device size requested in the URL.

export type AccentTheme = "amber" | "emerald" | "sky" | "violet" | "rose";

export interface Callout {
  // Position is expressed as percentages of the device frame's inner
  // canvas so the same callout maps to both iPhone and iPad sizes.
  xPct: number;
  yPct: number;
  label: string;
  // Which side of the dot the label sits on
  align?: "left" | "right" | "above" | "below";
}

export interface ScreenshotSlot {
  slot: number;
  slug: string;
  // Which App Store page the slot belongs to. "main" is the default
  // product page; the others are custom product pages and product page
  // tests (docs/app-store-pages-oct2026/PLAN.md). Slugs are unique
  // across every set.
  set?: "main" | "personal" | "test";
  // Eyebrow text above the headline (small uppercase)
  eyebrow?: string;
  headline: string;
  subline?: string;
  // Source image (relative to /public). Captured from a real device at
  // native resolution. iPhone 6.9" = 1320x2868, iPad Pro 13" = 2064x2752.
  // Missing source = renders a placeholder so layout can be reviewed
  // before captures are taken.
  iphoneSrc?: string;
  ipadSrc?: string;
  accent: AccentTheme;
  // Optional badge text in the corner (e.g. "NEW", "1.2.0", "PRO")
  badge?: string;
  // Annotations pointing at features
  callouts?: Callout[];
  // Layout variants:
  //   "centered"      - device dead-centre with copy above (default)
  //   "tilted"        - small left rotation (-1.5°) for editorial slots
  //   "tilted-right"  - small right rotation (+1.5°) - alternate the
  //                     direction across the carousel to create rhythm
  //   "split"         - iPad: copy left, device right
  //   "stack"         - hero composition: glow + tilt + secondary
  //                     accent shapes. Reserved for slot 1 by convention.
  layout?: "centered" | "tilted" | "tilted-right" | "split" | "stack";
  // Optional flag - TRUE if the captured device screen still needs a
  // refreshed grab from a current build. Render still happens, this is
  // only a hint for whoever's iterating.
  needsRecapture?: boolean;
  recaptureNote?: string;
}

// Reorder rationale (21 May 2026):
//   1. Hero - new "Drive. We do the tax." benefit-led headline
//   2. Tax Readiness - leads with the real £ number, the strongest hook
//   3. MTD ITSA - regulatory + feature lift
//   4. Live Activity - moment-of-truth "while driving" image
//   5. Auto-classify - convenience punch
//   6. Trip filter - power-user feature
//   7. Invoices - sole-trader call-out
//   8. Achievements - reach the free-tier delight
//   9. Pricing - earlier than before so price-sensitive users decide here
//  10. Privacy - quiet closer, UK pride
export const SLOTS: ScreenshotSlot[] = [
  {
    slot: 1,
    slug: "hero",
    eyebrow: "Mileage tracker for the UK",
    headline: "Drive.\nWe do the tax.",
    subline: "MileClear turns every mile into tax-ready numbers. Built for UK self-employed drivers and PAYE employees.",
    iphoneSrc: "/screenshot-source/iphone/01-dashboard.png",
    ipadSrc: "/screenshot-source/ipad/01-dashboard.png",
    accent: "amber",
    badge: "1.3.5",
    layout: "stack",
    callouts: [
      // Anchors on the £46.92 tax-saved figure mid-screen. xPct/yPct
      // are percentages of the captured screen (not the full canvas).
      { xPct: 46, yPct: 41, label: "Live HMRC estimate", align: "right" },
    ],
  },
  {
    slot: 2,
    slug: "first-tax-return",
    eyebrow: "First Self Assessment?",
    headline: "Plain English,\nstep by step.",
    subline: "Six steps from trips to a filled-in SA103. Your income lands in the right HMRC boxes without a spreadsheet.",
    iphoneSrc: "/screenshot-source/iphone/04-tax-readiness.png",
    ipadSrc: "/screenshot-source/ipad/04-tax-readiness.png",
    accent: "amber",
    layout: "centered",
  },
  {
    slot: 3,
    slug: "mtd-itsa",
    eyebrow: "Making Tax Digital",
    headline: "Quarterly updates,\nbuilt in.",
    subline: "Connect HMRC, see your deadlines, preview every figure. In beta on HMRC's test service until production credentials are granted.",
    iphoneSrc: "/screenshot-source/iphone/02-hmrc.png",
    ipadSrc: "/screenshot-source/ipad/02-hmrc.png",
    accent: "emerald",
    badge: "MTD ITSA",
    layout: "centered",
    needsRecapture: true,
    recaptureNote:
      "Current capture shows the Connect step with a beta strip - replace with a capture of a SUBMITTED quarter (status pill: Submitted ✓) once production credentials are granted. Beta language risks an App Store reviewer flag.",
  },
  {
    slot: 4,
    slug: "live-activity",
    eyebrow: "Track on autopilot",
    headline: "One tap.\nThe road does\nthe rest.",
    subline: "One tap to start. Road-accurate GPS - plus busiest times and cheapest fuel from drivers near you.",
    iphoneSrc: "/screenshot-source/iphone/03-live-activity.png",
    ipadSrc: "/screenshot-source/ipad/03-live-activity.png",
    accent: "sky",
    layout: "tilted",
  },
  {
    slot: 5,
    slug: "split-trip",
    eyebrow: "Multi-drop days",
    headline: "One run.\nEvery drop\ncounted.",
    subline: "Delivery block recorded as one long trip? MileClear finds the stops and splits it - miles intact, every leg classified.",
    iphoneSrc: "/screenshot-source/iphone/11-split-trip.png",
    accent: "rose",
    badge: "NEW",
    layout: "tilted-right",
  },
  {
    slot: 6,
    slug: "auto-classify",
    eyebrow: "Saved locations",
    headline: "Home and work.\nTrips classify\nthemselves.",
    subline: "Pin where you drive from. Business and personal sorted on save.",
    iphoneSrc: "/screenshot-source/iphone/05-auto-classify.png",
    ipadSrc: "/screenshot-source/ipad/05-auto-classify.png",
    accent: "emerald",
    layout: "centered",
    needsRecapture: true,
    recaptureNote:
      "Current capture only has Home + Work and leaves 60% of the screen empty. Re-shoot with at least 3 saved locations (Home, Work, Depot) so the device frame doesn't look unfinished.",
  },
  {
    slot: 7,
    slug: "road-accurate",
    eyebrow: "Filter your fleet",
    headline: "Business\nor personal.\nFilter the rest.",
    subline: "Tag by platform - Uber, Deliveroo, Just Eat, Amazon Flex. Filter by month, tax year, or mode.",
    iphoneSrc: "/screenshot-source/iphone/06-route.png",
    ipadSrc: "/screenshot-source/ipad/06-route.png",
    accent: "sky",
    layout: "tilted-right",
  },
  {
    slot: 8,
    slug: "invoices",
    eyebrow: "Sole traders",
    headline: "Invoices in.\nTax sorted.",
    subline: "Track who owes you, mark paid, set aside the weekly tax. No collections workflow you don't need.",
    iphoneSrc: "/screenshot-source/iphone/07-invoices.png",
    ipadSrc: "/screenshot-source/ipad/07-invoices.png",
    accent: "amber",
    badge: "PRO",
    layout: "tilted-right",
  },
  {
    slot: 9,
    slug: "free-tier",
    eyebrow: "Streaks and milestones",
    headline: "Make the tax\nstuff feel\nless taxing.",
    subline: "39 milestones, streaks, personal records. The mileage app that gives a damn whether you keep going.",
    iphoneSrc: "/screenshot-source/iphone/08-free.png",
    ipadSrc: "/screenshot-source/ipad/08-free.png",
    accent: "violet",
    layout: "tilted",
  },
  {
    slot: 10,
    slug: "benchmarking",
    eyebrow: "How you compare",
    headline: "See how you\nstack up.",
    subline: "Anonymous benchmarks from real UK MileClear drivers - weekly miles, trips, per-platform. Nothing shown below 5 contributors.",
    iphoneSrc: "/screenshot-source/iphone/12-benchmarking.png",
    accent: "violet",
    layout: "centered",
  },
  {
    slot: 11,
    slug: "pro",
    eyebrow: "MileClear Pro",
    headline: "Pro.\nThe whole\ntax engine.",
    subline: "Every export, business insights, accountant sharing, Open Banking, auto-classify. All of it, one upgrade.",
    iphoneSrc: "/screenshot-source/iphone/10-pro.png",
    ipadSrc: "/screenshot-source/ipad/10-pro.png",
    accent: "emerald",
    badge: "PRO",
    layout: "tilted-right",
  },
  {
    slot: 12,
    slug: "your-data",
    eyebrow: "Privacy by default",
    headline: "Your data.\nAlways yours.",
    subline: "On-device tracking, UK servers, no third-party analytics on your routes. Export everything any time - GDPR Article 20 built in.",
    iphoneSrc: "/screenshot-source/iphone/09-privacy.png",
    ipadSrc: "/screenshot-source/ipad/09-privacy.png",
    accent: "sky",
    layout: "tilted",
  },
];

// Captured 7 Oct 2026 on the new tab-bar UI (iPhone 17 simulator,
// Anthony's own account at his request; no demo seed needed).
const OCT = "/screenshot-source/iphone-oct";

// "Everyday personal drivers" custom product page. Leads with the map,
// no tax talk. Apple's rules: no prices, no other platforms' logos.
export const PERSONAL_SLOTS: ScreenshotSlot[] = [
  {
    slot: 1,
    slug: "p-map",
    set: "personal",
    eyebrow: "Everyday driving",
    headline: "Every mile,\nmapped.",
    subline: "Today, this week or this month. All your routes in one view.",
    iphoneSrc: `${OCT}/journey-map.png`,
    accent: "amber",
    layout: "stack",
  },
  {
    slot: 2,
    slug: "p-home",
    set: "personal",
    eyebrow: "Hands off",
    headline: "It records.\nYou drive.",
    subline: "MileClear notices when you drive and saves the journey on its own.",
    iphoneSrc: `${OCT}/home-personal.png`,
    accent: "amber",
    layout: "centered",
  },
  {
    slot: 3,
    slug: "p-trip",
    set: "personal",
    eyebrow: "Every journey",
    headline: "Tap a trip.\nSee the lot.",
    subline: "Route, times and miles for every drive. One tap to mark it business or personal.",
    iphoneSrc: `${OCT}/trip-summary.png`,
    accent: "sky",
    layout: "tilted",
  },
  {
    slot: 4,
    slug: "p-trips",
    set: "personal",
    eyebrow: "Your trips",
    headline: "Everywhere\nyou've been.",
    subline: "A tidy list of your drives, newest first, with a map for each one.",
    iphoneSrc: `${OCT}/trips-all.png`,
    accent: "sky",
    layout: "tilted-right",
  },
  {
    slot: 5,
    slug: "p-routes",
    set: "personal",
    eyebrow: "Regular runs",
    headline: "Know your\nusual routes.",
    subline: "How often you drive them, how long they take, and your best time.",
    iphoneSrc: `${OCT}/insights-trends.png`,
    accent: "violet",
    layout: "centered",
  },
  {
    slot: 6,
    slug: "p-costs",
    set: "personal",
    eyebrow: "Running costs",
    headline: "What your\ndriving costs.",
    subline: "Miles by day, and an estimate of what the fuel cost you this month.",
    iphoneSrc: `${OCT}/insights.png`,
    accent: "emerald",
    layout: "tilted",
  },
  {
    slot: 7,
    slug: "p-fuel",
    set: "personal",
    eyebrow: "Fuel nearby",
    headline: "Find cheaper\nfuel nearby.",
    subline: "Today's prices from stations around you, on a map or as a list.",
    iphoneSrc: `${OCT}/fuel-map-full.png`,
    accent: "emerald",
    layout: "tilted-right",
  },
];

// Product page test (first test, Oct 2026): the default page's first
// screenshot replaced by this one, everything else unchanged.
export const TEST_SLOTS: ScreenshotSlot[] = [
  {
    slot: 1,
    slug: "t-hero",
    set: "test",
    eyebrow: "Mileage tracker for the UK",
    headline: "Every mile,\ncounted.",
    subline: "MileClear records your drives on its own and works out your mileage claim at HMRC rates.",
    iphoneSrc: `${OCT}/home-work.png`,
    accent: "amber",
    layout: "stack",
  },
];

export const ALL_SLOTS: ScreenshotSlot[] = [...SLOTS, ...PERSONAL_SLOTS, ...TEST_SLOTS];

export function getSlot(slugOrNumber: string): ScreenshotSlot | undefined {
  const asNumber = parseInt(slugOrNumber, 10);
  if (!Number.isNaN(asNumber)) {
    return SLOTS.find((s) => s.slot === asNumber);
  }
  return ALL_SLOTS.find((s) => s.slug === slugOrNumber);
}
