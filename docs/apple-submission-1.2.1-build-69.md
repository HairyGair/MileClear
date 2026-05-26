# 1.2.1 build 69 — App Store Connect submission

Copy-paste source for App Store Connect. Sections map directly to
fields in the version metadata + TestFlight pages. Support URL +
Privacy Policy URL live in dedicated ASC fields — don't duplicate
them in the Description body.

Version: **1.2.1**
Build: **69**
Target: **App Store** (1.2.1's first public release)
Submitted: **22 May 2026**
**APPROVED & LIVE: 26 May 2026** — replaces 1.2.0 as the current public release.

---

## Promotional Text (max 170 chars)

Receipts that read themselves. A bank-feed inbox that triages every transaction in one tap. The categoriser learns your spending. Every taxable purchase, sorted.

---

## What's New (max ~4000 chars)

Two layers of "the receipts side of the job" land in 1.2.1.

**Expenses, a first-class section.**

Every taxable purchase you log — parking, fuel, phone bill, congestion charge, hotel for that out-of-town gig — now lives in a dedicated Expenses screen with the 17 categories HMRC actually uses on Self Assessment. Snap a photo of any receipt and the amount, date, and vendor are pulled off the paper for you using on-device text recognition. Nothing leaves your phone. Subsistence and accommodation categories carry inline HMRC SE57240 warnings so you only claim what's actually deductible.

**Bank-feed Inbox (Pro).**

If you've connected a bank, every transaction now lands in a new Inbox screen for one-tap triage: Accept as Earning, Accept as Expense, or Ignore. Known-platform earnings (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, Gophr) still auto-import in the background. Everything else — unmatched income, all outgoing spend — gets a category suggestion based on the merchant name, with a confidence dot so high-confidence rows can be batch-accepted at speed.

**The categoriser learns.**

Pick a category that's NOT the suggested one — the next time the same merchant arrives in your inbox, your override becomes the new default. The longer you use it, the less you tap. No data leaves your account; your spending shape stays yours.

**Project / client labels.**

If you do freelance work alongside the gig driving — theatre tech, photography, multi-client photography — tag trips, earnings, and expenses with a project name. The data flows through to a per-project profitability view (early access for Pro).

**Per-platform profitability.**

The Insights screen has a new "Profit by Platform" card showing gross / costs / net for each platform you work for over the last 30 days. Costs are split by earnings share — defensible enough for personal planning, and a clean answer to "which platform is actually worth my time after fuel and parking?"

**Cleaner home.**

The avatar menu has a new WORK & TAX section grouping the things you'll touch most at tax time: Work & Tax settings, Invoices, Expenses, Inbox, Work Schedule. The QuickBooks integration entry is paused while we rebuild it for UK QuickBooks Online compatibility — Xero and FreeAgent stay marked Coming Soon.

**Behind the scenes.**

A handful of reliability + iPad polish fixes you shouldn't notice. The Live Activity work from 1.2.0 stays exactly as it was. HMRC quarterly submissions stay in sandbox — production credentials are still being processed by HMRC.

Free tier is unchanged. Pro stays £4.99/month or £44.99/year.

---

## App Review notes (for App Review team)

Demo account: `demo@mileclear.com` / `MileClear2026!`

The demo account is provisioned as a Pro user so you can exercise every gated feature.

**What's new in this build vs 1.2.0:**

1. **Expenses section** (free tier feature). Avatar menu → Expenses. Tap "Scan Receipt" to test on-device Apple Vision text recognition (already shipped, no new permission). Or tap "Add manually" to enter an expense by hand. 17 HMRC SA103S-mapped categories.

2. **Bank-feed Inbox** (Pro feature). Avatar menu → Inbox. Triage screen for transactions imported from a connected bank via TrueLayer Open Banking (production-approved integration, no change in this build). Each transaction can be accepted as an earning or expense, or ignored.

3. **Per-platform profitability card** (Pro feature). Insights screen → scroll past Business Insights → "Profit by Platform" card.

4. **Project / client labels.** Optional freeform input on Trip, Earning, and Expense forms.

**No new permissions requested.** Camera + Photo Library were already requested in 1.2.0 for the earnings receipt OCR feature; expense OCR uses the same APIs.

**No new external services.** TrueLayer Open Banking, HMRC MTD ITSA (sandbox), Apple Vision OCR, Brevo email — all unchanged from 1.2.0.

**No in-app purchase changes.** Pro subscription stays at £4.99/month or £44.99/year via Apple IAP.

**HMRC MTD ITSA still in sandbox.** Production credentials are pending with HMRC's Software Developer Support Team (reference 2026-IBW598). The MTD ITSA screen continues to display a "Sandbox · Beta" banner so users know they're not submitting real returns.

**QuickBooks integration paused.** We discovered mid-rollout that the QBO Vehicle and VehicleMileage entities don't exist in UK QuickBooks Online (US/Canada only). The button is hidden on the Exports screen until we rebuild for UK + US compatibility. Xero and FreeAgent remain marked Coming Soon.

**iPad regression check.** Three new modal screens in this build (inbox action sheet, expense category picker, inbox category picker) all use the same AppModal wrapper that enforces iPad-safe presentation (`presentationStyle="overFullScreen"` + `statusBarTranslucent`). The build 60 iPad rejection pattern from earlier this year should not recur — but worth a quick tap-through on iPad if you have one to hand.

Support: support@mileclear.com
Privacy policy: https://mileclear.com/privacy
Terms: https://mileclear.com/terms
Marketing site: https://mileclear.com

---

## Pre-submission checklist

- [ ] App Store Connect → MileClear → 1.2.1 → Build 69 attached
- [ ] Promotional text pasted (170 chars)
- [ ] What's New pasted (~4000 chars)
- [ ] App Review notes pasted (demo creds + new features summary)
- [ ] Privacy URL still 200s: `https://mileclear.com/privacy`
- [ ] Support URL still 200s: `https://mileclear.com/support`
- [ ] Demo account `demo@mileclear.com` works + has Pro flag + has at least one connected bank with pending inbox transactions (reseed via `node scripts/seed-demo.mjs` if data is >30 days old)
- [ ] Build 69 status is "Ready to Submit" (Apple processed it)
- [ ] No new App Privacy data disclosures needed (no new data types collected)
- [ ] Submit for review

---

## TestFlight What to Test (for build 69 if you push to internal testers)

Same 5-section copy from `docs/what-to-test-1.2.1-build-69.md` — that
file is the canonical source. App Store Connect's TestFlight tab takes
its own copy; paste from there.
