# MileClear - Landing Page Specification

## Purpose

Advertise the app, build trust, and collect early access email signups before launch. The page should make a gig driver think "finally, someone built this properly" within 5 seconds of landing.

## Tone

Friendly, approachable, no-nonsense. Speak like a mate who happens to know about tax — not a corporation. No jargon, no fluff. Every sentence earns its place.

## Logo

Text-based logo for now ("MileClear" in the brand font). Proper logo to be designed later.

---

## Page Structure

### Navigation Bar (Fixed Top)

- **Left:** MileClear text logo
- **Right:** Login button, dropdown menu
- Dropdown menu items: Features, Pricing, FAQ, Early Access
- Clean, minimal. Collapses to hamburger on mobile.

---

### Section 1: Hero

**Headline:**
> Track every mile. Keep every penny.

**Subheadline:**
> The mileage tracker that actually works. Built for gig drivers, delivery riders, and anyone who drives for a living.

**CTA Button:** "Get Early Access" → scrolls to email signup or opens signup modal

**Visual:** Illustrated phone mockup showing the app dashboard (shift mode active, miles counter, tax savings total). Placeholder illustration until real screenshots exist.

**Trust line (below CTA):**
> Free to use. No card required. Your data stays yours.

---

### Section 2: The Problem

**Headline:**
> Sick of losing miles?

**Body:**
> Other mileage trackers promise to run in the background. Then they don't. Trips vanish. Months of data disappear. You end up paying more tax than you should because your records have gaps.
>
> MileClear was built to fix that. Every mile, every trip, every time.

Keep this short and punchy. Drivers who've used MileIQ will feel seen immediately.

---

### Section 3: Features (How It Works)

Grid or card layout. Each feature gets an icon, a short headline, and one sentence.

| Icon | Headline | Description |
|------|----------|-------------|
| GPS pin | **Bulletproof tracking** | Start your shift, drive, end your shift. Every mile is logged — even when you lose signal. |
| Bell | **Smart detection** | Forgot to start a shift? MileClear notices you're driving and asks if you want to record. |
| Pound sign | **Tax savings counter** | See exactly how much you're saving in real time. Watch it climb with every trip. |
| Fuel pump | **Cheapest fuel nearby** | Find the best fuel prices near you, filtered by your preferred brand. |
| Trophy | **Milestones & streaks** | Hit milestones, keep streaks alive, and get a daily scorecard after every shift. |
| Phone | **Works offline** | No signal? No problem. Your trips are saved on your phone and sync when you're back online. |
| Shield | **HMRC ready** | Export your mileage log for Self Assessment. Classified, timestamped, audit-friendly. |
| Chart | **Know your real earnings** | Optionally track what you earn across platforms. See your actual hourly rate after costs. |

---

### Section 4: Who It's For

**Headline:**
> Built for drivers who drive for a living

Short list with icons or illustrations:

- **Uber & delivery drivers** — Deliveroo, Just Eat, Uber Eats, Amazon Flex
- **Couriers** — DPD, Evri, Yodel, Stuart, Gophr
- **Sales reps & field workers** — anyone logging business miles
- **Self-employed drivers** — tradespeople, estate agents, mobile mechanics

> If you drive for work and want to claim what you're owed, MileClear is for you.

---

### Section 5: Pricing

**Headline:**
> Simple pricing. No surprises.

Two-column layout:

**Free (forever)**
- Mileage tracking with shift mode
- Smart trip detection
- Offline support
- Daily scorecards & streaks
- Tax savings counter
- Manual trip entry

**Premium — £4.99/month**
- Everything in Free, plus:
- HMRC-compliant exports (Self Assessment ready)
- Xero, FreeAgent & QuickBooks integration
- Earnings tracking & real hourly rate
- Fuel price finder with brand preference
- Audit protection & trip classification
- Advanced analytics & reports
- Multi-vehicle support

**Note below pricing:**
> Free during early access. No card needed.

---

### Section 6: Early Access Signup

**Headline:**
> Be the first to try MileClear

**Subheadline:**
> We're building something drivers can actually rely on. Sign up for early access and be the first to know when it's ready.

**Form:**
- Email address input
- "Join the waitlist" button
- Optional: "What do you drive for?" dropdown (Uber, Deliveroo, Just Eat, Amazon Flex, Courier, Other)

**After signup:**
> You're in. We'll let you know as soon as MileClear is ready.

Store emails in the database (simple `waitlist` table: id, email, driver_type, signed_up_at).

---

### Section 7: FAQ

Collapsible accordion style.

**Is MileClear really free?**
> Yes. Mileage tracking, shift mode, and gamification are completely free, forever. Premium features like tax exports and earnings tracking are £4.99/month, but you'll never be forced to pay to track your miles.

**How is this different from MileIQ?**
> Reliability. MileClear is built offline-first — your trips are saved on your phone before they ever touch the cloud. If your signal drops, nothing is lost. We also show you exactly which trips were captured so you can trust your records.

**Does it work in the background?**
> Yes. During a shift, MileClear tracks in the background. Outside of a shift, it uses low-power detection to notice when you're driving and asks if you want to record — no battery drain when you're not working.

**Is my data safe?**
> Your location data is encrypted and stored securely. We never sell your data. You can export or delete everything at any time. We're fully GDPR compliant.

**Can I use it for HMRC Self Assessment?**
> Yes (Premium feature). MileClear generates reports that match HMRC requirements — every trip is dated, timed, classified, and distance-verified.

**What vehicles are supported?**
> Cars, motorbikes, and vans. Bicycle and e-bike support is coming later.

**When is it launching?**
> We're currently in development. Sign up for early access above and we'll let you know as soon as it's ready for testing.

---

### Section 8: Footer

- MileClear text logo
- Links: Features, Pricing, FAQ, Privacy Policy, Terms of Service
- "Made in the UK" or similar
- Copyright 2026 MileClear

---

## Technical Notes

- **Email collection:** Store in a `waitlist` table in MySQL. Simple insert via the API.
- **No third-party email forms** (Mailchimp, etc.) — keep it self-hosted to avoid costs.
- **Confirmation email:** Send a simple "You're on the list" email via Resend when someone signs up.
- **Mobile responsive:** Must look good on phones — gig drivers will find this via their phone, not a desktop.
- **Page speed:** Keep it fast. Minimal JS, optimised images, no heavy frameworks beyond Next.js itself.
- **SEO:** Meta tags, Open Graph tags for social sharing, structured data for Google.

## Waitlist Database Table (Prisma addition)

```prisma
model WaitlistEntry {
  id         String   @id @default(uuid())
  email      String   @unique
  driverType String?  // uber, deliveroo, just_eat, amazon_flex, courier, other
  signedUpAt DateTime @default(now())

  @@map("waitlist")
}
```
