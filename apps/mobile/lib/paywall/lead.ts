/**
 * Paywall copy that depends on WHY the paywall opened and WHERE the person
 * would pay. Pure (no React Native imports) so it can be unit tested.
 *
 * A paywall review (29 Sep 2026) found the modal ignored its `source`, so a
 * driver who tapped "Download SA103 PDF" got the same generic pitch as one
 * who tapped a dashboard nudge. `paywallLeadFor()` maps each source to a
 * headline for page 1 and the page 3 feature to show first.
 *
 * Copy rules: plain UK English, no em dashes, and never an adjective about
 * MileClear next to "HMRC" (HMRC ref 2026-NIP751). The test enforces both.
 */

export type PaywallFeatureId =
  | "sa_pdf"
  | "mileage_exports"
  | "mileage_certificate"
  | "invoices"
  | "csv_import"
  | "snap_statement"
  | "ticket_defender"
  | "open_banking"
  | "business_insights"
  | "driving_analytics"
  | "auto_classify"
  | "journey_map"
  | "saved_locations"
  | "vehicles";

export interface PaywallFeature {
  id: PaywallFeatureId;
  /** Ionicons glyph name. */
  icon: string;
  label: string;
  desc: string;
}

/**
 * Page 3, "Everything in Pro". Every entry must be Pro-only AND reachable in
 * the app. Removed 29 Sep 2026: Pickup Wait Insights (the app never calls the
 * insights endpoint) and Accountant Sharing (the invite only exists on the
 * website). Shift grades are free, so they are not listed.
 */
export const PAYWALL_FEATURES: readonly PaywallFeature[] = [
  { id: "sa_pdf", icon: "document-text-outline", label: "Self Assessment PDF", desc: "Your SA103 figures as a print-ready PDF to file from" },
  { id: "mileage_exports", icon: "download-outline", label: "Mileage Exports", desc: "CSV and PDF mileage logs for your records or accountant" },
  { id: "mileage_certificate", icon: "ribbon-outline", label: "Mileage Certificate", desc: "A record of your miles anyone can check, for an insurer, employer or buyer" },
  { id: "invoices", icon: "receipt-outline", label: "Unlimited Invoices", desc: "Branded PDFs, email to clients and auto-chase (free plan: 3 a month)" },
  { id: "csv_import", icon: "cloud-upload-outline", label: "CSV Import", desc: "Bulk import platform earnings" },
  { id: "snap_statement", icon: "camera-outline", label: "Snap a Statement", desc: "Read your earnings from a platform screenshot" },
  { id: "ticket_defender", icon: "shield-checkmark-outline", label: "Ticket Defender", desc: "A PDF record of where your phone was when a fine says you were somewhere, plus Clean Air Zone pay-by dates" },
  { id: "open_banking", icon: "card-outline", label: "Open Banking", desc: "Import earnings from your bank" },
  { id: "business_insights", icon: "podium-outline", label: "Business Insights", desc: "Platform comparison, P&L and golden hours" },
  { id: "driving_analytics", icon: "analytics-outline", label: "Driving Analytics", desc: "Weekly trends and deeper efficiency metrics" },
  { id: "auto_classify", icon: "calendar-outline", label: "Auto-Classify Rules", desc: "Trips in your work hours marked as business automatically" },
  { id: "journey_map", icon: "map-outline", label: "Journey Map", desc: "See your recent routes together on one map" },
  { id: "saved_locations", icon: "location-outline", label: "Unlimited Locations", desc: "Save as many depots as you need (free plan: 2)" },
  { id: "vehicles", icon: "car-outline", label: "Unlimited Vehicles", desc: "Add every car, van or motorbike you drive (free plan: 1)" },
];

/** Page 4 checkmark list. Same rule: Pro-only and in the app. */
export const PAYWALL_CHECKLIST: readonly string[] = [
  "Self Assessment PDF and mileage log exports",
  "Unlimited invoices, with PDFs and auto-chase",
  "CSV earnings import",
  "Business insights and platform P&L",
  "Driving analytics and journey map",
  "Unlimited vehicles and saved locations",
  "Open Banking earnings import",
];

