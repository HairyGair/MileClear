# App Store submission — 1.3.4 (build 78)

Copy-paste source for App Store Connect. Version-agnostic copy (Name /
Subtitle / Description / Keywords) lives in `docs/app-store-listing.md`.
Demo account: `demo@mileclear.com` (same credentials as previous
submissions) — reseeded 8 Jul 2026, includes a sample client, a branded
invoice (INV-0001) and a business profile so Get Paid is reviewable
end-to-end. Sandbox HMRC connection cleared.

## Promotional Text

Track every mile automatically, then get paid for the work: MileClear now
builds professional invoices, emails them to your clients, and chases
late payments for you — with HMRC-ready tax records the whole way.

## What's New in This Version

GET PAID — professional invoicing for the self-employed:
• Save your clients, build invoices with line items and optional VAT
• Generate a branded PDF with your own logo and colours
• Email invoices to clients without leaving the app (Pro)
• Auto-chase late payments: polite scheduled reminders with the UK
  late-payment wording handled — you get a heads-up before anything
  sends, and payment stops the sequence instantly (Pro)

ALSO IN THIS RELEASE:
• New Public Transport expense category (train, tube, bus fares)
• New notification controls — fuel price alerts and the morning
  briefing can now be switched off
• Smoother live tracking on long drives
• HMRC (Making Tax Digital) screens clearly marked as beta
• Add notes to any trip
• Fewer surprise sign-outs, invite codes carry through to sign-up,
  and a fresh app icon

## What to Test (TestFlight)

1. Invoicing: Profile → Settings → Business Profile — add a trading
   name, logo and bank details. Earnings tab → Invoices → create an
   invoice with line items and VAT, download/share the PDF, email it
   to yourself, then toggle auto-chase on and off.
2. Clients: add/edit a client; pick them on a new invoice.
3. Notifications: Settings → Notifications — new Fuel price alerts and
   Morning briefing toggles.
4. Expenses: add a Public Transport expense.
5. Regression: normal trip auto-detection, classification, exports.

## Review Notes (for Apple)

- Demo account: demo@mileclear.com (password unchanged from previous
  reviews). It is a Pro account with sample data, including the new
  invoicing feature (Earnings tab → Invoices).
- Invoicing generates PDF documents and sends email at the user's
  explicit request; no payments are processed in-app. Subscriptions
  unchanged: MileClear Pro monthly (com.mileclear.premium.monthly) via
  Apple IAP.
- The HMRC (Making Tax Digital) flow is clearly labelled beta and
  points at HMRC's sandbox; no live tax filings occur.
- Location: background location powers automatic mileage tracking, as
  in all previous versions. No change to permission usage.

## Post-approval label flow

`packages/shared/src/data/releaseNotes.ts`: flip 1.3.4 "Pending Review"
→ "Latest" (demote 1.3.3 → "App Store"). Deploy web. Consider the
release announcement push + product-update email (see
release_comms_jun28_29 memory for the runbook + ctaUrl gotcha).
