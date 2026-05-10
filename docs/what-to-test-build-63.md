# What to test — 1.2.0 build 63

Copy this into the TestFlight **"What to Test"** field for the 1.2.0
build 63 release. Targeted at beta testers — bug-hunt instructions,
not marketing copy.

Demo account (if you don't want to use your own): `demo@mileclear.com` /
`MileClear2026!`

---

## TL;DR

This is the biggest release we've ever shipped — HMRC quarterly
submissions, road-snapped trip maps, an invoice tracker, and a stack of
polish that touches almost every screen. We'd love eyes on six things
in particular.

---

## 1. HMRC quarterly submissions (Pro)

The headline feature. **Don't actually submit anything** — we're on
HMRC's sandbox, but the workflow you're testing is the same one that
will hit production.

- Settings → Work & Tax → MTD ITSA → Connect to HMRC
- Complete the in-app OAuth handshake (HMRC's sandbox login page)
- Enter your NINO when asked (test NINO: `AA000003D`)
- Confirm the self-employment trade HMRC shows you
- Tap an open obligation → Review submission
- Verify the breakdown looks sensible: gig income, mileage deduction,
  expense buckets, any warnings flagged
- **DO NOT tap Submit.** Back out instead.
- Test Disconnect from the entry screen — should clear cleanly

If anything looks weird in the preview screen (wrong figures, missing
sections, confusing copy), screenshot + send.

---

## 2. Manual trip routing accuracy

We rebuilt the road-routing engine. Same A→B should always return the
same mileage now — used to drift.

- Add a manual trip with both start and end set (e.g. your regular
  commute or a route you know the real distance of)
- Check the distance card — should show "Route distance via road" or
  "...cached" subtitle
- **Add the same route again as a second trip.** Distance should be
  identical to the first.
- Open the trip detail — the map should show your actual road route
  (snapped to roads, no jitter), not a straight line.
- If you see "Couldn't calculate route — try again or enter distance
  manually," that's the new fail-closed UX. Should be rare. Tell us if
  it fires often.

---

## 3. Auto-classify pattern learning

After 3+ trips on the same A→B tagged the same way, the next trip
should auto-classify.

- Pick a route you've done before (your usual work shift, school run,
  etc.)
- Add 3 manual trips between the same two addresses, all tagged the
  same (e.g. all "Work · Uber")
- Add a 4th trip on the same A→B but don't pre-select the class
- The classification + platform should pre-fill automatically
- Toast confirms: "Auto-classified as Work — based on N similar trips"
- Override should still work — tap a different chip and save

---

## 4. Invoice tracker (free up to 3/month, Pro unlimited)

- Settings → Work & Tax → Sole Trader → Invoices → "+"
- Create an invoice: company name, amount (e.g. £200), sent today
- Confirm it appears in the list with status "Awaiting"
- Mark it paid → status flips to "Paid" with a green pill
- Wait 30 days then check it auto-flips to "Overdue" (or fake-date a
  test invoice with `sentAt` 31 days ago to check the status logic)
- If you're on the free tier: try to create a 4th invoice this month.
  Should hit the paywall with a clear "Free plan limit reached" alert
  + "See Pro" button
- Open Tax Readiness card on dashboard — paid invoices should be in
  the gross income figure (cash basis)

---

## 5. PAYE tax-paid offset (only visible if your work type is "Employee" or "Both")

- Settings → Work & Tax → PAYE Employment → Tax already deducted
- Enter a figure (e.g. £3000)
- Back to dashboard → Tax Readiness card → "estimated tax" figure
  should drop by roughly the amount you entered (it's subtracted from
  the gross liability)
- Clear the field — figure should return to the gross liability
- This is the fix for the "I'm a salaried-with-overtime driver and
  MileClear was double-counting my PAYE tax" issue Laura Joyce
  flagged. Salaried + side-gig drivers — please test this one
  carefully.

---

## 6. Trip confidence + Recheck

- Open any trip from your history
- At the bottom of the distance card, you should see a coloured pill:
  green (High confidence), amber (Medium), or red (Low) with a small
  reasons summary
- Tap to expand the reasons list — should be plain-English (number
  of GPS samples, whether it was map-matched, etc.)
- Trips list view: medium and low confidence trips show a small dot
  next to the date
- Settings → Data & Exports → Recheck suspicious trips → should scan
  your recent history and either say "All clear" or surface a "Found
  N trips that might be wrong" prompt with a Fix button

---

## Other things while you're in there

These are all the smaller polish items that should "just work" but if
anything feels off, shout:

- **Live Activity context band**: drive somewhere with a real trip
  running. Lock Screen should show distance + speed up top, plus a
  context line below — "TODAY 14.2 mi" or "NEXT 5.4 mi to 10K Club"
  or "EARNED £45.50" (shift mode only).
- **One-tap recalculate**: any trip detail screen → "Recalculate
  distance" button under the distance card. Hits routing engine.
- **Post-trip review card**: after saving a manual trip, you should
  see a brief "Trip saved" overlay showing distance + HMRC value +
  classification before bouncing back to the dashboard.
- **Trip-merge suggestion**: if you have two trips less than 15 mins
  and 1km apart, the trip detail screen should suggest merging them
  (typically fires for fuel stops or quick errands that split a real
  drive into pieces).
- **Heartbeat alerts**: if your iOS settings ever revoke "Always"
  location, background app refresh, or your phone fills up, you
  should get a push within 6 hours of the next heartbeat with a clear
  fix prompt.
- **Data-quality banner**: drivers who were affected by the recent
  data corrections (this includes a chunk of beta testers) should see
  a one-shot banner on the dashboard summarising what we corrected.
  Tap × to dismiss.

---

## Bug-reporting

In-app: Profile → Suggestions → Submit. Drops the report straight to us.

Or screenshot + DM in the MileClear Facebook group.

For anything urgent / shipping-blocker: `support@mileclear.com` direct.

---

## Known issues for this build

- **EAS Update OTA disabled** on build 63 (eas.json channel was unset
  at build time). If a JS bug surfaces and we'd normally push an
  over-the-air fix, we'll need to ship a build 64 instead. Doesn't
  affect the testing experience, just our patch speed.
- **Expo doctor reports 4 "version mismatches"** on this build —
  three are pre-existing harmless pins; one (Reanimated 3 vs 4) is
  intentional. Not user-visible.

Thanks for testing — this is a big one.
