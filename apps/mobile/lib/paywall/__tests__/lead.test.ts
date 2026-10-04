import { describe, it, expect } from "vitest";
import {
  PAYWALL_CHECKLIST,
  PAYWALL_FEATURES,
  billingChannelFor,
  billingCopyFor,
  orderedFeatures,
  paywallLeadFor,
  type BillingChannel,
} from "../lead";

const FEATURE_IDS = new Set(PAYWALL_FEATURES.map((f) => f.id));

/** Every source a caller passes today (PaywallContext / PremiumGate). */
const LEAD_SOURCES = [
  "self-assessment",
  "exports",
  "invoice_tracker",
  "invoice_pdf",
  "invoice_send",
  "invoice_chase",
  "open_banking",
  "csv_import",
  "snap_statement",
  "ticket_defender",
  "ask_mileclear",
  "vehicle_limit",
  "saved_locations_suggest",
  "mileage_certificate",
  "Driving Analytics",
  "Business Insights",
  "Journey Map",
  "Journey Timeline",
  "Community Insights",
  "Auto-Classify Rules",
  "MTD ITSA",
];

const GENERIC_SOURCES = [
  undefined,
  null,
  "",
  "premium_gate",
  "5th_trip",
  "profile",
  "dashboard_nudge",
  "challenge_complete",
  "5 more notification types",
  "something_new",
];

describe("paywallLeadFor", () => {
  it("leads with Self Assessment for the SA and exports sources", () => {
    for (const src of ["self-assessment", "exports"]) {
      const lead = paywallLeadFor(src);
      expect(lead?.headline).toBe("Your Self Assessment figures are ready");
      expect(lead?.subline).toContain("SA103 PDF");
    }
    expect(paywallLeadFor("self-assessment")?.highlightFeature).toBe("sa_pdf");
    expect(paywallLeadFor("exports")?.highlightFeature).toBe("mileage_exports");
  });

  it("gives every invoice source the invoice lead", () => {
    for (const src of ["invoice_tracker", "invoice_pdf", "invoice_send", "invoice_chase"]) {
      const lead = paywallLeadFor(src);
      expect(lead?.highlightFeature).toBe("invoices");
      expect(lead?.subline).toContain("3 invoices a month");
    }
  });

  it("names the feature for PremiumGate sources", () => {
    expect(paywallLeadFor("Driving Analytics")?.headline).toBe("Driving Analytics is part of Pro");
    expect(paywallLeadFor("Journey Map")?.highlightFeature).toBe("journey_map");
    expect(paywallLeadFor("MTD ITSA")?.headline).toBe("Making Tax Digital is part of Pro");
  });

  it("covers the new upgrade-path sources", () => {
    expect(paywallLeadFor("open_banking")?.highlightFeature).toBe("open_banking");
    expect(paywallLeadFor("csv_import")?.highlightFeature).toBe("csv_import");
    expect(paywallLeadFor("snap_statement")?.highlightFeature).toBe("snap_statement");
    expect(paywallLeadFor("ticket_defender")?.highlightFeature).toBe("ticket_defender");
    expect(paywallLeadFor("vehicle_limit")?.highlightFeature).toBe("vehicles");
  });

  it("leads EmSee with its own pitch, without a page 3 entry while it can be dormant", () => {
    const lead = paywallLeadFor("ask_mileclear");
    expect(lead?.headline).toBe("Ask EmSee about your figures");
    expect(lead?.subline).toContain("recorded in MileClear");
    expect(lead?.highlightFeature).toBeUndefined();
  });

  it("returns null (the generic page) for generic and unknown sources", () => {
    for (const src of GENERIC_SOURCES) {
      expect(paywallLeadFor(src)).toBeNull();
    }
  });

  it("only highlights features that exist on page 3", () => {
    for (const src of LEAD_SOURCES) {
      const lead = paywallLeadFor(src);
      expect(lead, src).not.toBeNull();
      if (lead?.highlightFeature) expect(FEATURE_IDS.has(lead.highlightFeature), src).toBe(true);
    }
  });
});

describe("orderedFeatures", () => {
  it("keeps the listed order with no highlight", () => {
    expect(orderedFeatures().map((f) => f.id)).toEqual(PAYWALL_FEATURES.map((f) => f.id));
  });

  it("moves the highlighted feature to the top without dropping any", () => {
    const ordered = orderedFeatures("vehicles");
    expect(ordered[0].id).toBe("vehicles");
    expect(ordered).toHaveLength(PAYWALL_FEATURES.length);
    expect(new Set(ordered.map((f) => f.id)).size).toBe(PAYWALL_FEATURES.length);
  });
});

describe("page 3 and 4 lists", () => {
  it("no longer sell features the app cannot deliver or gives away free", () => {
    const text = [
      ...PAYWALL_FEATURES.flatMap((f) => [f.label, f.desc]),
      ...PAYWALL_CHECKLIST,
    ].join("\n");
    expect(text).not.toMatch(/pickup wait/i);
    expect(text).not.toMatch(/accountant sharing/i);
    expect(text).not.toMatch(/shift grade/i);
    expect(text).not.toMatch(/receipt scan/i);
  });
});

describe("billing wording", () => {
  it("picks the channel from the store, never a card page on Android", () => {
    expect(billingChannelFor("apple", "ios")).toBe("apple");
    expect(billingChannelFor("google", "android")).toBe("google");
    expect(billingChannelFor(null, "android")).toBe("google");
    expect(billingChannelFor(null, "ios")).toBe("card");
  });

  it("names the right place to cancel", () => {
    expect(billingCopyFor("apple").smallPrint).toContain("Apple ID");
    expect(billingCopyFor("google").smallPrint).toContain("Google Play > Payments & subscriptions");
    expect(billingCopyFor("google").smallPrint).not.toMatch(/apple/i);
    expect(billingCopyFor("card").smallPrint).not.toMatch(/apple|google/i);
    expect(billingCopyFor("card").cancelLine).toContain("Profile");
  });

  it("never mentions a free trial (there is none)", () => {
    for (const ch of ["apple", "google", "card"] as BillingChannel[]) {
      const c = billingCopyFor(ch);
      expect(`${c.cancelLine} ${c.smallPrint}`).not.toMatch(/trial|risk-free/i);
    }
  });
});

describe("copy rules", () => {
  const allCopy = (): string[] => {
    const out: string[] = [];
    for (const src of LEAD_SOURCES) {
      const lead = paywallLeadFor(src);
      if (lead) out.push(lead.headline, lead.subline);
    }
    for (const f of PAYWALL_FEATURES) out.push(f.label, f.desc);
    out.push(...PAYWALL_CHECKLIST);
    for (const ch of ["apple", "google", "card"] as BillingChannel[]) {
      const c = billingCopyFor(ch);
      out.push(c.cancelLine, c.smallPrint, c.restoreNotFound);
    }
    return out;
  };

  it("has no em or en dashes", () => {
    for (const line of allCopy()) expect(line, line).not.toMatch(/[\u2013\u2014]/);
  });

  it("makes no HMRC endorsement claim (HMRC ref 2026-NIP751)", () => {
    const banned = /HMRC[- ]?(ready|compliant|accepted|recognised|recognized|certified|accredited|endorsed|approved)|recogni[sz]ed by HMRC|ready for HMRC|direct to HMRC/i;
    for (const line of allCopy()) expect(line, line).not.toMatch(banned);
  });
});
