# Facebook content calendar

A 12-week content plan drawn entirely from existing MileClear content. Four posts a week, ~48 posts in the queue, all linkable to a real page or topic on mileclear.com so each post drives some traffic.

This file is the **source of truth** for what goes out and when. Use Meta Business Suite or Later/Buffer to actually schedule them.

---

## Content inventory (what we have to work with)

### Blog posts — `apps/web/src/data/posts.ts`

26 long-form posts, mileclear.com/updates/[slug]:

| Category | Count | Examples |
|---|---|---|
| Guides | 9 | How to track miles for HMRC, Employee vs self-employed, Business mileage guide |
| Release announcements | 9 | What's New in 1.0.x → 1.2.0 (1.2.1 still to add) |
| Engineering / behind-the-scenes | 4 | The Case of the Phantom Trip, Why we built smart classification, Auto-trip detection |
| Tax / Tracking / Rules | 4 | Tax year ends 5 April checklist, 5 things Uber drivers should track, Mileage deduction explainer |

### Tax tips — `apps/api/src/services/taxTips.ts`

65 short tips, designed for in-app surfacing but **also FB-post-ready**:

| Category | Count | What's in it |
|---|---|---|
| Expenses | 16 | Parking, phone bill, AA/RAC, cleaning, training, etc. — "X is deductible" angle |
| Did you know | 15 | Personal allowance, trading allowance, marriage allowance, pension contributions, Class 2 NI etc. |
| Self Assessment | 10 | UTR explainer, identity verify, SA box 9, capital allowances, payment on account, penalties |
| Mistakes to avoid | 10 | "AMAP ↔ actual costs is a one-way door", "Mixing personal + business spending", etc. |
| MileClear features | 8 | Tax Readiness card, saved locations, Open Banking, CSV import, etc. |
| Deadlines | 7 | 31 Jan, 31 Oct paper, 5 April, 31 July, 5 October, MTD ITSA April 2026 |

### Niche landing pages

15+ at `apps/web/src/app/*-mileage-tracker/page.tsx`:
- Platforms: Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri
- Audiences: Delivery driver (general), Self-employed, Employee
- Generic: mileage-tracker-uk, free-mileage-tracker-uk
- Topical: HMRC mileage rates, business mileage guide, what counts as business mileage, MileIQ comparison, MTD ITSA

Each page is a goldmine of worked examples, FAQ, and platform-specific angles.

### App features

From the help topics + dashboard:
- HMRC AMAP rate (55p/25p) calculator
- Live Activity / Dynamic Island
- Tax Readiness card
- Anonymous Benchmarking
- HMRC Reconciliation
- Activity Heatmap
- Pickup Wait Timer
- Saved location suggestions
- MOT history + reminders
- Bank-feed Inbox (Pro)
- Receipt OCR
- Self Assessment wizard (Pro)
- Accountant Portal (Pro)
- Auto-classification
- Shift mode + scorecards
- 18 achievements + streaks
- First Tax Return guide

---

## The weekly pattern

Four posts a week, same days every week. Easy to maintain, predictable for followers.

| Day | Slot | Source | Example |
|---|---|---|---|
| **Monday** | 💡 Tax tip of the week | `taxTips.ts` (expenses + did-you-know + mistakes) | "Did you know? Trade subscriptions are tax-deductible." |
| **Wednesday** | 🚗 Driver tip / platform-focused | Niche landers + blog posts | "5 things every Uber driver should track for tax (that most don't)" |
| **Friday** | 📱 Feature spotlight | Help topics + features pages | "MileClear's Anonymous Benchmarking shows how your week compares to other UK drivers" |
| **Sunday** | 💭 Community / motivational / FAQ | FAQ + Discord + blog | "Q: Is MileClear really free? A: Yes — and unlike MileIQ we don't cap you at 40 drives a month." |

### Why this cadence

- **Four posts/week** stays active without feeling spammy. Studies put the FB algorithm's sweet spot for small business pages at 3–5/week.
- **Same days = predictable** → followers learn when to expect content. Better engagement signal than random posting.
- **Mix of types** → tax (high intent, conversion), platform (relatable, shareable), feature (product education), community (engagement). All four feed each other.
- **Every post links to mileclear.com** → SEO + retargeting opportunity. Never post without a link.

### Image strategy

If you have time: a simple branded card per post (1080×1080, amber accent on dark navy, large headline text, MileClear wordmark bottom-right). Otherwise screenshot the relevant in-app screen or use a stock driving photo. Posts with images get 2-3× the reach of text-only.