export interface PaywallLead {
  headline: string;
  subline: string;
  /** Ionicons glyph for page 1. */
  icon: string;
  /** Shown first, and highlighted, on page 3. */
  highlightFeature?: PaywallFeatureId;
}

const SELF_ASSESSMENT_HEADLINE = "Your Self Assessment figures are ready";
const SELF_ASSESSMENT_SUBLINE =
  "Pro prints them as an SA103 PDF you can file from, plus CSV and PDF mileage logs.";

const INVOICE_LEAD: PaywallLead = {
  headline: "Unlimited invoices with Pro",
  subline:
    "The free plan covers 3 invoices a month. Pro removes the limit, turns each invoice into a branded PDF, emails it to your client and sends polite payment reminders for you.",
  icon: "receipt-outline",
  highlightFeature: "invoices",
};

/** Sources that name a single feature: "<Feature> is part of Pro". */
const FEATURE_GATES: Record<string, { subline: string; icon: string; highlightFeature?: PaywallFeatureId }> = {
  "Driving Analytics": {
    subline: "Routes, costs, earnings patterns and commute timing, with weekly trends across the months.",
    icon: "analytics-outline",
    highlightFeature: "driving_analytics",
  },
  "Business Insights": {
    subline: "Earnings per mile and per hour, a side-by-side platform comparison, your golden hours and a weekly P&L.",
    icon: "podium-outline",
    highlightFeature: "business_insights",
  },
  "Journey Map": {
    subline: "See your recent routes together on one map.",
    icon: "map-outline",
    highlightFeature: "journey_map",
  },
  "Journey Timeline": {
    subline: "Your recent drives laid out as a timeline, with where you went and how far.",
    icon: "git-commit-outline",
  },
  "Community Insights": {
    subline: "Earnings per mile by platform, busy times and road reports from drivers near you.",
    icon: "people-outline",
  },
  "Auto-Classify Rules": {
    subline: "Set your work hours once and trips inside them are marked as business automatically.",
    icon: "calendar-outline",
    highlightFeature: "auto_classify",
  },
  "MTD ITSA": {
    subline:
      "Connect with HMRC and walk through your quarterly updates. It is in beta, so for now it runs against HMRC's test service.",
    icon: "document-text-outline",
  },
};

/** Display names for gate sources whose key is not what a driver would read. */
const FEATURE_GATE_NAMES: Record<string, string> = {
  "MTD ITSA": "Making Tax Digital",
};

/**
 * The page 1 lead for a paywall source, or null for the generic page
 * (unknown sources, `premium_gate`, `5th_trip`, `profile`, `dashboard_nudge`,
 * `challenge_complete`).
 */
