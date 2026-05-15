// Source of truth for App Store screenshot slots. Each slot is a
// fully-designed composition: a headline, an accent gradient, a device
// capture source, and optional callouts pointing at on-screen features.
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
  // Layout: "centered" puts the device dead-centre with copy above.
  // "tilted" angles the device for a more editorial look.
  // "split" puts copy left, device right (iPad mainly).
  layout?: "centered" | "tilted" | "split";
}

export const SLOTS: ScreenshotSlot[] = [
  {
    slot: 1,
    slug: "hero",
    eyebrow: "1.2.0",
    headline: "Every mile.\nEvery quarter.\nSorted.",
    subline: "The UK's most thorough mileage tracker. Built for self-employed drivers and PAYE employees who claim back their miles.",
    iphoneSrc: "/screenshot-source/iphone/01-dashboard.png",
    ipadSrc: "/screenshot-source/ipad/01-dashboard.png",
    accent: "amber",
    badge: "NEW",
    layout: "tilted",
  },
  {
    slot: 2,
    slug: "mtd-itsa",
    eyebrow: "Making Tax Digital",
    headline: "Quarterly HMRC\nsubmissions in 30\nseconds.",
    subline: "MTD ITSA-ready. The first independent UK mileage app with the full quarterly submission flow.",
    iphoneSrc: "/screenshot-source/iphone/02-hmrc.png",
    ipadSrc: "/screenshot-source/ipad/02-hmrc.png",
    accent: "emerald",
    badge: "MTD ITSA",
    callouts: [
      { xPct: 50, yPct: 32, label: "Direct to HMRC", align: "right" },
      { xPct: 50, yPct: 68, label: "Auto-mapped to SA103", align: "left" },
    ],
    layout: "centered",
  },
  {
    slot: 3,
    slug: "live-activity",
    eyebrow: "Live Activity",
    headline: "Your trip,\nin the\nDynamic Island.",
    subline: "Distance, HMRC value, and classification — live, on your Lock Screen, in your pocket.",
    iphoneSrc: "/screenshot-source/iphone/03-live-activity.png",
    ipadSrc: "/screenshot-source/ipad/03-live-activity.png",
    accent: "amber",
    callouts: [
      { xPct: 50, yPct: 8, label: "Live distance ticking", align: "below" },
      { xPct: 30, yPct: 45, label: "Tap to classify", align: "left" },
    ],
    layout: "centered",
  },
  {
    slot: 4,
    slug: "tax-readiness",
    eyebrow: "Tax Readiness",
    headline: "Know what\nyou owe before\nHMRC does.",
    subline: "PAYE-aware. Combines employment income with self-employed mileage for a complete tax-band picture.",
    iphoneSrc: "/screenshot-source/iphone/04-tax-readiness.png",
    ipadSrc: "/screenshot-source/ipad/04-tax-readiness.png",
    accent: "amber",
    callouts: [
      { xPct: 78, yPct: 22, label: "PAYE factored in", align: "left" },
    ],
    layout: "tilted",
  },
  {
    slot: 5,
    slug: "auto-classify",
    eyebrow: "Auto-classify",
    headline: "Trips classify\nthemselves.\nWith reasons.",
    subline: "Learn your routes, classify with confidence. Every decision explained — high, medium, or low.",
    iphoneSrc: "/screenshot-source/iphone/05-auto-classify.png",
    ipadSrc: "/screenshot-source/ipad/05-auto-classify.png",
    accent: "sky",
    callouts: [
      { xPct: 25, yPct: 55, label: "Confidence + reasons", align: "right" },
    ],
    layout: "centered",
  },
  {
    slot: 6,
    slug: "road-accurate",
    eyebrow: "Routing engine",
    headline: "Road-accurate\ndistances.\nEvery time.",
    subline: "Self-hosted routing, GPS map-matching, and a route cache. The same journey always returns the same mileage.",
    iphoneSrc: "/screenshot-source/iphone/06-route.png",
    ipadSrc: "/screenshot-source/ipad/06-route.png",
    accent: "violet",
    layout: "tilted",
  },
  {
    slot: 7,
    slug: "invoices",
    eyebrow: "Invoice tracker",
    headline: "Invoices, paid\nstatus, weekly\nset-aside.",
    subline: "For sole traders who don't need full accounting software. Add invoices, track paid-vs-unpaid, factor in your accountant fee.",
    iphoneSrc: "/screenshot-source/iphone/07-invoices.png",
    ipadSrc: "/screenshot-source/ipad/07-invoices.png",
    accent: "emerald",
    badge: "PRO",
    layout: "centered",
  },
  {
    slot: 8,
    slug: "free-tier",
    eyebrow: "Free, forever",
    headline: "The features\nyou need.\nFree forever.",
    subline: "Mileage tracking, HMRC tax calc, MOT reminders, Self Assessment, expenses — all free. Pro funds the per-user API costs, never gates the fundamentals.",
    iphoneSrc: "/screenshot-source/iphone/08-free.png",
    ipadSrc: "/screenshot-source/ipad/08-free.png",
    accent: "amber",
    layout: "centered",
  },
  {
    slot: 9,
    slug: "privacy",
    eyebrow: "Privacy by default",
    headline: "Built in\nthe UK.\nStays in the UK.",
    subline: "No third-party analytics on your routes. All tracking on-device. Coordinates only leave your phone when you sync.",
    iphoneSrc: "/screenshot-source/iphone/09-privacy.png",
    ipadSrc: "/screenshot-source/ipad/09-privacy.png",
    accent: "sky",
    layout: "tilted",
  },
  {
    slot: 10,
    slug: "pro",
    eyebrow: "Pro",
    headline: "£4.99/month.\nThe whole\ntax engine.",
    subline: "Quarterly HMRC submissions, business insights, accountant sharing, Open Banking, auto-classify rules, exports. £44.99/year saves 25%.",
    iphoneSrc: "/screenshot-source/iphone/10-pro.png",
    ipadSrc: "/screenshot-source/ipad/10-pro.png",
    accent: "amber",
    badge: "PRO",
    layout: "centered",
  },
];

export function getSlot(slugOrNumber: string): ScreenshotSlot | undefined {
  const asNumber = parseInt(slugOrNumber, 10);
  if (!Number.isNaN(asNumber)) {
    return SLOTS.find((s) => s.slot === asNumber);
  }
  return SLOTS.find((s) => s.slug === slugOrNumber);
}