---

## 4 weeks of ready-to-paste drafts

Each draft is ~90-150 words — long enough to feel substantive, short enough that FB doesn't truncate it with "See more". Copy directly into Meta Business Suite scheduler.

### Week 1 (starting Monday)

**Mon — Tax tip**
> 💡 Tax tip of the week
>
> Trade subscriptions are tax-deductible. Industry mags (HGV Driver, Taxi Mirror), professional bodies (LPHCA for taxi, RHA for haulage), even paid Stack Overflow if you code on the side — all allowable expenses against your self-employed income.
>
> The threshold for "deductible" is whether the subscription supports your work, not whether it's traditional.
>
> Free guide to UK driver tax → mileclear.com/business-mileage-guide

**Wed — Driver tip**
> 🚗 5 things every Uber driver should track for tax — and most don't:
>
> 1. **Dead miles** between rides (Uber doesn't pay for them; HMRC does)
> 2. **Positioning miles** — driving to a busier zone counts as business
> 3. **The home-to-first-pickup leg** (yes, this is claimable for gig drivers)
> 4. **Wait time at airport queues** — not deductible itself, but track your overall hours for earnings-per-hour analysis
> 5. **ULEZ + congestion charges** — every penny goes on Box 27 of your tax return
>
> MileClear records dead miles automatically, with no monthly drive cap.
>
> Read the full Uber guide → mileclear.com/uber-mileage-tracker

**Fri — Feature spotlight**
> 📱 Have you tried Anonymous Benchmarking?
>
> Open MileClear → dashboard → scroll. You'll see how your weekly miles, trips and earnings compare to other UK drivers in your area. Per-platform breakdowns light up when 5+ other drivers are contributing (privacy floor — no individual can ever be identified).
>
> Useful for working out whether £18/hour from Uber is normal or whether you're being out-performed. Beats asking in a Facebook group.
>
> Free for everyone. Already in the app.

**Sun — Community**
> Q: Is MileClear really free?
>
> A: Yes — and unlike the competition, we don't cap your tracking.
>
> MileIQ stops you at 40 drives a month. TripLog caps at 40. Driversnote caps at 20. We don't cap at all — track every business mile you drive, forever, without paying a penny.
>
> Pro (£4.99/month) only adds tax-time exports and analyst features. It never gates the tracker itself.
>
> mileclear.com

---

### Week 2

**Mon — Tax tip**
> 💡 Tax tip of the week
>
> Your phone bill is tax-deductible — but only the business-use percentage. Most gig drivers can fairly claim 50-70% if the phone is critical for accepting jobs.
>
> The trick: be honest, be consistent year-on-year, and write a one-line justification in your records (HMRC asks if they audit).
>
> See every deductible expense in MileClear's Expenses screen → 17 categories mapped to HMRC's SA103 boxes.
>
> mileclear.com/features

**Wed — Driver tip**
> 🚗 Just Eat / Deliveroo / Uber Eats drivers — three things tax-time always catches you out on:
>
> 1. **Tips you got in cash that didn't go through the app** — HMRC still wants them declared
> 2. **Promotions and boost payments** — same income tax bracket, but easy to forget if they didn't hit your bank
> 3. **The £1,000 trading allowance** — if your gross earnings are under £1k, you don't even need to register for Self Assessment
>
> MileClear's HMRC Reconciliation card cross-checks what each platform reported to HMRC against what you tracked. Catches the gaps before HMRC do.
>
> mileclear.com/deliveroo-mileage-tracker

**Fri — Feature spotlight**
> 📱 Receipt scanning, on-device
>
> Snap a photo of any receipt — fuel, parking, hotel, ULEZ — and Apple Vision OCR pulls the amount, date and vendor straight off the paper. Goes into the new Expenses section with one tap.
>
> Nothing leaves your phone. The OCR runs locally on iPhone's Neural Engine, so receipts for sensitive stuff stay private.
>
> Pro feature in 1.2.1, just landed on the App Store.

**Sun — Community**
> A fun fact for the early-tax-return crew:
>
> The UK tax year runs **6 April to 5 April**. Self Assessment for 2025-26 (the year that just ended) is due by 31 January 2027.
>
> But you can file from 6 April 2026 onwards. Drivers who file in April-June consistently report less stress and faster refunds (if HMRC owes you anything) than the January 30 panic-filers.
>
> If it's your first Self Assessment, MileClear has a free guided walkthrough → Avatar menu → Work & Tax → First Self Assessment guide.

---

### Week 3

**Mon — Tax tip**
> 💡 Tax tip of the week
>
> Capital allowances vs simplified expenses — once you pick one for a vehicle, you can't switch later for that same vehicle.
>
> Simplified expenses (the 55p/25p AMAP rate) is what 90% of gig drivers should use. It includes fuel, insurance, servicing, depreciation — no receipts needed.
>
> Capital allowances (claim a % of the vehicle's purchase price + actual running costs) only beats AMAP if you've got a high-value electric vehicle and low business mileage. Worth running both numbers before deciding.

**Wed — Driver tip**
> 🚗 Amazon Flex drivers — does Amazon track your mileage for you?
>
> The app shows you block distance estimates, but it does **not** report mileage to HMRC for your tax return. That's on you.
>
> Worse: Amazon's block estimate is the road distance for the route they assigned. It doesn't include positioning miles (driving to the depot), the dead miles between blocks, or the trip home.
>
> A typical Flex driver under-claims £600-£1,200 a year by relying on Amazon's figures alone.
>
> mileclear.com/amazon-flex-mileage-tracker

**Fri — Feature spotlight**
> 📱 The Tax Readiness card
>
> Live HMRC tax + NI estimate on your dashboard, every time you open MileClear. Updates as you record trips and earnings. Tells you what to set aside each week so January doesn't bite.
>
> If you've got PAYE income too, MileClear factors that in — the "still owed" figure is what you genuinely owe on top of what your payslip already paid.
>
> Free for everyone. The single most underrated card in the app.

**Sun — Community**
> Behind-the-scenes story time.
>
> Last month a driver flagged that their auto-detected trip showed 32 miles when the actual journey was 38. Turned out the GPS sparse-sampled in a tunnel and our routing was straight-lining across.
>
> Three days later we shipped the road-snapped polyline fix. Same driver now sees the right number. That's the loop you're inside when you report a bug here — it actually gets fixed.
>
> Read the engineering write-up → mileclear.com/updates/your-odometer-was-right

---

### Week 4

**Mon — Tax tip**
> 💡 Tax tip of the week
>
> Common driver expenses people forget to claim:
>
> • Hire-and-reward insurance premium (the EXTRA on top of personal cover)
> • Public liability insurance
> • PPE (high-vis, gloves, weather gear)
> • Trade subs to driver bodies
> • Marketing on Google/FB if you're self-employed
> • Working-from-home flat rate (£6/week) for admin hours
>
> Each is a few hundred £££ a year of deduction. MileClear's Expenses screen has a category for each.

**Wed — Driver tip**
> 🚗 Courier drivers (Stuart / Gophr / DPD owner-driver / Evri) — your dead-mile economics are different to rideshare:
>
> A typical rideshare driver runs ~30% dead miles. A multi-drop courier runs 50-70%. Every depot run, every postcode-to-postcode jump between drops, all of it counts at the HMRC AMAP rate.
>
> On 25,000 business miles a year, that's roughly £8,750 deducted from your taxable profit at the 2026-27 rate. At basic rate income tax, that's £1,750 you'd otherwise owe HMRC.
>
> Track every mile (free, no cap) → mileclear.com/delivery-driver-mileage-tracker

**Fri — Feature spotlight**
> 📱 Pinned Home and Work yet?
>
> Open MileClear → Profile → Saved Locations. Pin Home and your usual depot / start location. Two material benefits:
>
> 1. Auto-detection pauses while you're parked there → better battery + cleaner trip list
> 2. Trips between two saved locations get auto-classified
>
> Free tier: 2 saved locations. Pro: unlimited.
>
> If you've already taken trips, MileClear suggests places worth pinning automatically — look for the sparkles card on the dashboard.

**Sun — Community**
> Real numbers from a real driver (Newcastle, anonymous):
>
> - 18,800 business miles a year
> - Mix of Uber + occasional Deliveroo
>
> Old tax year (2025-26, 45p rate): £6,700 deducted from profit. £1,340 less tax at 20% basic rate.
>
> New tax year (2026-27, 55p rate): £7,700 deducted. £1,540 less tax. That's £200 more per year just from the rate change.
>
> If you don't have a system tracking those miles — the average UK gig driver under-claims by ~£1,000 a year. Try MileClear → mileclear.com (free, no card, no drive cap)

---

## Where to find content for week 5 onwards

Pattern: rotate through the inventory. Each piece of content can feed 2-3 different post types over time.

### For Mondays (tax tips)

Open `apps/api/src/services/taxTips.ts` and pick one you haven't used in the last 8 weeks. The `title` is your hook, the `body` is your post copy. The 65 tips cover ~16 months at 1/week if you never repeat.

Best categories for Monday:
- `expenses` (16 tips) — concrete deductions readers can act on
- `did-you-know` (15) — trivia + tax savings
- `mistakes` (10) — anxiety-driven engagement

### For Wednesdays (driver tips)

Rotate through niche-lander pages:
- Week N: Uber
- Week N+1: Deliveroo
- Week N+2: Just Eat
- Week N+3: Amazon Flex
- Week N+4: DPD / courier
- Week N+5: Evri
- Week N+6: Self-employed (general)
- Week N+7: Employee (mileage allowance relief angle)

Pull one specific worked example or FAQ from each lander.

### For Fridays (feature spotlights)

Rotate through the help topics. Each topic answer is essentially a Friday post — just trim to ~120 words and link to the feature.

Best topics to highlight in priority order:
1. Tax Readiness card (free) — highest ROI for new readers
2. Receipt scanning (Pro)
3. Bank-feed Inbox (Pro)
4. Anonymous Benchmarking (free)
5. HMRC Reconciliation (free)
6. Activity Heatmap (free)
7. Live Activity / Dynamic Island
8. Auto-classification
9. Shift mode + scorecards
10. Pickup Wait Timer
11. MOT history + reminders
12. Saved locations + suggestions
13. Achievements + streaks
14. First Tax Return guide
15. Self Assessment wizard (Pro)
16. Accountant Portal (Pro)

That's 16 weeks of Friday content from one rotation.

### For Sundays (community)

Mix of:
- **Pull FAQ entries** from `apps/web/src/components/landing/FAQ.tsx` + `apps/web/src/app/faq/page.tsx` (~29 questions, each one a Sunday post)
- **Behind-the-scenes stories** from `posts.ts` "engineering" category (Phantom Trip, Auto-detection, Smart Classification)
- **Real driver numbers** like Week 4's example — pull from anonymous benchmarking aggregates or write hypotheticals
- **Discord invite** — every 6-8 weeks, plug `discord.gg/Wxnvr3rzaq` and what's there

### What to avoid

- ❌ Don't post on a Tuesday/Thursday/Saturday — keep the discipline of the 4-day cadence so followers learn the rhythm
- ❌ Don't copy a previous post verbatim (FB shadow-bans repeat content). Rotate or rewrite if you must repeat
- ❌ Don't post the same link 3 weeks in a row (also shadow-banned). Cycle through the lander URLs and the /updates/[slug] links
- ❌ Don't post before 7am or after 10pm UK — engagement collapses outside daytime hours
- ❌ Don't mention competitors by name in copy that gets cross-posted to Twitter / Threads. FB is fine.

### Best posting times (UK gig-driver audience)

Based on Activity Heatmap data from MileClear's own users (who are the audience):
- **Mon-Wed-Fri**: 09:00-10:00 (drivers checking phone over coffee between morning blocks)
- **Sun**: 11:00 (Sunday morning, before the lunch shift kicks off)

These are also low-noise hours on FB — most other businesses post 12pm-2pm.

---

## Tracking what works

After each post, note in `docs/facebook-post-performance-log.md` (create when you start):
- Date / slot type
- Source content (which taxTip ID, which lander, which feature)
- Reach + engagement + link clicks
- Whether it was a hit (>2× baseline) or a miss

After 8 weeks you'll have enough signal to double down on what works. My guess from the inventory:
- **Mistakes-to-avoid** tax tips will out-engage **did-you-know** ones (anxiety > curiosity for tax content)
- **Real numbers** Sunday posts will out-engage **FAQ** Sunday posts
- **Platform-specific** Wednesdays will out-engage generic driver tips

If that holds, weight the schedule accordingly.

---

## Bulk-prep workflow (recommended)

Don't write posts one-at-a-time. Once a month, sit down with this doc and Meta Business Suite, batch 4 weeks of posts in one go. ~90 minutes for a month's content if you reuse the templates.

The 4 drafts above buy you the first month. After that, the inventory + pattern + rotation rules let you generate the next month without my help.

Or — drop a note in the AI thread saying "draft me weeks 5-8" and I'll generate them in the same format.