export function paywallLeadFor(source: string | null | undefined): PaywallLead | null {
  if (!source) return null;

  switch (source) {
    case "self-assessment":
      return {
        headline: SELF_ASSESSMENT_HEADLINE,
        subline: SELF_ASSESSMENT_SUBLINE,
        icon: "document-text-outline",
        highlightFeature: "sa_pdf",
      };
    case "exports":
      return {
        headline: SELF_ASSESSMENT_HEADLINE,
        subline: SELF_ASSESSMENT_SUBLINE,
        icon: "download-outline",
        highlightFeature: "mileage_exports",
      };
    case "invoice_tracker":
    case "invoice_pdf":
    case "invoice_send":
    case "invoice_chase":
      return INVOICE_LEAD;
    case "open_banking":
      return {
        headline: "Open Banking is part of Pro",
        subline: "Connect your bank and bring your platform payments in as earnings, without typing each one.",
        icon: "card-outline",
        highlightFeature: "open_banking",
      };
    case "csv_import":
      return {
        headline: "Import a whole CSV of earnings at once",
        subline:
          "Pro reads the earnings CSV from your Uber, Deliveroo, Amazon Flex or other driver portal and adds every row in one go, skipping any you already have.",
        icon: "cloud-upload-outline",
        highlightFeature: "csv_import",
      };
    case "snap_statement":
      return {
        headline: "Add a week of earnings from a screenshot",
        subline:
          "Pro reads the total and the dates from your Uber, Deliveroo, Just Eat, Amazon Flex or other earnings screen. You check it before it is saved.",
        icon: "camera-outline",
        highlightFeature: "snap_statement",
      };
    case "ticket_defender":
      return {
        headline: "Got a fine you don't recognise?",
        subline:
          "Pro shows where MileClear recorded your phone at the time on the notice, how fast and how accurately, as a PDF record you can send with an appeal. It also lists Clean Air Zone charges with the date to pay by.",
        icon: "shield-checkmark-outline",
        highlightFeature: "ticket_defender",
      };
    case "vehicle_limit":
      return {
        headline: "Add every vehicle you drive",
        subline: "The free plan covers 1 vehicle. Pro lets you add as many cars, vans and motorbikes as you need.",
        icon: "car-outline",
        highlightFeature: "vehicles",
      };
    case "mileage_certificate":
      return {
        headline: "Prove your mileage with a certificate",
        subline:
          "Pro makes a PDF of the miles you have recorded for any period, with a link anyone can use to check it. Handy for an insurer, an employer, an accountant or selling your car.",
        icon: "ribbon-outline",
        highlightFeature: "mileage_certificate",
      };
    case "saved_locations_suggest":
      return {
        headline: "Save every place you stop",
        subline: "The free plan saves 2 places. Pro removes the limit, so every depot and regular pickup can be saved.",
        icon: "location-outline",
        highlightFeature: "saved_locations",
      };
  }

  const gate = FEATURE_GATES[source];
  if (gate) {
    const name = FEATURE_GATE_NAMES[source] ?? source;
    return {
      headline: `${name} is part of Pro`,
      subline: gate.subline,
      icon: gate.icon,
      highlightFeature: gate.highlightFeature,
    };
  }

  return null;
}

/** Page 3 order: the highlighted feature first, the rest as listed. */
export function orderedFeatures(highlight?: PaywallFeatureId): PaywallFeature[] {
  if (!highlight) return [...PAYWALL_FEATURES];
  const first = PAYWALL_FEATURES.filter((f) => f.id === highlight);
  return [...first, ...PAYWALL_FEATURES.filter((f) => f.id !== highlight)];
}

// ── Billing wording ──────────────────────────────────────────────────────

/**
 * Where the person pays: the App Store, Google Play, or a card through
 * Stripe Checkout (only when no in-app purchase is available, e.g. Expo Go
 * on iOS). A native Android build without Play Billing still gets the
 * Google wording: Play policy means it can never fall back to a card page.
 */
export type BillingChannel = "apple" | "google" | "card";

export function billingChannelFor(
  store: "apple" | "google" | null,
  platformOS: string
): BillingChannel {
  if (store) return store;
  return platformOS === "android" ? "google" : "card";
}

export interface BillingCopy {
  /** Page 2 subheading under "No lock-in". */
  cancelLine: string;
  /** Page 4 small print. */
  smallPrint: string;
  /** Restore found nothing. */
  restoreNotFound: string;
}

const PERIOD_END = "Pro stays on until the end of the period you've paid for.";

export function billingCopyFor(channel: BillingChannel): BillingCopy {
  switch (channel) {
    case "apple":
      return {
        cancelLine: `Pay monthly or yearly and cancel any time in your Apple ID settings. ${PERIOD_END}`,
        smallPrint:
          "Payment will be charged to your Apple ID account at confirmation of purchase. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. You can manage or cancel it in your Apple ID settings.",
        restoreNotFound: "No previous subscription was found for this Apple ID.",
      };
    case "google":
      return {
        cancelLine: `Pay monthly or yearly and cancel any time in Google Play > Payments & subscriptions. ${PERIOD_END}`,
        smallPrint:
          "Payment will be charged to your Google Play account at confirmation of purchase. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. You can manage or cancel it in Google Play > Payments & subscriptions.",
        restoreNotFound: "No previous subscription was found for this Google account.",
      };
    case "card":
      return {
        cancelLine: `Cancel any time from Profile in the app, or Settings at mileclear.com. ${PERIOD_END}`,
        smallPrint:
          "Payment is taken from your card through Stripe when you subscribe. The subscription renews automatically until you cancel. You can cancel any time from Profile in the app, or Settings at mileclear.com.",
        restoreNotFound: "No previous subscription was found.",
      };
  }
}
