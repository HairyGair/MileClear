# App Store listing copy

Single source of truth for MileClear's App Store Connect listing.
Paste these into the version-agnostic fields (Subtitle, Description,
Keywords) — they don't change per version. The per-version Promotional
Text and What's New live in the per-build apple-submission-*.md files.

Last updated: 23 May 2026 — refreshed to lead with "unlimited tracking,
free forever" angle after user feedback (Laura) flagged it as the
biggest selling point over MileIQ / Driversnote / TripLog, and to use
the new 55p AMAP rate for 2026-27.

**Apple compliance bits preserved**: the subscription terms paragraph,
the auto-renewal language, the Privacy Policy URL, the Terms of Use
(EULA) URL, the support email, and the explicit £4.99 monthly price
disclosure. These keep us safe from a Guideline 3.1.2 / 3.2.2 reject.

---

## Name (max 30 chars)

```
MileClear: HMRC Mileage & Tax
```

(28 chars)

---

## Subtitle (max 30 chars)

```
Unlimited tracking, free
```

(24 chars)

Alternative if you want to push the HMRC angle harder:

```
Free HMRC mileage tracker UK
```

(28 chars)

---

## Promotional Text (max 170 chars)

```
Unlimited mileage tracking, free forever. No 40-drive monthly cap like other apps. Track every business mile for HMRC and see your tax deduction live.
```

(155 chars)

---

## Description (max 4000 chars)

```
The UK mileage tracker that does not cap your tracking.

MileClear automatically tracks every mile you drive for UK gig work or your day job, applies HMRC mileage rates, and exports a Self Assessment-ready PDF in one tap. Tracking is unlimited and free, forever. Other mileage apps stop you at 40 drives a month (MileIQ, TripLog) or 20 (Driversnote) unless you pay. MileClear never does.

Built for UK self-employed drivers - Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD, Evri, Gophr - and for employees who use their personal car for work and claim mileage back from their employer.

WHAT IT DOES

- Unlimited automatic GPS tracking. MileClear records every business mile in the background, including the dead miles between deliveries that platforms do not pay for but HMRC does. No monthly drive cap, ever.
- HMRC rates built in. 55p per mile for the first 10,000 business miles, 25p after (the car/van rate rose from 45p to 55p on 6 April 2026). Mopeds and motorbikes claim 24p flat. The right rate is applied per trip date automatically.
- Tax Readiness card. Live tax + NI estimate, suggested weekly set-aside, and a countdown to the 31 January deadline. Free.
- HMRC Reconciliation. Enter the figures HMRC has from each platform's Digital Platform Reporting and see the gap against MileClear's tracked total.
- Anonymous Benchmarking. Compare your weekly miles, trips and earnings against the median of UK MileClear drivers. Privacy floor never exposes individual data.
- Activity Heatmap. 7 by 24 grid of when you actually drive and earn most across the last 12 weeks.
- Pickup wait timer. Tap "Wait at pickup" when you arrive at a restaurant or depot. The stopwatch survives app suspension.
- MOT and tax expiry reminders. Add a vehicle by registration plate and MileClear refreshes DVLA data weekly. Push notification 14 days before expiry, plus full DVSA MOT history.
- Self Assessment-ready exports. CSV and PDF mileage logs in HMRC-accepted formats, per tax year, per vehicle, per platform.
- Self Assessment wizard (Pro). Step-by-step guide mapping your data to the actual HMRC SA103 form boxes, with full income tax + NI breakdown.
- HMRC attestation cover sheet (Pro). One-page signed declaration with the contemporaneous-record language HMRC inspectors recognise.
- Accountant Portal (Pro). Invite your accountant by email to a read-only dashboard.
- Receipt scanning (Pro). Camera at parking, fuel and toll receipts. On-device only.
- Real-time fuel prices. 8,300+ UK stations from the government-mandated reporting database.
- Saved locations. Home, work, depot. Trip detection pauses when you are parked there.
- Personal and Work modes. Everyday driving goals in Personal, HMRC-deductible mileage and tax tools in Work.

PRICING

Free, with no drive cap: full mileage tracking, HMRC rate calculation, manual earnings, fuel prices, gamification, Tax Readiness, Anonymous Benchmarking, HMRC Reconciliation, MOT history, Activity Heatmap, two saved locations.

Pro at £4.99 per month: all exports (CSV, PDF, Self Assessment), Self Assessment wizard, HMRC attestation cover sheet, Accountant Portal, receipt scanning, CSV earnings import, unlimited saved locations, pickup-wait community insights. Pro never gates the tracker itself.

PRIVACY

Trip data lives on your phone first. We sync to UK servers only what is needed to back up across devices. Receipt scanning is on-device only.

Subscription terms:
MileClear Pro is £4.99/month, auto-renewing. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. You can manage and cancel subscriptions in your iTunes & App Store account settings after purchase.

Privacy Policy: https://mileclear.com/privacy
Terms of Use (EULA): https://mileclear.com/terms

Support: support@mileclear.com
```

(~3,800 chars — comfortably under the 4,000-char limit, with the
Apple-compliance subscription + EULA paragraph intact at the bottom.)

---

## Keywords (max 100 chars, comma-separated, no spaces between)

```
mileage,tracker,HMRC,tax,UK,Uber,Deliveroo,gig,driver,delivery,fuel,self,assessment,AMAP,free
```

(95 chars)

Notes on keyword strategy:
- Lead with "mileage" + "tracker" + "HMRC" — the highest-intent terms.
- "free" included so we surface in "free mileage tracker" searches
  (which is now the home angle).
- "Uber" / "Deliveroo" / "gig" cover the platform-driver niche.
- "AMAP" is a low-volume but high-intent abbreviation; included
  because it matches HMRC tax tooling searches.
- No "MileIQ" / competitor names — Apple doesn't allow them.

---

## Update workflow

1. Edit this file when copy changes.
2. Paste relevant fields into App Store Connect → MileClear → App
   Store → Edit Localizable Information.
3. Submit the change for review (metadata-only updates are usually
   approved within a few hours, separate from a build submission).

## Apple compliance checklist (don't strip these from Description)

- [x] £4.99 monthly price stated
- [x] Auto-renewal language ("automatically renew unless cancelled
      at least 24 hours before the end of the current period")
- [x] How to cancel ("manage and cancel subscriptions in your iTunes
      & App Store account settings")
- [x] Privacy Policy URL (https://mileclear.com/privacy)
- [x] Terms of Use / EULA URL (https://mileclear.com/terms)
- [x] Support email (support@mileclear.com)
