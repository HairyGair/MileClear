// ================================================================
// MileClear  - Posts data: Release Notes + Blog
// Add new blog posts to the BLOG_POSTS array below.
// Add new release notes to RELEASE_NOTES in
// `packages/shared/src/data/releaseNotes.ts` — that file is the
// single source of truth used by both the website (this file
// re-exports it) and the Product Update email campaign sent from
// the admin panel.
// ================================================================

// Re-export the shared release-notes data + interface so existing
// imports of `RELEASE_NOTES` and `ReleaseNote` from this module keep
// working unchanged. We also `import` them locally so the helper
// functions further down (getAllReleaseNotes, the Post union type)
// can still reference them.
import { RELEASE_NOTES, type ReleaseNote } from "@mileclear/shared";
export { RELEASE_NOTES, type ReleaseNote };

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: "engineering" | "guide" | "announcement";
  content: string; // full HTML string  - trusted, developer-authored
}

export interface Guide {
  slug: string; // route under /
  title: string;
  excerpt: string;
  category: "tax" | "tracking" | "rules";
  readTime: string; // e.g. "5 min read"
}

// ----------------------------------------------------------------
// Blog Posts
// ----------------------------------------------------------------
export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-chase-an-unpaid-invoice-uk",
    title: "How to chase an unpaid invoice: a UK sole trader's guide (with the exact email to send)",
    excerpt:
      "An invoice goes overdue and suddenly you're stuck between needing the money and not wanting to sound rude. Here's how late payment actually works in the UK - the 30-day rule, statutory interest at 8% plus base rate, the fixed compensation most sole traders never claim - plus a copy-and-paste chase email, and the one-tap version we just built into MileClear.",
    date: "5 July 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>Every self-employed person knows the feeling. You did the work, you sent the invoice, the due date slid past - and now you're composing a message in your head that somehow has to say "pay me" without sounding like you're starting a fight. So you put it off. And the invoice gets another week older.</p>

<p>One of our users put it perfectly when she suggested this feature: chasing an unpaid invoice is <em>awkward</em>. The awkwardness is the reason sole traders in the UK wait so long to chase - and the longer you wait, the harder it gets. So this guide covers two things: what UK law actually says about late payment (it's far more on your side than most people realise), and the exact email to send, including the version MileClear will now write for you in one tap.</p>

<h2>The 30-day rule: when is an invoice actually "late"?</h2>

<p>If you and your client haven't agreed payment terms, UK law fills in the blank for you: for business-to-business transactions, payment is due <strong>30 days</strong> after your invoice (or after delivery of the goods or service, if later). That default comes from the <strong>Late Payment of Commercial Debts (Interest) Act 1998</strong> - the single most useful piece of legislation most sole traders have never heard of.</p>

<p>If you agreed different terms - 14 days, 60 days, whatever was in your quote or contract - those apply instead. But in the absence of anything agreed, day 31 is the day an invoice becomes legally overdue. Not "cheeky to mention" overdue. Legally overdue.</p>

<h2>Statutory interest: 8% plus the Bank of England base rate</h2>

<p>Here's the part that changes the conversation. Once a business-to-business invoice is overdue, the Late Payment Act entitles you to <strong>statutory interest at 8% plus the Bank of England base rate</strong> on the debt. You don't need a clause in your contract. You don't need to have warned the client in advance. The entitlement exists automatically, by law.</p>

<p>The maths is simple: annual interest is the debt multiplied by (8% + the current base rate), and the daily rate is that figure divided by 365. On a £1,500 invoice with a base rate of, say, 4%, that would be £180 a year - about 49p for every day the invoice sits unpaid. Check the current base rate before you quote a figure.</p>

<h2>Fixed compensation: the £40 nobody claims</h2>

<p>On top of interest, the same Act gives you a <strong>fixed compensation sum per late invoice</strong>, purely for the hassle of recovering the debt:</p>

<ul>
<li><strong>£40</strong> for debts under £1,000</li>
<li><strong>£70</strong> for debts from £1,000 to £9,999.99</li>
<li><strong>£100</strong> for debts of £10,000 or more</li>
</ul>

<p>That's per invoice, not per client. A sole trader with three late £500 invoices in a year is entitled to £120 in compensation before interest even enters the picture. Almost nobody claims it - mostly because almost nobody knows it exists.</p>

<h2>The important caveat: business clients only</h2>

<p>All of the above applies to <strong>business-to-business</strong> debts. If your client is a consumer - a household you cleaned for, a family you photographed - the Late Payment Act doesn't apply, and you're back to whatever your terms said plus the ordinary courts. If you invoice consumers, drop the statutory-interest line from the template below and keep the rest.</p>

<h2>How to chase without burning the relationship</h2>

<p>The trick to a good chase email is that it isn't a threat - it's an update between two businesses. The tone you want is the tone of someone who assumes it's an oversight, because it usually is. A good chaser does four things:</p>

<ul>
<li><strong>States the facts flatly</strong> - invoice number, amount, date sent, date due, days overdue. No editorialising.</li>
<li><strong>Asks for a specific action</strong> - "could you arrange payment", not "just checking in".</li>
<li><strong>Mentions statutory interest as information, not a threat.</strong> "May attract statutory interest under the Late Payment Act" reads as a fact of law, because it is one. It moves your invoice up their pile without a single harsh word.</li>
<li><strong>Gives them a graceful exit</strong> - "if payment is already on its way, please disregard this". Everyone keeps their dignity.</li>
</ul>

<h2>The email to send (copy and paste)</h2>

<p>Here's the template. Fill in the bracketed bits and delete the interest line if your client is a consumer:</p>

<blockquote>
<p><strong>Subject:</strong> Payment reminder - invoice [reference] for [amount], now [X] days overdue</p>
<p>Hi,</p>
<p>A friendly reminder that invoice [reference] for [amount], sent on [date sent], was due for payment on [due date] and is now [X] days overdue.</p>
<p>Could you arrange payment at your earliest convenience? Please note that overdue business invoices may attract statutory interest at 8% plus the Bank of England base rate, together with fixed compensation, under the Late Payment of Commercial Debts (Interest) Act 1998.</p>
<p>If payment is already on its way, please disregard this message - and thank you.</p>
<p>Many thanks,<br />[Your name]</p>
</blockquote>

<p>Send the first chase the week the invoice goes overdue. If it's ignored, follow up every 7-14 days, keeping the same tone but adding that interest is now accruing. Most invoices get paid at the first or second nudge - debt-recovery letters and the small claims court are a topic for another day, and genuinely rare.</p>

<h2>Or let the app write it for you</h2>

<p>This week we built exactly this into MileClear, because that same user asked us to take the awkwardness out of it. MileClear already tracks your invoices alongside your mileage, expenses and earnings (that's the whole point - HMRC's self-assessment form needs your income <em>and</em> your deductions, and a mileage number on its own can't be filed). Now, when an invoice goes overdue, a <strong>Chase payment</strong> button appears next to it - in the app and on the web dashboard.</p>

<p>One tap opens a pre-written chase email in your own mail app: your invoice reference, amount, dates and days overdue already filled in, the statutory-interest wording already correct, signed with your name. You read it, you press send from your own email address, and the reply comes back to you. MileClear never emails your clients - you stay in control of every word.</p>

<p>Invoice tracking is free for up to three invoices a month (unlimited on Pro), and the chase button is free for everyone. If you're a sole trader who drives for work - and if you're reading this, you probably are - <a href="https://mileclear.com">MileClear</a> tracks the miles automatically too, at 55p per mile of tax deduction for 2026-27. <a href="https://apps.apple.com/gb/app/id6759671005">It's on the App Store</a>.</p>

<p><em>This article is general information, not legal or financial advice. For a specific dispute, especially a large one, speak to a professional.</em></p>
`,
  },
  {
    slug: "cleartrack-one-month-on",
    title: "ClearTrack, one month on: an honest report",
    excerpt:
      "A few weeks ago I apologised for missed trips and shipped ClearTrack, MileClear's rebuilt detection engine. Here's a numbers-first look at how the first month actually went - the strong stretch, the rocky first week, and the things I still can't measure.",
    date: "28 June 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>At the start of June I did something I'd been dreading: I wrote an apology. Some of you had drives that MileClear simply didn't record, and for a mileage tracker that's the one thing you can't get wrong. Alongside that apology I shipped <strong>ClearTrack</strong> - a rebuilt trip-detection engine designed to catch every drive on its own, including the short ones, and to keep recording when the app is closed or in your pocket.</p>

<p>I promised I'd be straight with you about whether it actually worked. It's been a few weeks now, so here's an honest look at how the first month went - the good and the not-so-good.</p>

<h2>The rough first week</h2>

<p>I'm not going to pretend the rollout was clean. The first week of June was the worst week of the whole month for trip capture - an over-the-air update didn't land properly on some phones, and a handful of devices got stranded on an old version until I could push a proper fix. If your June started with MileClear behaving worse rather than better, that week is why, and I'm sorry for it. The honest version of this story has to include that part.</p>

<h2>What the month looked like</h2>

<p>Once the dust settled, the picture got a lot better. Across June, the drivers using MileClear recorded:</p>

<ul>
<li><strong>Over 2,900 trips</strong> and <strong>nearly 41,000 miles</strong> tracked in the month.</li>
<li><strong>More than 100 active drivers</strong> - up from around 75 the month before.</li>
<li><strong>Around 94% of those trips captured themselves automatically</strong> - roughly nineteen journeys in every twenty recorded with no taps at all. You only hand-typed about one trip in twenty.</li>
</ul>

<p>The standout was the middle of the month. In the single busiest week, ClearTrack captured <strong>more than 1,300 trips and over 20,000 miles in seven days</strong> - by far the busiest week of the month, and almost all of it automatic. That was the week ClearTrack stopped feeling like a hopeful experiment and started feeling like the engine I'd wanted to build from the start.</p>

<h2>The bit nobody else counts</h2>

<p>There's a quieter number I'm proud of. Over the same stretch, MileClear's phantom-trip guard threw out <strong>nearly 200 junk recordings</strong> - the 0.1-mile "trips" that appear when a phone gets a bad GPS fix while you're sat still - before they ever reached your trip list. A tracker that invents trips you didn't take is almost as bad as one that misses the ones you did, so keeping those out matters.</p>

<h2>What I can't measure, and won't pretend to</h2>

<p>Here's the honest limitation. I can tell you that around 94% of recorded trips captured automatically. What I genuinely can't measure is the drive that never got recorded at all - because a missed trip leaves no trace in the data. So I'm not going to wave a "we catch 99% of everything" banner around, because I can't prove it and you'd be right not to believe it.</p>

<p>What I can tell you is that the diagnostic reports you send me - the single most useful thing in the app's menu - have shifted from "it recorded nothing for days" towards far smaller, more specific issues. That's the direction I want.</p>

<h2>Still not perfect</h2>

<p>Some things still need work. The very short one and two mile trips remain the hardest to catch. A small number of people on much older versions of the app still need to update before the latest fixes reach them. And the HMRC (Making Tax Digital) submissions are still in beta against HMRC's test system while we finish accreditation - the app now says so clearly on every screen, so nobody mistakes a test submission for a real filing.</p>

<h2>What's next</h2>

<p>The next two updates lean straight into the gaps. The version currently with Apple for review adds a <strong>missed-journey scanner</strong>: if MileClear ever spots a gap, where one trip ended in one place and the next began somewhere else with nothing in between, it offers to add the missing journey for you in a single tap. The build after that smooths out the live map on long drives and tightens the HMRC flow further.</p>

<p>Reliability is still the only thing I'm grading myself on. If MileClear has missed a trip for you, please update, give it another go, and send the diagnostic report if anything is still off. Those reports are the reason this month looked better than last.</p>

<p>Thank you for sticking with a small app that's trying to do right by you.</p>

<p>- Gair</p>
`,
  },
  {
    slug: "an-apology-and-a-reliability-overhaul",
    title: "An apology, and a reliability overhaul",
    excerpt:
      "Some of you have had trips go missing recently, and for a mileage tracker that's not good enough. Here's an honest account of what went wrong, what I've fixed, and what's coming next.",
    date: "3 June 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>I want to be straight with you.</p>

<p>Over the past few weeks, some of you have had journeys that MileClear didn't record. For an app whose one job is to capture your miles, that isn't good enough - and if it happened to you, I'm sorry. You trusted MileClear with something that's worth real money at tax time, and on those trips it let you down.</p>

<p>I'd rather tell you honestly what happened and what I've done about it than pretend everything has been fine.</p>

<h2>What went wrong</h2>

<p>Recording a drive automatically on an iPhone is genuinely hard. iOS aggressively suspends apps in the background to save battery, and getting it to reliably wake up the moment you start driving - without draining your battery or making you open the app every time - is a real engineering challenge.</p>

<p>On top of that, I found several specific bugs that were quietly making it worse:</p>

<ul>
<li>Trips that were captured, then <strong>deleted by a momentary loss of signal</strong> at the end of a drive.</li>
<li>A wake-up mechanism that could <strong>silently stop working for days</strong>.</li>
<li>The start of a journey occasionally being <strong>trimmed off</strong>, so a trip looked like it began halfway along.</li>
<li>Trips with <strong>wildly wrong durations</strong> when the phone fell asleep on arrival.</li>
<li>And the one that stung most: a bug that <strong>quietly signed people out while their phone was locked</strong>, which meant captured trips couldn't upload until the next time the app was opened. Trips that recorded perfectly looked "missing" simply because they couldn't reach your account.</li>
</ul>

<p>Some of these had been hiding for a while. Finding them meant a lot of late nights reading diagnostic logs from real drives - and I'm grateful to the people who sent those in. They are the reason these are fixed.</p>

<h2>What I've fixed</h2>

<p>The latest release (1.3.0) is not a features release. It is a top-to-bottom overhaul of how MileClear detects, records, and saves your trips:</p>

<ul>
<li>Trips now capture from where you actually set off, not part-way along.</li>
<li>Distances are matched to the real road network, and gaps where GPS dropped are filled with the road route instead of a straight line - so tunnels and dead spots no longer undercount your miles.</li>
<li>A finalised trip is saved to your phone first and can no longer be lost to a weak signal.</li>
<li>The sign-out bug is fixed, so your trips reach your account reliably.</li>
<li>If location access isn't granted, the app now tells you plainly instead of looking ready while recording nothing.</li>
</ul>

<h2>What's coming next</h2>

<p>Those fixes make a real difference, but there's one case they don't fully solve: the short, quick, one-and-two-mile trips around town - the ones that are over before the app is even sure you're driving. Those are the hardest of all.</p>

<p>So I'm building a new <strong>native motion-detection engine</strong> - the same kind of technology the big mileage apps use, which senses the very moment you start moving. It's in testing now, built specifically to catch those short trips from the first second. I'm rolling it out carefully, because I'd rather get it right than rush it.</p>

<h2>Finally</h2>

<p>MileClear is built by one person. That means I move fast, I answer your emails myself, and I take it personally when it doesn't work. It also means I sometimes ship bugs a bigger team might have caught. I'm fixing them as fast as I find them, and reliability is - and will stay - my number one priority over any new feature.</p>

<p>If MileClear has missed trips for you, please give it another go after updating. If anything still isn't right, email me directly. The in-app diagnostics report (in the menu) tells me exactly what happened on your phone, and it's the single most useful thing you can send.</p>

<p>Thank you for your patience, and for sticking with a small app that's trying to do right by you.</p>

<p>- Gair</p>
`,
  },
  {
    slug: "how-to-track-miles-for-work-uk",
    title: "How to Track Miles for Work in the UK (Without Spreadsheets)",
    excerpt:
      "If you drive for work in the UK - whether self-employed, gig delivery, or a PAYE employee - tracking your business miles can be worth hundreds or thousands of pounds at tax time. Here's how to do it properly, what HMRC actually requires, and why a spreadsheet probably won't cut it.",
    date: "19 May 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>If you drive for work in the UK and you're not tracking your miles, you're leaving money on the table. The Approved Mileage Allowance Payment (AMAP) lets self-employed drivers claim 55p per mile for the first 10,000 business miles in a tax year - 25p per mile after that (the first-tier rate rose from 45p to 55p on 6 April 2026 for the 2026-27 tax year onwards). For a typical full-time delivery driver, that's £6,000 to £9,000 in deductions every year. For tradespeople driving between jobs, it's often £2,500-£5,000. Even part-time gig workers and PAYE employees who drive occasionally for work can save hundreds.</p>

<p>This guide covers how to actually do it - what HMRC requires, what counts as a business mile, and the practical options for tracking. Spoiler: spreadsheets are the wrong answer.</p>

<h2>What HMRC requires</h2>

<p>To claim mileage relief on Self Assessment (or as a PAYE employee filing Mileage Allowance Relief), HMRC requires a <strong>contemporaneous record</strong> of every business journey. That means a record made at or near the time of the trip, not reconstructed from memory in January.</p>

<p>Each entry needs:</p>
<ul>
<li>The <strong>date</strong> of the journey</li>
<li>The <strong>start and end location</strong></li>
<li>The <strong>business purpose</strong> of the trip</li>
<li>The <strong>distance</strong> driven</li>
</ul>

<p>HMRC's official guidance (Helpsheet HS222) is clear that "estimates" of business mileage are not acceptable. If you get audited and your records don't survive scrutiny, the deduction is disallowed - and any tax saving you claimed becomes owed back, often with interest and penalties.</p>

<h2>The current AMAP rates</h2>

<ul>
<li><strong>Cars and vans:</strong> 55p per mile for the first 10,000 business miles per tax year, then 25p per mile (rate rose from 45p on 6 April 2026)</li>
<li><strong>Motorbikes:</strong> 24p per mile (flat rate, no threshold)</li>
<li><strong>Bicycles:</strong> 20p per mile (flat rate)</li>
<li><strong>Passenger payment:</strong> additional 5p per mile per business passenger you're carrying on the same trip</li>
</ul>

<p>The UK tax year runs from <strong>6 April to 5 April</strong>, so your 10,000-mile threshold resets each April, not each January.</p>

<h2>What counts as a business mile?</h2>

<p>This is the part most people get wrong. A business mile is one driven <strong>wholly and exclusively for business purposes</strong>. Examples:</p>

<ul>
<li>A self-employed plumber driving from one job to another</li>
<li>A gig delivery driver from accepting an Uber Eats order until completing the drop-off</li>
<li>A PAYE employee visiting a client site (where their normal workplace is the office)</li>
<li>An accountant driving to a CPD course</li>
</ul>

<p>What does <em>not</em> count:</p>

<ul>
<li>Your <strong>commute</strong> from home to your normal workplace - this is "ordinary commuting" and is never claimable</li>
<li>Any private journey, even in a vehicle used mostly for business</li>
<li>For most self-employed drivers, the journey from home to your <em>first</em> job of the day (HMRC generally treats this as commuting unless you have no fixed workplace, which is the case for many gig drivers)</li>
</ul>

<p>Our <a href="/what-counts-as-business-mileage">full guide on what counts as business mileage</a> walks through the edge cases.</p>

<h2>Why spreadsheets fail</h2>

<p>The most common approach to mileage tracking is "I'll just write it down" - usually a notebook or a spreadsheet filled in at the end of the week. There are three problems with this:</p>

<p><strong>1. It's not contemporaneous.</strong> Filling in a spreadsheet on Sunday for the week's trips is exactly what HMRC's "contemporaneous record" rule was written to exclude. If you're investigated, HMRC will ask for the source - did you write this down at the time? Maps Timeline or Apple Maps don't count either, because they don't show the business purpose.</p>

<p><strong>2. It's wrong.</strong> Mileage estimated from memory is consistently wrong - usually 15-30% lower than reality, because you forget detours, return-to-depot legs, and short between-job trips. That's £500-£2,000 in deductions every year.</p>

<p><strong>3. It's miserable.</strong> Sitting down on Sunday to reconstruct Monday's miles for the next 52 Sundays of your life is a tax on your time. Most people give up by week 6 and either don't claim or claim a guess.</p>

<h2>What actually works</h2>

<p>A purpose-built mileage tracker app. The good ones run in the background using GPS, detect when you start and stop driving automatically, let you tag each trip as business or personal (or auto-classify based on your work schedule), apply the HMRC rate to your vehicle, and produce a Self Assessment-ready PDF at tax-year end.</p>

<p>Specifically you want:</p>

<ul>
<li><strong>Background GPS tracking</strong> - no taps per trip, no remembering to open the app</li>
<li><strong>HMRC AMAP rates built in</strong> with the UK tax year (6 April to 5 April) and the 10,000-mile threshold applied automatically</li>
<li><strong>Per-trip classification</strong> with the option to auto-classify based on saved locations or work schedule</li>
<li><strong>Self Assessment export</strong> in a format HMRC accepts (per-trip detail + summary + attestation)</li>
<li><strong>Offline-first</strong> tracking so tunnels, basements and rural blackspots don't lose data</li>
<li><strong>Built for the UK</strong> - American apps use IRS rates and the 1-Jan tax year, which is the wrong answer for you</li>
</ul>

<h2>MileClear is built for this</h2>

<p>MileClear is a free <a href="/mileage-tracker-uk">UK mileage tracker</a> built around HMRC's AMAP rates and the 6-April tax year. Background GPS captures every drive, you classify each trip with a tap (or set Auto-Classify Rules so you never need to), and the Self Assessment PDF is ready when you are. <a href="/free-mileage-tracker-uk">Free forever</a> for the tracking - Pro (£4.99/mo) only covers the tax-export PDF, business insights, and a few power-user extras.</p>

<p>It works for <a href="/self-employed-mileage-tracker">self-employed sole traders</a>, <a href="/delivery-driver-mileage-tracker">gig delivery drivers</a>, and <a href="/employee-mileage-tracker">PAYE employees</a> claiming Mileage Allowance Relief.</p>

<h2>Bottom line</h2>

<p>If you drive any miles for work in the UK, tracking them properly is one of the highest-value pieces of admin you can do. AMAP is a real, claimable deduction. The records you keep this tax year are the difference between £0 and £4,000+ in your pocket - depending on your mileage and tax band.</p>

<p>Don't do it in a spreadsheet. Let a purpose-built tracker do it for you - automatically, contemporaneously, and free. <a href="https://apps.apple.com/app/mileclear/id6759671005">Install MileClear on the App Store</a>.</p>
`,
  },
  {
    slug: "how-to-track-business-miles-hmrc",
    title: "How to Track Business Miles for HMRC Self Assessment",
    excerpt:
      "A practical guide to recording business miles in a way HMRC will actually accept. What goes into a contemporaneous mileage log, what the AMAP rates are, how to fill in your SA103, and the real-world tools that make it painless.",
    date: "19 May 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>If you're self-employed in the UK and you drive for work, your business miles are one of the largest deductions available to you. HMRC's Approved Mileage Allowance Payment (AMAP) lets you claim 55p per mile for the first 10,000 business miles, then 25p per mile after (the first-tier rate rose from 45p to 55p on 6 April 2026 for the 2026-27 tax year onwards). For a mid-mileage sole trader doing 15,000 business miles a year, that's £6,750 off your taxable profit at the new rates - worth £1,350 to £2,700 in real tax back depending on your tax band.</p>

<p>But - and this is the part most people miss - the deduction is only worth what you can prove. HMRC requires a <strong>contemporaneous mileage log</strong>, and getting it wrong can mean the deduction is disallowed retrospectively, with interest and penalties. This guide explains exactly what to record, how to record it, and where it goes on your Self Assessment.</p>

<h2>What is a "business mile" for tax purposes?</h2>

<p>A business mile is one driven wholly and exclusively for business. The clear-cut cases are easy:</p>

<ul>
<li>Driving between two client sites in the same day</li>
<li>Going from your business base (which is not your home) to a customer</li>
<li>For gig drivers: from accepting a job to completing the drop-off</li>
<li>Driving to a supplier, training course, or business meeting</li>
</ul>

<p>The harder cases:</p>

<ul>
<li><strong>Home-to-work commute:</strong> not claimable. HMRC treats this as ordinary commuting whether you're employed or self-employed.</li>
<li><strong>First job of the day from home:</strong> generally not claimable if you have a fixed workplace. <em>Is</em> claimable if you have no fixed base (e.g. a roofer who starts at a different site every day).</li>
<li><strong>Travel within a job:</strong> claimable - moving between rooms of a development site doesn't count, but driving from one site to another in the same day does.</li>
<li><strong>Personal detour on a business trip:</strong> the personal portion is not claimable. Stopping at Tesco between two client visits means the Tesco-to-second-client miles need to be split.</li>
</ul>

<p>See our <a href="/what-counts-as-business-mileage">full breakdown of what counts as business mileage</a> for the edge cases.</p>

<h2>The contemporaneous record rule</h2>

<p>HMRC requires a record of each business journey made at or near the time of the trip. The key word is contemporaneous - written then, not later. The record must show:</p>

<ul>
<li>The <strong>date</strong></li>
<li>The <strong>start and end locations</strong> (postcodes or addresses)</li>
<li>The <strong>business purpose</strong> (which client, which delivery, which meeting)</li>
<li>The <strong>distance</strong> driven (in miles)</li>
</ul>

<p>What HMRC explicitly does not accept:</p>

<ul>
<li><strong>Estimates.</strong> "About 200 miles a week" is not a record - it's a guess.</li>
<li><strong>Reconstructions from memory.</strong> Writing it all down in January for the year just gone fails the contemporaneous test.</li>
<li><strong>Maps Timeline data alone.</strong> Google Maps Timeline and Apple Maps history do record where you went, but neither distinguishes business from personal, neither shows business purpose, and neither is in a tax-acceptable format.</li>
</ul>

<h2>The AMAP rates for 2025/26 and 2026/27</h2>

<ul>
<li><strong>Cars and vans (2026-27 onwards):</strong> 55p per mile for the first 10,000 business miles per tax year, then 25p per mile. The first-tier rate rose from 45p to 55p on 6 April 2026.</li>
<li><strong>Cars and vans (2025-26 and earlier):</strong> 45p per mile for the first 10,000 business miles, then 25p per mile - use this for late-filed returns covering the 2025-26 tax year.</li>
<li><strong>Motorbikes:</strong> 24p per mile (flat, no threshold)</li>
<li><strong>Bicycles:</strong> 20p per mile (flat)</li>
<li><strong>Passenger payment:</strong> additional 5p per mile per business passenger</li>
</ul>

<p>The 10,000-mile threshold resets at the start of each UK tax year (6 April). It does not carry over.</p>

<h2>Where mileage goes on your SA103</h2>

<p>The mileage deduction is claimed on the <strong>SA103S (short)</strong> or <strong>SA103F (full)</strong> Self Assessment page for self-employed income. Specifically:</p>

<ul>
<li><strong>SA103S (turnover under £85k):</strong> Box 20 "Car, van and travel expenses" - put your total AMAP claim here. Tick the "I have used cash basis or simplified expenses" box.</li>
<li><strong>SA103F (turnover over £85k):</strong> Box 21 of the equivalent section. Same logic - simplified expenses (AMAP) goes in the travel box.</li>
</ul>

<p>You enter the total deduction, not the miles. So 15,000 business miles (in 2026-27) becomes £6,750 (10,000 × 55p + 5,000 × 25p) - that £6,750 is what you write on the form. For a 2025-26 return the same mileage was £5,750 at the old 45p/25p rates.</p>

<h2>Practical record-keeping</h2>

<p>You have three real options:</p>

<h3>Option 1: Pen and paper</h3>
<p>A small notebook in your glove compartment, filled in at the start and end of each business journey. Works if you're disciplined. Fails after about three weeks for most people.</p>

<h3>Option 2: Spreadsheet</h3>
<p>The most common approach and the worst one. Unless you fill it in <em>in the car</em> after every trip, it's not contemporaneous. Reconstructing a week's miles on Sunday from memory is exactly what HMRC's rule was written to exclude.</p>

<h3>Option 3: A purpose-built mileage tracker app</h3>
<p>The right answer for almost everyone. Background GPS captures the trip automatically as you drive, you tap once to classify it as business or personal, and the per-trip log + tax-year totals are ready when you need them. No discipline required - the app does the discipline for you.</p>

<p>For self-employed UK drivers, what to look for:</p>

<ul>
<li>HMRC AMAP rates with the 10,000-mile threshold applied automatically</li>
<li>UK tax year (6 April to 5 April) baked in</li>
<li>Self Assessment-ready PDF with the per-trip detail HMRC requires</li>
<li>HMRC attestation cover sheet on the export</li>
<li>Offline-first GPS so you don't lose data in tunnels or rural areas</li>
<li>Free for the tracking - paying to record your own miles makes no sense</li>
</ul>

<h2>What to do when HMRC asks</h2>

<p>If HMRC opens an enquiry on your return, they'll ask to see your mileage log. Three things matter:</p>

<ul>
<li>Each business journey must be recorded individually</li>
<li>Each record must include the four fields (date, start, end, purpose, distance)</li>
<li>The record must have been made at or near the time of the journey</li>
</ul>

<p>A purpose-built tracker handles all three structurally. A spreadsheet filled in weekly does not.</p>

<h2>MileClear's approach</h2>

<p>MileClear is a free <a href="/mileage-tracker-uk">UK mileage tracker</a> built specifically for HMRC compliance. Every trip is GPS-recorded contemporaneously, classified business or personal with a tap (or auto-classified via saved locations or work schedule), and the AMAP calculation runs in real time as you drive. The Self Assessment PDF export (Pro, £4.99/mo) gives you per-trip detail + summary + attestation cover sheet - drop it onto your SA103 or hand it to your accountant. The tracking itself is <a href="/free-mileage-tracker-uk">free forever</a>.</p>

<p><a href="https://apps.apple.com/app/mileclear/id6759671005">Install MileClear on the App Store</a>.</p>

<h2>The bottom line</h2>

<p>Tracking business miles for HMRC is straightforward in concept and miserable in practice if you do it manually. The deduction is real and worth claiming - usually four-figure savings every year - but only if your records survive HMRC's contemporaneous-record test. Use a purpose-built tracker, classify trips in real time, and the SA103 line writes itself.</p>
`,
  },
  {
    slug: "tracking-mileage-for-work-employee-vs-self-employed",
    title: "Tracking Mileage for Work: Employee vs Self-Employed Guide",
    excerpt:
      "The rules for tracking mileage are different if you're a PAYE employee than if you're self-employed - but both groups can claim from HMRC. Here's how each works, what you can claim, and how to keep the right kind of record for your situation.",
    date: "19 May 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>If you drive for work in the UK, you can almost certainly claim tax relief on your mileage. But the rules differ depending on whether you're self-employed or PAYE-employed, and the right approach to tracking is different for each. This guide covers both.</p>

<h2>If you're self-employed</h2>

<p>Self-employed drivers - sole traders, gig delivery riders, private hire drivers, tradespeople, contractors - claim mileage as a business expense on Self Assessment. HMRC's Approved Mileage Allowance Payment (AMAP) lets you deduct:</p>

<ul>
<li>55p per mile for the first 10,000 business miles in a tax year (cars and vans, raised from 45p on 6 April 2026 for the 2026-27 tax year)</li>
<li>25p per mile thereafter</li>
<li>24p per mile flat for motorbikes</li>
<li>20p per mile flat for bicycles</li>
</ul>

<p>The deduction comes off your taxable profit. For a 15,000-mile-a-year self-employed driver, that's £6,750 off the top at the new 2026-27 rates - worth £1,350 to £2,700 in tax back depending on your band. (At the old 45p/25p that figure was £5,750.)</p>

<p>It goes on the <strong>SA103S box 20</strong> or <strong>SA103F box 21</strong> (the travel expenses line) of your Self Assessment, marked under simplified expenses. See our <a href="/updates/how-to-track-business-miles-hmrc">full SA103 guide</a> for the boxes.</p>

<p>The <a href="/self-employed-mileage-tracker">self-employed mileage tracker page</a> has a full walkthrough.</p>

<h2>If you're a PAYE employee</h2>

<p>PAYE employees - people who get a payslip with tax taken at source - have a different but related route: <strong>Mileage Allowance Relief (MAR)</strong>.</p>

<p>If your employer pays you a mileage rate for business journeys, but pays you <em>less</em> than HMRC's AMAP rate, you can claim the difference back from HMRC. Example:</p>

<ul>
<li>Your employer pays 25p per mile for business driving</li>
<li>HMRC's AMAP rate is 55p per mile for the first 10,000 miles (raised from 45p on 6 April 2026)</li>
<li>The 30p per mile gap is what you can claim back as Mileage Allowance Relief</li>
</ul>

<p>For 5,000 business miles a year, that's £1,500 in relief - worth £300 at basic rate, £600 at higher rate. (The same example under the old 45p AMAP rate was a £1,000 relief.)</p>

<p>If your employer pays you <strong>nothing</strong> for business mileage (rare but it happens), you can claim the full AMAP rate as MAR.</p>

<p>If your employer pays <em>more</em> than the AMAP rate, the excess is taxable as a benefit in kind - the opposite direction. You don't claim MAR but you may need to declare the excess.</p>

<p>PAYE employees claim MAR on the <strong>P87 form</strong> (online via gov.uk) for claims under £2,500 a year, or through Self Assessment if it's over £2,500 or you already file Self Assessment for other reasons.</p>

<p>The <a href="/employee-mileage-tracker">employee mileage tracker page</a> covers the P87 process in detail.</p>

<h2>What counts as a business journey - same for both</h2>

<p>The definition of "business mileage" is the same for self-employed and PAYE. A business journey is one driven wholly and exclusively for work purposes. Key rules:</p>

<ul>
<li><strong>Commute is never claimable.</strong> Home to your normal workplace = ordinary commuting. Not deductible whether you're employed or self-employed.</li>
<li><strong>Site-to-site is claimable.</strong> Once you're at work, any further driving for work is business mileage.</li>
<li><strong>Temporary workplaces are claimable.</strong> If you're temporarily working at a different site (less than 24 months), the travel to that site can be claimable. PAYE employees with no fixed workplace can claim all work travel.</li>
<li><strong>Detours for personal reasons aren't claimable.</strong> A 10-mile detour to the shops mid-business-trip means those 10 miles come off your business total.</li>
</ul>

<h2>What HMRC requires - also the same for both</h2>

<p>Both groups need a <strong>contemporaneous mileage log</strong>. The records must include date, start, end, business purpose, and distance for each business journey, recorded at or near the time of the trip. HMRC explicitly does not accept estimates or reconstructions from memory.</p>

<p>This is where most people fail. If your records don't survive an enquiry, the relief gets disallowed retrospectively. For PAYE employees that means owing tax back; for self-employed it means a higher tax bill plus potential penalties.</p>

<h2>How to track - app vs spreadsheet vs paper</h2>

<p>The mechanics are the same regardless of your employment status: you need a per-trip record made in real time. The realistic options:</p>

<ul>
<li><strong>Pen and paper:</strong> works if you're disciplined enough to write it down on every trip. Most people aren't.</li>
<li><strong>Spreadsheet filled in weekly:</strong> not contemporaneous, won't survive an HMRC enquiry. Don't.</li>
<li><strong>Purpose-built mileage tracker app:</strong> background GPS records the trip automatically, you classify it with a tap, the per-trip log and tax-year totals are ready when you need them. The right answer for almost everyone.</li>
</ul>

<h2>What to look for in a tracker if you're UK-based</h2>

<ul>
<li>Built around HMRC's AMAP rates (55p/25p/24p, raised from 45p/25p/24p on 6 April 2026) and the UK tax year (6 April)</li>
<li>Background GPS that captures the trip without you having to remember to start it</li>
<li>Per-trip classification (business or personal) with auto-classification options for power users</li>
<li>Export formats that work for both Self Assessment (SA103) and P87 / Mileage Allowance Relief</li>
<li>Offline-first - tunnels and rural blackspots don't lose data</li>
<li>Free for the basic tracking - paying to record your own miles makes no sense</li>
</ul>

<h2>MileClear works for both</h2>

<p>MileClear is built for UK drivers regardless of employment status. Self-employed users get the SA103-ready PDF export; PAYE users get a Mileage Allowance Relief summary showing the gap between what their employer paid and what HMRC's AMAP would have been - the number that goes on the P87. The tracking itself is <a href="/free-mileage-tracker-uk">free forever</a>; Pro (£4.99/mo) covers the export PDFs and a few extras.</p>

<p>Whichever side of PAYE you're on: <a href="https://apps.apple.com/app/mileclear/id6759671005">install MileClear on the App Store</a>.</p>

<h2>The bottom line</h2>

<p>Self-employed and PAYE employees both have legitimate, claimable tax relief on business mileage - through Self Assessment (AMAP) or P87 (MAR) respectively. The bar HMRC sets is the same for both: a contemporaneous, per-trip mileage log. Use a purpose-built tracker, capture every trip in real time, and the claim writes itself at tax-year end.</p>
`,
  },
  {
    slug: "free-mileage-tracker-uk-buyers-guide",
    title: "Free Mileage Tracker UK: A Buyer's Guide for 2026",
    excerpt:
      "Not all 'free' mileage tracker apps are created equal. Some are free trials. Some lock the actual claimable features behind a paywall. Here's what a genuinely free UK mileage tracker should include - and where the real costs hide.",
    date: "19 May 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>Search "free mileage tracker UK" on the App Store and you'll find a dozen apps with the word "free" in the title. Install three of them and you'll discover the catch within five minutes:</p>

<ul>
<li>App A: free for 14 days, then £9.99/month</li>
<li>App B: free to install, but limited to 30 trips a month (you can hit that in a week)</li>
<li>App C: free to track, but the export and the actual HMRC rate calculation are behind the paywall</li>
</ul>

<p>None of these are really free. They're trial-ware. This guide walks through what a genuinely free UK mileage tracker should include - and where the real costs in a tracking app actually live, so you can spot the bait-and-switch before you install.</p>

<h2>What "free" should mean</h2>

<p>A genuinely free UK mileage tracker should give you:</p>

<ul>
<li><strong>Unlimited trips.</strong> No monthly cap, no annual cap. You should be able to track 50,000 miles a year if your work demands it.</li>
<li><strong>Background GPS tracking.</strong> The trip should record automatically without you having to remember to open the app.</li>
<li><strong>HMRC AMAP rates calculated automatically.</strong> The 55p/25p/24p calculation with the 10,000-mile threshold applied per UK tax year (the first-tier rate rose from 45p to 55p on 6 April 2026) - this is the core value of any UK mileage tracker. If it's behind the paywall, the rest of the app is decoration.</li>
<li><strong>Business / personal classification.</strong> A tap to mark each trip business or personal, with the option to auto-classify by saved location or work schedule.</li>
<li><strong>UK tax year baked in.</strong> 6 April to 5 April, not the calendar year. Apps built for the US use 1 January and will report your numbers wrong.</li>
<li><strong>No ads.</strong> Ads in a tax app are a privacy red flag - they often mean your trip data is being sold.</li>
</ul>

<p>What's reasonable to gate behind a paywall:</p>

<ul>
<li>The Self Assessment PDF export (PDF generation has real per-document cost)</li>
<li>CSV bulk export</li>
<li>Open Banking integration (Plaid / TrueLayer APIs charge per user per month)</li>
<li>Multi-month analytics dashboards (heavy database queries)</li>
<li>Accountant sharing (extra infrastructure)</li>
<li>Unlimited vehicles + saved locations (storage scales with usage)</li>
</ul>

<p>What is <em>not</em> reasonable to gate:</p>

<ul>
<li>Recording a trip</li>
<li>Calculating the HMRC deduction</li>
<li>Classifying a trip as business or personal</li>
<li>Viewing your own tax-year total on screen</li>
<li>Receiving the AMAP rate applied to your vehicle</li>
</ul>

<p>The first list is "the cost of the developer running the app". The second list is "what every user needs to participate in the tax system at all". Gating the second list is the bait-and-switch pattern.</p>

<h2>Red flags to watch for</h2>

<ul>
<li><strong>"Free trial".</strong> If the App Store listing mentions "free trial" anywhere, the app is paid. The trial just delays the bill.</li>
<li><strong>Trip caps.</strong> 30 trips a month sounds generous until you do a Deliveroo shift with 12 orders before lunch.</li>
<li><strong>Paywalled exports.</strong> If you can record trips but can't see the tax-year total or the AMAP calculation, the app is useless for its stated purpose.</li>
<li><strong>"Upgrade to see your data".</strong> If you have to pay to see what you tracked, run.</li>
<li><strong>Ads inside a tax app.</strong> Where do you think the ad money comes from?</li>
<li><strong>Built for the IRS.</strong> Apps using "cents per mile" and "tax year starts January" are American. They'll calculate your numbers using the wrong rate and the wrong year boundaries.</li>
</ul>

<h2>Why "free" works as a business model for some apps</h2>

<p>A free tier funded by a paid tier is sustainable for one reason: the paid features have real per-user costs the free features don't. PDF generation, banking API fees, multi-month analytics queries - these all scale with use. Pro-tier users genuinely pay for those features.</p>

<p>What doesn't have real per-user cost: storing a few GPS coordinates per trip, applying a rate calculation, showing you your total on screen. That's the part that should be free, and the part the bait-and-switch apps gate.</p>

<h2>MileClear's free tier</h2>

<p>MileClear's <a href="/free-mileage-tracker-uk">free tier</a> includes:</p>

<ul>
<li>Unlimited GPS-tracked trips (no monthly cap, no annual cap)</li>
<li>Business / personal classification</li>
<li>HMRC 55p/25p/24p rate calculation with the 10,000-mile threshold (rate rose from 45p on 6 April 2026)</li>
<li>UK tax year baked in (6 April to 5 April)</li>
<li>Platform tagging for gig drivers (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, etc.)</li>
<li>1 vehicle with DVLA registration lookup</li>
<li>Fuel logging + live UK prices from 8,300+ stations</li>
<li>All 18 achievements + streaks + personal records</li>
<li>Daily, weekly, monthly, yearly recaps</li>
<li>2 saved locations with geofencing</li>
<li>Tax Readiness card (running tax-year summary)</li>
<li>Self Assessment wizard view (shows what each SA103 box should contain)</li>
<li>Activity heatmap + anonymous benchmarking</li>
<li>MOT + tax expiry reminders</li>
<li>Manual expense tracking (15 SA103-mapped categories)</li>
<li>Push notifications, profile, feedback voting</li>
</ul>

<p>Pro (£4.99/month or £44.99/year) covers:</p>
<ul>
<li>Printable Self Assessment PDF export</li>
<li>CSV export + import</li>
<li>Open Banking earnings sync</li>
<li>Auto-Classify Rules</li>
<li>Business Insights (£/mile, £/hour, platform comparison)</li>
<li>Multi-month analytics</li>
<li>Pickup Wait community insights</li>
<li>Accountant sharing</li>
<li>Journey Map (full-route visualisation)</li>
<li>Unlimited vehicles + saved locations</li>
</ul>

<p>There are no ads. There will never be ads. The free tier is paid for by the people who choose Pro.</p>

<h2>The bottom line</h2>

<p>A genuinely free UK mileage tracker should let you record trips, classify them, see the HMRC calculation and see your tax-year total - all without paying anything. If an app gates any of those four things, it's not free, it's a trial in disguise.</p>

<p>Want to try the genuinely free version? <a href="https://apps.apple.com/app/mileclear/id6759671005">Install MileClear on the App Store</a>.</p>
`,
  },
  {
    slug: "whats-new-in-version-1-2-0",
    title: "What's New in Version 1.2.0",
    excerpt:
      "The biggest MileClear update since launch. Quarterly HMRC submissions, road-accurate trip distances, a Lock Screen that earns its keep while you drive, and every sole-trader feature the community has been asking for. Thirty-odd things in total.",
    date: "14 May 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.2.0 has just been approved by Apple. This is the biggest update MileClear has shipped since launch, and it is the first release where I genuinely feel the app has caught up to the idea behind it.</p>

<p>I am going to walk you through the big stuff. Some of it is a brand-new feature that did not exist last week. Some of it is foundational work you will never see because it is the kind of bug that vanishes once it is fixed. All of it ships in the same install.</p>

<h2>Quarterly Self Assessment direct to HMRC</h2>

<p>From April 2026, sole traders earning over GBP 50,000 a year have to submit four quarterly returns to HMRC plus a year-end statement. No more single January 31 Self Assessment for that group - it is now five touchpoints with HMRC a year, every year, with deadlines in August, November, February, and May, and a final declaration the following January. It is called MTD ITSA (Making Tax Digital for Income Tax Self Assessment) and for a lot of drivers it is going to be the difference between knowing what they owe and getting an unwelcome surprise.</p>

<p>MileClear Pro now does the whole thing.</p>

<p>Avatar menu, Work and Tax, MTD ITSA. Connect your HMRC account once. Enter your National Insurance Number. Confirm your trade. From that moment on, every open obligation HMRC has for you shows up in MileClear, populated with the figures the app has been building all quarter from your trips, earnings, mileage, and expenses. The preview screen shows exactly what is about to be sent before you tap Submit, broken down per platform, with the AMAP tier crossover called out, and expenses bucketed so there are no surprises. After submission, MileClear asks HMRC's own calculation engine for the tax due and shows you their number alongside ours so you can sanity-check the marginal-rate breakdown before it is locked in.</p>

<p>This is the feature that took the longest. Sandbox integration with HMRC required 18 separate API services, fraud-prevention header compliance, encrypted token storage, replay-detection on every request, and three rounds of spec-conformance fixes before the validator returned zero errors. Production accreditation is still in HMRC's review queue (reference 2026-IBW598). Until they sign off, every submission goes to HMRC's sandbox environment - a banner inside the app makes that explicit so nobody accidentally relies on a sandbox return for their real tax. The moment accreditation lands, the same flow flips to production and your submissions count.</p>

<h2>Trip distances that are actually accurate</h2>

<p>Before 1.2.0, manual A to B trips used a free public routing service that occasionally fell back to straight-line distance when it got rate-limited. Same address pair, different mileage, depending on time of day. For a self-employed driver that is the difference between a credible HMRC mileage figure and a number they cannot explain.</p>

<p>1.2.0 replaces that with a three-layer routing stack: a persistent cache keyed on rounded coordinates, our own self-hosted UK routing engine on the MileClear server, and a commercial fallback for the rare case both fail. Same address pair, same mileage, every time, structurally. It is not a probabilistic improvement - the cache makes it deterministic.</p>

<p>Auto-tracked trips get the same treatment via map-matching. The GPS breadcrumb trail your phone produces while you drive is not the route you actually took - it is a noisy approximation with corner-cutting, occasional driving-through-a-building artefacts, and a slight tendency to swing wide on roundabouts. The map-matching step snaps that trail onto the actual road network so the line in the app is the road you were on, not the noise.</p>

<p>Both changes are invisible until you look at the trip detail screen and see "Route distance via road" or "Route distance via road (cached)" under the figure. That tiny line is the audit trail. Your HMRC mileage figure is now defensible at the level of each individual trip.</p>

<h2>Your Lock Screen earns its keep</h2>

<p>The most visible thing in 1.2.0 is what happens on your phone when you start driving.</p>

<p>If you have saved Home and Work as locations, MileClear now auto-detects when you cross either boundary. The moment you leave, your Lock Screen lights up with a Trip Active Live Activity - a small card that shows distance ticking up live, current speed, a "From Home" or "From Work" badge naming where you set off, and the vehicle being used. You can see it without unlocking your phone. The shift duration, the miles driven, the milestone you are closing in on, today's total earnings tally if you are running a gig shift - all updated in real time.</p>

<p>When you park at the destination - whether that destination is another saved location or somewhere new - the Activity flips to a Trip Complete summary. For business trips that includes the GBP value of the HMRC mileage deduction you just earned back. Park, see "GBP 5.54 HMRC" on your Lock Screen, before you have even unlocked the phone. That is the feedback loop that makes the app fade into the background and stay there.</p>

<p>End the shift from the Lock Screen using the End Shift button. The shift closes properly on the server, the mileage caps off at the right number, the Activity flips to the summary. No need to open the app.</p>

<h2>Smarter trip classification</h2>

<p>Tap a trip three times to tag it as Work. The fourth time MileClear does it for you. You will see a toast confirming the decision so you can override if it is wrong, but in most cases it is right. The auto-classifier waits until it has 80 percent agreement across at least three prior trips before it commits to a suggestion - so it is conservative on purpose.</p>

<p>For auto-detected trips, the confirmation notification on your Lock Screen now leads with the suggestion. Instead of "Trip detected, were you driving?" it now says "Work trip detected, from Home to Work, 12.3 mi, tap Yes Work to confirm." Three action buttons live on the lock screen: Yes Work, Personal, Not me. You confirm without unlocking. Each confirmation feeds back into the classifier so future trips between the same pair get more confident over time.</p>

<h2>For sole traders and freelancers</h2>

<p>The community has been asking for these features since 1.0. They are all in.</p>

<p><strong>Invoices.</strong> Track outstanding freelance work right in MileClear. Company name, amount, sent date, due date (defaults to 30 days), paid status. Free tier covers 3 invoices a calendar month, which is plenty for the occasional side gig. Pro unlocks unlimited. Cash basis (the UK default since April 2024) means Tax Readiness only counts invoice income that has actually arrived in your account.</p>

<p><strong>Tax basis: cash or accruals.</strong> Cash basis counts income when the money lands. Accruals counts when you sent the invoice. Most sole traders should leave it on cash - it matches how the money actually flows. Settings, Work and Tax, Tax basis.</p>

<p><strong>My Accountant.</strong> If you pay an accountant a known annual filing fee, enter it under Settings, Work and Tax, My Accountant. MileClear spreads it across 52 weeks and adds it to your Tax Readiness weekly set-aside. By the time filing season comes round, the cash for both the tax bill AND the accountant is already in the pot.</p>

<p><strong>PAYE deductions counted properly.</strong> If you have a salaried day job alongside gig work, you can now tell MileClear what your employer has already deducted in PAYE this year. The "still owed" figure on Tax Readiness becomes honest instead of double-counting tax that has already been collected via your payslip. NI is still calculated separately on your gig profits because Class 4 NI is per-source.</p>

<p><strong>Confidence indicator on every trip.</strong> High, medium, or low badge with tap-to-expand reasons. HMRC-defence material - every claimed mile is now individually auditable. A trip with a Low confidence badge gets a one-tap Recalculate button in case the GPS quality was poor.</p>

<h2>Rock-solid foundations</h2>

<p>The work nobody sees but everyone benefits from.</p>

<p><strong>You should never randomly get logged out.</strong> The previous refresh-token rotation deleted the old token before the client had a chance to acknowledge receipt of the new one. If iOS suspended the app mid-flight (common during cold starts) the client kept the old token, the server expected the new one, and the next API call kicked you to the login screen. From there, signing back in with Apple occasionally landed you in a fresh blank profile if the email lookups did not line up.</p>

<p>1.2.0 replaces that with a token-family rotation model with replay detection. Old tokens stay linked to their successors rather than getting deleted. A dropped response no longer kicks you out - the legitimate retry succeeds. Genuine token theft still gets detected and the whole session is force-terminated, which is the security property the rotation existed for in the first place. Industry-standard pattern (OAuth 2.0 Security Best Current Practice) and an audit-friendly answer for the compliance reviews we know are coming.</p>

<p><strong>End Shift from the Lock Screen actually ends the shift.</strong> Previously, tapping End Shift on the Live Activity dismissed the Activity but the shift itself stayed open on the server, so subsequent drives accumulated into it. Today's drives leaked into yesterday's shift. Now the shift closes cleanly via the API and the Activity flips to the summary view.</p>

<p><strong>Opening the app while parked no longer triggers a phantom trip.</strong> iOS re-evaluates geofence positions the moment the app launches, and if the cached position fix was a stale cell-tower triangulation, it could fire a phantom Exit event and kick off a fake recording while you were sitting still at your desk. 1.2.0 demands a fresh high-accuracy GPS fix before accepting any Exit fired in the first 30 seconds after app open.</p>

<p><strong>Brief stops no longer split a single drive into two records.</strong> Drive 5 minutes, park for under a minute at a petrol station, drive another 10 - that is one trip now, not two. The merge logic used to reject the join when the stop-detection split happened to overlap the new recording by a second, which is exactly the signal that says they are continuous. We made the merge window symmetric.</p>

<h2>In-app help and onboarding</h2>

<p>First-time users land on a 5-card Quick Start tour the first time they open the app. Covers the value loop in plain English: automatic trip tracking, Work and Personal classification, the Tax Readiness card, and how HMRC quarterly submissions work. Skippable from the top right, and you can replay it any time from Avatar, Help and Tutorials.</p>

<p>The Help and Tutorials screen itself is a categorised FAQ with about 28 topics across Getting started, Tax and HMRC, Trips, Money, Privacy and data, and Troubleshooting. Tap a topic to expand the answer or jump straight to the relevant settings screen.</p>

<p>Inline info buttons sit next to the trickier bits across the app. Tap the small icon next to the Tax Readiness card header, the PAYE field, the My Accountant row, or the tax basis toggle and a focused explainer slides up with the option to deep-link to the relevant screen. Same content as the full Help screen, surfaced exactly where you would think to ask the question.</p>

<h2>What's not yet finished</h2>

<p>Two notes for transparency.</p>

<p>MTD ITSA submissions still go to HMRC's sandbox because our production accreditation is in their review queue. The Sandbox banner inside the app makes that explicit. The moment HMRC sign off (reference 2026-IBW598), submissions flip to production with no further work needed from you.</p>

<p>Open Banking auto-import (Pro) is currently on TrueLayer's sandbox credentials. Same pattern - banner inside the app makes it clear, the flow itself is fully wired, the flip to production happens server-side when we promote the keys.</p>

<h2>Install it</h2>

<p>Version 1.2.0 is now live on the <a href="https://apps.apple.com/app/mileclear/id6759671005">App Store</a>. Install MileClear or update your existing install to get all of this.</p>

<p>Thanks to everyone who tested through TestFlight across builds 63 through 67 and flagged the rough edges. Thanks especially to Laura, whose feature requests directly produced the invoice tracker, the My Accountant flow, and the PAYE offset. Thanks to Raven, whose 108-mile drive split into two trips at a petrol station exposed the merge bug that everyone now benefits from. And thanks to anyone who emailed support@mileclear.com about anything in the past two weeks - several of the smaller polish wins in 1.2.0 came directly from messages like that.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "whats-new-in-version-1-1-4",
    title: "What's New in Version 1.1.4",
    excerpt:
      "Five rounds of polish across two months of work. Reliability fixes that compound across builds, two major tax features for drivers who don't fit the simple self-employed mould, and a settings hub that finally makes the app feel intentional.",
    date: "8 May 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.1.4 has just been approved by Apple. It is the fifth submission of this version line, which is more rounds than any previous release, and the result is a build that is materially more reliable, more accurate at tax time, and easier to navigate than 1.1.1 was.</p>

<p>This is a different shape of release to 1.1.0. There are no new pillars - the four pillars 1.1.0 introduced (Tax Readiness, Anonymous Benchmarking, HMRC Reconciliation, Vehicle compliance) are intact and unchanged. What 1.1.4 does is sharpen every existing pillar, fix the foundation underneath them, and address two driver segments that 1.1.x had been silently under-serving.</p>

<h2>Reliability is the headline</h2>

<p>The single biggest theme of 1.1.4 is making trip recording bulletproof. Five separate fixes ship in this release, each closing a class of bug that had been producing wrong data for some users.</p>

<p><strong>Cell-tower phantom trips are blocked at the source.</strong> A handful of users had been seeing trips appear in their list when they were actually parked - on break at a restaurant, sat at home, somewhere they had not been near. The cause was iOS occasionally falling back to cell-tower or Wi-Fi positioning when GPS signal dropped. Those fixes can be hundreds of metres off true position and look like motion to the app. As of 1.1.4, MileClear refuses to act on any location imprecise enough to be cell-tower derived. Phantom recordings while parked and phantom arrivals at saved places simply cannot form. Real GPS in the open or in built-up areas (50-80 m typical accuracy) flows through normally, and tunnels and multi-storey car parks are still captured during an active recording so legitimate distance is not lost.</p>

<p><strong>Drives are now logged from where you actually set off.</strong> If your first 15-20 minutes of driving were slow residential streets before joining a main road, the recording used to chop those minutes off and save the trip as starting on the A1. The watch-mode buffer is now preserved end-to-end so the start address and start time match where you actually departed. This was a bug for anyone whose home is more than a few junctions away from a fast road - so most drivers, in practice.</p>

<p><strong>Driving past a saved location no longer ends your trip.</strong> The school run was the most common failure: drop the kids at school, drive past your saved depot, end up at work - and the app saved it as three separate trips because every saved-location entry finalised the inbound recording. 1.1.4 waits to see if you have genuinely parked before deciding it is a real arrival, with three layers of protection: a 90-second dwell window, a position check at the moment iOS fires the entry event, and a position re-check at finalize.</p>

<p><strong>"As the crow flies" trips are caught and dropped.</strong> Auto-detected trips with too few GPS points to render properly on the map - a 14-mile "trip" with only two coordinates that draws as a single straight line across the city - are now identified at finalize and never reach your trips list. Both the phone and the server enforce the rule, so existing crow-flies trips have already been hidden too.</p>

<p><strong>The pickup wait timer cannot get stuck.</strong> If you ever forgot to tap "Picked up" after a wait, the timer used to accumulate runaway elapsed time - some users had multi-hour or multi-day "waits" pinned to their dashboard. The server now auto-closes any wait older than 2 hours the next time you open the app, and the timer resets to ready.</p>

<h2>Tax accuracy for drivers who don't fit the simple self-employed mould</h2>

<p>The second theme of 1.1.4 is that "self-employed gig driver, no other income" is not the only shape of MileClear user. Two new features address the segments that 1.1.x had been quietly under-serving.</p>

<p><strong>Tax brackets that work for moonlighters.</strong> If you have a day job, pension, or rental income alongside your gig work, the dashboard tax estimate now uses your real marginal rate instead of assuming gig profit is your only taxable income. There is a new field at Settings, Work settings, Other annual income - plug your pre-tax salary in, and every set-aside figure on the dashboard becomes accurate for your actual bracket.</p>

<p>The size of this fix is substantial. Drivers with a £50,000+ main job were silently seeing 20% basic-rate estimates when they should have been seeing 40%. A driver moonlighting for £15,000 of gig profit on top of a £50,000 PAYE salary was being told to set aside roughly £3,000 for HMRC; the real number is closer to £6,000 because all of that gig profit lands in higher-rate territory. Setting aside half the right amount is a catastrophe at filing time. 1.1.4 fixes it for anyone who fills in the field.</p>

<p>National Insurance calculations stay tied to gig profit only because Class 4 NI is per-source - a deliberate choice to match how HMRC computes it.</p>

<p><strong>Employer mileage rates.</strong> If you drive your own car for an employer who reimburses you per mile (rather than self-employed gig work), MileClear now lets you tell it what your employer pays. Settings, Work type, Employee using own vehicle, then enter your first-10,000-miles rate and an optional after-10,000-miles tier. Every total in the app then reflects what you actually claim from your employer, not the HMRC default.</p>

<p>The gap between your employer's rate and HMRC's 55p / 25p (raised from 45p on 6 April 2026) is what you can reclaim through Mileage Allowance Relief on a P87 or self-assessment, and the new figures put that gap into your numbers all year, not just at year-end. Roughly 5 million UK drivers reimburse mileage from an employer; this update is for them.</p>

<p>Both features are free, not Pro. Tax accuracy is "fighting your corner" software and stays free per <a href="/">MileClear's free vs Pro framework</a>.</p>

<h2>"Why this number?" panels</h2>

<p>The dashboard's tax-deduction figure on the Tax Readiness card is now tappable. Tapping opens a slide-up panel showing exactly how the number was calculated: the AMAP rate breakdown, which trips were counted, the date range, and links to the relevant HMRC pages. This is the first number with this treatment - more figures will get the same panel over the next few releases.</p>

<p>The reason this matters: when MileClear says "you can deduct £6,734 in mileage", drivers want to know <em>why</em>. An accountant friend put it best - "the software that survives long-term is the software that shows its work". 1.1.4 shows the work for the headline number, with the rest to follow.</p>

<h2>Settings hub and other UI work</h2>

<p>The Profile screen had grown to a 2,000-line monster as features stacked up in 1.1.x. 1.1.4 splits it into a proper hub with eight focused sub-screens: General, Tracking, Work and tax, Notifications, What you see, Data and exports, Help, Legal. The "What you see" screen is new - it lets you toggle which dashboard cards appear, in plain English, instead of the hidden customisation gesture from 1.1.0.</p>

<p>Other polish in this release:</p>

<ul>
<li><strong>Trips list paginates at 20 per page</strong> consistently across mobile and web. The stats summary at the top now comes from a dedicated server endpoint so totals are always accurate regardless of how many pages you have loaded.</li>
<li><strong>iPad fix:</strong> the "Got it" button on the Work mode explainer now works reliably on iPadOS 26, which had changed how transparent modals are presented and broken the old animated button.</li>
<li><strong>Rating prompt redesigned to be far less interruptive.</strong> The dashboard-focus trigger that fired every time you switched to the home tab is gone. The prompt now only appears after positive moments (achievement earned, streak milestone, trip saved), and dismissing once gives you 14 days of peace, twice gives you 30, after a third dismissal the app stops asking.</li>
<li><strong>New "Rate MileClear" link in Profile, Help & Support.</strong> Opens the App Store rating screen directly, so you can leave a review on your own terms.</li>
<li><strong>Freelance / Private gig platform tag.</strong> If you do consultancy, photography, freelance bookings, or anything that is not food delivery or rideshare, you no longer have to file those trips under "Other".</li>
<li><strong>Default geofence radius reduced from 150m to 100m.</strong> Tighter circles fire more reliably for real arrivals and stop overlapping with neighbouring places. The slider on the saved-location form still lets you go down to 50m or up to 500m.</li>
<li><strong>Auth screen no longer flashes a loading spinner</strong> in front of the dashboard during sign-in. Replaced with a skeleton placeholder so the dashboard cascade reveal stays the focal moment.</li>
<li><strong>Live Activity now seeds with the correct buffered totals</strong> when watch-and-wait detection promotes a real trip. Previously it could show 0.0 mi / 0:00 while the in-app screen showed the right numbers.</li>
</ul>

<h2>Behind the scenes</h2>

<p>A few things shipped in 1.1.4 that you will not see directly but that matter for the long term.</p>

<p>The server now refuses to start if Apple's In-App Purchase service fails to initialise, instead of running in a half-broken state where validate calls quietly return errors and customer purchases do not link to their accounts. Discovery and fix of a long-standing latent issue here led to several stranded paying customers being recovered.</p>

<p>The fuel-price fallback (when the gov.uk Fuel Finder API is having a bad day) used to log every fall-through; now it logs once on transition. DVLA lookups for any registration that returns a 4xx error stop retrying for a week, so a single bad plate does not generate noise on every cron run.</p>

<p>The mobile screens are now substantially complete on the unified design tokens - meaning when we adjust spacing, button styles, or skeleton loaders, the change ripples through the whole app instead of needing to be done screen-by-screen. This is groundwork for the larger visual passes that come in 1.2.0 and beyond.</p>

<h2>Why this took five rounds</h2>

<p>1.1.4 went through five build submissions to Apple before approval. The earlier rounds shipped to TestFlight - watch-and-wait detection rewrite, server-side recording watchdog, hold-to-end-trip, walking-shape phantom guard - and the later ones added the iPad modal fix, the tax bracket field, the Freelance platform tag, the geofence drive-through pattern, the watch-mode coord preservation, and finally the cell-tower phantom block that is in the build approved today.</p>

<p>The cost of that iteration is real: each round is a build, an internal test, an external test, a submission, a review, a verdict. The benefit is also real: every round caught something that would otherwise have shipped to the App Store as a regression, and the version that made it through is the one I would have been embarrassed to ship in any earlier form.</p>

<p>Trip recording reliability is non-negotiable for MileClear - it is the foundation under every other feature - and 1.1.4 is the build where that foundation finally feels solid.</p>

<h2>What's next</h2>

<p>Two streams of work resume now that 1.1.4 is on the public side of the door.</p>

<p>The first is <strong>MTD ITSA</strong> for the 7 August 2026 first quarterly submission deadline. Phase 1 (OAuth and fraud-prevention scaffolding) is complete. Phase 2 (Self Employment Business API submission, Individual Calculations, BSAS) is the next ten days of work. Phase 3 (mobile UI), Phase 4 (HMRC production accreditation, runs in parallel), and Phase 5 (TestFlight beta with high-earner drivers) follow. Target: TestFlight by 19 July, public by 7 August. This will ship as 1.2.0.</p>

<p>The second is <strong>Other Expenses</strong> - food, accommodation, equipment, phone bills, working-from-home costs - which a Pro tester (thank you, Laura) requested earlier today. This will ship alongside MTD ITSA in 1.2.0 because the expense payload is part of the quarterly submission. Five phases, two to three weeks of work, seven HMRC-aligned categories that map directly to SA103S boxes 17, 18, and 19. Free tier will allow 5 manual expenses; Pro unlocks unlimited entries plus receipt OCR (reusing the Apple Vision pipeline already built for earnings) and categorised exports.</p>

<h2>Get it</h2>

<p>Version 1.1.4 is now live on the <a href="https://apps.apple.com/app/mileclear/id6759671005">App Store</a>. Install MileClear or update your existing install to get all of this.</p>

<p>Thanks to everyone who tested through TestFlight across builds 58, 59, 60, 61, and 62 and flagged the rough edges. This release is better because of you.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "does-amazon-flex-track-mileage",
    title: "Does Amazon Flex Track Mileage? (UK Tax Guide)",
    excerpt:
      "Short answer: no, Amazon Flex does not track your mileage in any way HMRC accepts. Here is why that matters for your tax bill, what the app does and does not record, and what UK Flex drivers should do instead.",
    date: "29 April 2026",
    author: "Gair",
    category: "guide",
    content: `
<p><strong>Short answer: no. Amazon Flex does not track your mileage in any way that satisfies HMRC.</strong></p>

<p>The app records the blocks you accept, the parcels you deliver, and what you got paid. It does not log the miles you drove, it does not export them in a tax-friendly format, and it does not produce anything HMRC would accept as a contemporaneous record. Amazon pays you per block - not per mile - so they have no business reason to track that data.</p>

<p>Long answer: this is the most-asked tax question among UK Amazon Flex drivers, and getting it wrong costs you hundreds or thousands of pounds at Self Assessment. Here is what the gap looks like and what to do about it.</p>

<h2>What Amazon Flex actually records</h2>

<ul>
<li>The block you accepted (start time, end time, station, expected pay).</li>
<li>The route Amazon assigned to that block.</li>
<li>Each parcel scan and delivery confirmation.</li>
<li>Your total earnings for the block.</li>
</ul>

<p>What it does not record:</p>

<ul>
<li>The miles from your home to the depot at the start of a block.</li>
<li>The miles from your last drop back home.</li>
<li>Any deviation from Amazon's route - traffic detours, missing house numbers, extra return drops.</li>
<li>An odometer or GPS log you can export.</li>
<li>Anything in HMRC-acceptable format.</li>
</ul>

<h2>What HMRC actually requires</h2>

<p>If you are claiming the Approved Mileage Allowance Payment (AMAP) deduction on your Self Assessment - and as a self-employed Flex driver you almost certainly should be - HMRC needs a contemporaneous record of every business journey. That means: the date, the start and end location, the reason for the trip, and the distance driven. Logged at the time, not reconstructed in January from memory.</p>

<p>The current AMAP rates:</p>
<ul>
<li><strong>55p per mile</strong> for the first 10,000 business miles in cars and vans, in tax year 2026-27 onwards (the rate rose from 45p to 55p on 6 April 2026; use 45p for any return covering 2025-26 or earlier).</li>
<li><strong>25p per mile</strong> for every business mile after that.</li>
<li><strong>24p per mile</strong> for motorcycles.</li>
<li><strong>20p per mile</strong> for bicycles.</li>
</ul>

<p>For a typical Flex driver covering 200 business miles a week, that is around £5,500 a year in deductions at the new 2026-27 rates (was around £4,500 at the old 45p rate). If your records do not exist - or do not pass HMRC's "contemporaneous" test - you cannot claim a penny of it.</p>

<h2>"I'll just use Google Maps Timeline" - why that does not work</h2>

<p>Google Maps Timeline and Apple Maps history do record where you went. But neither distinguishes business from personal miles, neither timestamps in a tax-acceptable format, and neither exports in any way you can hand to HMRC. Your trip to Tesco at 2pm and your Amazon Flex block at 4pm both look the same in Maps Timeline - just dots on a route. Reconstructing a tax year from raw timeline data in January is a slow, error-prone afternoon you do not need.</p>

<h2>What to do instead</h2>

<p>Use a purpose-built UK mileage tracker - one that records every block automatically, tags trips by platform, applies the HMRC rate, and exports a Self Assessment-ready PDF when you need it.</p>

<p><a href="/amazon-flex-mileage-tracker">MileClear's full Amazon Flex guide</a> covers the specifics - block-based shifts, the home-to-depot commute rule, return-to-depot miles, multi-platform tagging if you also drive for Uber or Deliveroo. The setup takes about 5 minutes the first time you accept a Flex block. After that, every mile is captured without you doing anything.</p>

<p><strong>Free tier:</strong> automatic GPS tracking, manual classification, HMRC rate calculation, fuel-price lookup, all your historical trips. The tracking is what you actually need, and it is permanent and free.</p>

<p><strong>Pro at £4.99/month:</strong> CSV and PDF Self Assessment exports, the HMRC attestation cover sheet, CSV import from Amazon Flex earnings statements, the Self Assessment wizard that walks you through which numbers go in which boxes on your SA103. You only need Pro at tax time - daily tracking stays free year-round.</p>

<h2>Bottom line</h2>

<p>Amazon Flex does not track mileage. If you are claiming AMAP on Self Assessment, that gap is yours to fill. Track every mile contemporaneously with a tool built for HMRC compliance, or accept that you will under-claim by hundreds or thousands of pounds a year.</p>

<p><a href="https://apps.apple.com/app/mileclear/id6759671005">Install MileClear free on the App Store</a>.</p>
`,
  },
  {
    slug: "inactive-on-gophr",
    title: "Inactive on Gophr: What It Means and What to Do Next",
    excerpt:
      "Gophr couriers searching 'inactivity on gophr' usually have one fear: have I lost my account? Here's what an inactivity notice actually means, what to do this week, and how to make sure the work you've already done is still yours - records, miles, and tax claim included.",
    date: "29 April 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>If you are searching "inactivity on gophr", you probably opened the app and saw something you did not want to see. Maybe a banner. Maybe a missing job queue. Maybe nothing at all - the worst kind of warning. Gophr couriers in the UK ping me about this more often than couriers on any other platform, and the picture is the same most times.</p>

<p>This guide is the practical version of "what now". It will not promise you the exact policy Gophr applies to your account today - those policies move, and only Gophr support can tell you the specifics for your particular case. What it will do is explain how courier-platform inactivity generally works, what to do this week, and why - whatever happens with your account - the miles you have already driven still belong to you.</p>

<h2>What inactivity actually means on a courier platform</h2>

<p>Courier platforms like Gophr, Stuart, and Just Eat manage finite pools of active riders. When a courier stops accepting jobs for an extended period, the platform marks them as inactive. The exact window varies - some platforms use 30 days, some 60, some longer, and most do not publish an exact figure because it changes by region and demand.</p>

<p>What "inactive" then means depends on the platform. Common forms:</p>

<ul>
<li><strong>Soft inactivity:</strong> you stop seeing jobs but the account is otherwise fine. Sign in, complete a job, you are back.</li>
<li><strong>Documents required:</strong> the platform asks you to re-upload your insurance, hire-and-reward cover, vehicle docs, or right-to-work proof before you can take jobs again.</li>
<li><strong>Hard deactivation:</strong> the account is closed and you have to re-apply. Rarer for genuine inactivity, more common when there is a separate compliance issue the inactivity flag is hiding.</li>
</ul>

<p>If you have just received an inactivity message, the odds are you are in the first or second category. Most couriers I speak to get reactivated by Gophr support within a few days of asking, especially if their docs are still in date.</p>

<h2>What to do this week</h2>

<ol>
<li><strong>Open the Gophr app and screenshot anything you see.</strong> Banner, message, status. The exact wording matters when you contact support.</li>
<li><strong>Check your documents.</strong> Insurance (hire-and-reward cover specifically, not standard SD&P), vehicle docs, and any background-check expiry. If any are out of date, that is the most likely root cause.</li>
<li><strong>Email Gophr support directly.</strong> Calmly explain that your account has been marked inactive, that you want to reactivate, and that you are willing to re-submit anything they need. Polite and specific gets a faster reply than angry and vague.</li>
<li><strong>Sign in and try a job if the queue is open.</strong> Sometimes "inactivity" lifts the moment you take and complete a job. Worth trying before you escalate.</li>
<li><strong>Plan for the week.</strong> If reactivation will take a few days, line up other platforms (Uber Eats, Deliveroo, Just Eat, Stuart, Amazon Flex) so your earnings do not go to zero.</li>
</ol>

<h2>The harder lesson: your records do not belong to the platform</h2>

<p>The reason "inactivity on gophr" makes couriers nervous is not just the lost income. It is the realisation that the platform holds the records of every job you have done. If they decide to deactivate you tomorrow, that history might become harder to access. Gophr is not unique here - every gig platform works this way.</p>

<p>And here is the part most couriers do not realise until they need it: <strong>your mileage tax claim does not run on the platform's data. It runs on yours.</strong> HMRC requires a "contemporaneous record" - a log kept at the time the journey happened - of every business mile you drive. You can claim 55p per mile for the first 10,000 business miles in a tax year (the first-tier rate rose from 45p to 55p on 6 April 2026) and 25p per mile after that, on top of whatever you took home from the platform. For a courier doing 200 miles a week, that is around £5,500 a year you can deduct from your taxable profit, regardless of what Gophr's app shows.</p>

<p>If your records sit only in Gophr's app and Gophr deactivates you, you have a problem. Not catastrophic - HMRC accepts other forms of evidence - but harder than it needs to be.</p>

<h2>This is exactly why I built MileClear</h2>

<p>I built <a href="/">MileClear</a> because I watched too many UK couriers - on Gophr, on Deliveroo, on Just Eat, on Uber Eats - lose money at tax time because their records lived in someone else's app. MileClear tracks every business mile automatically, applies the <a href="/hmrc-mileage-rates">HMRC AMAP rate</a> (55p / 25p / 24p depending on vehicle, raised from 45p/25p/24p on 6 April 2026), and keeps the record on your phone, in your name, exportable to a Self Assessment-ready PDF whenever you want it.</p>

<p>It does not depend on Gophr being active, on Deliveroo accepting your application, or on Just Eat keeping your account alive. The tracker runs in the background, attaches the right platform tag to each trip (Gophr, Stuart, Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri), and gives you a complete audit trail in case HMRC ever ask. If a platform deactivates you tomorrow, every mile you drove for them up to that point is still yours.</p>

<p><strong>What you get on the free tier:</strong> automatic GPS trip tracking, manual classification, HMRC rate calculation, fuel-price lookup, two saved locations (home and depot, typically), all your historical trips. Tracking is the part you actually need - and it is permanent and free.</p>

<p><strong>What Pro adds for £4.99/month:</strong> the export side. CSV and PDF Self Assessment downloads, the HMRC-formatted attestation cover sheet, CSV import from platform earnings statements, unlimited saved locations, and the Self Assessment wizard that walks you through which numbers go in which boxes on your SA103 form. You only need Pro at tax time - so if you are a daily driver, you can run free for 11 months and upgrade in late January.</p>

<h2>Quick checklist if you are dealing with Gophr inactivity right now</h2>

<ul>
<li>Screenshot the Gophr message and contact their support, calmly and specifically.</li>
<li>Check your insurance and document expiry - this is usually the real cause.</li>
<li>Sign on and try a job if the queue is live.</li>
<li>Line up another platform for the week so your income does not stop.</li>
<li><a href="https://apps.apple.com/app/mileclear/id6759671005">Install MileClear free</a> so the next time a platform throws a curveball, your records are yours.</li>
</ul>

<p>Inactivity on Gophr is almost always reversible. Lost mileage records are not. Sort the first; then make sure the second can never happen to you again.</p>
`,
  },
  {
    slug: "whats-new-in-version-1-1-0",
    title: "What's New in Version 1.1.0",
    excerpt:
      "Tax Readiness card, Activity Heatmap, Anonymous Benchmarking, HMRC Reconciliation, MOT History, pickup wait timer. The biggest single update we've shipped, and the reason we're moving from 1.0.x to 1.1.0.",
    date: "26 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.1.0 is a step change. Thirteen new features, two new database tables, six new API endpoints, and a fundamental shift in what the dashboard does. We are moving from 1.0.x to 1.1.0 because the tools added here change MileClear from a mileage tracker into something that actively helps drivers run a self-employed business.</p>

<h2>The Tax Readiness card</h2>

<p>This is the card I am most excited about, and it is the headline of 1.1.0. On the Work mode dashboard, you now see, live, every time you open the app:</p>

<ul>
<li>Your estimated tax + NI for the current tax year, calculated from your real earnings minus your real mileage deduction</li>
<li>How much to set aside this week for HMRC, calculated from your last 7 days of earnings at your effective rate</li>
<li>A countdown to the 31 January filing deadline, which turns amber at 90 days and red at 30</li>
<li>A 3-item readiness check (full name set, primary vehicle with MPG, all trips classified) showing where you stand</li>
<li>A higher-rate-threshold warning if your projected profit is approaching £50,270 - drivers who cross this line lose 20p in the pound to additional tax, and tracking every business mile keeps them below it for longer</li>
</ul>

<p>This is the kind of feature drivers have been telling me they wanted: not "what is my mileage" but "am I going to be OK in January". The card answers that, in real numbers, every time you open the app.</p>

<h2>Activity Heatmap and Anonymous Benchmarking</h2>

<p>Two new dashboard cards built on the data MileClear already collects:</p>

<p><strong>Activity Heatmap</strong> shows when you actually drive and earn most. Seven days × twenty-four hours, intensity-coloured. Filter by platform - Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart - and toggle between trips and earnings. Tap any cell for the breakdown. Built on the last 12 weeks of your own data, so it adapts to how your week actually looks.</p>

<p><strong>Anonymous Benchmarking</strong> compares your weekly miles and trips to all UK MileClear drivers. Median, p25, p75, your position on the distribution, "top X%" framing. Per-platform breakdowns appear when each platform has 5+ active contributors. There is a hard privacy floor of 5 contributors per cell - we never show buckets thinner than that, and we never expose individual data. As more drivers join, more buckets light up automatically.</p>

<p>Anonymous Benchmarking is, I think, the feature most likely to change how drivers think about MileClear. It turns "your data" into "your data plus industry context". Knowing whether you're earning the same as everyone else in your area is genuinely powerful information that gig drivers have basically never had.</p>

<h2>HMRC Reconciliation</h2>

<p>Since 1 January 2024, every UK gig platform has been reporting your earnings directly to HMRC under the OECD Digital Platform Reporting rules. The first batch of reports landed at HMRC by 31 January 2026. That means HMRC now has a per-platform record of what each driver earned, and they can compare it against what was declared on Self Assessment.</p>

<p>The new HMRC Reconciliation screen lets you enter the figures HMRC has reported for each platform (from the notice in your Personal Tax Account) and see the gap against MileClear's tracked earnings. Within £20 either way is fine. A bigger gap is something to investigate before HMRC does.</p>

<p>This is "fighting your corner" software in the most literal sense.</p>

<h2>MOT History and vehicle reminders</h2>

<p>Two pieces of vehicle compliance work, powered by direct integrations with DVLA and DVSA:</p>

<p><strong>Vehicle MOT and tax expiry reminders.</strong> MileClear now refreshes your primary vehicle's DVLA data weekly and pushes a notification when MOT or tax expires within 14 days. Tap the notification to jump straight to the vehicle. A self-employed driver losing income to a missed MOT is a real, expensive problem - this stops it.</p>

<p><strong>MOT History.</strong> Tap "View MOT History" on any vehicle with a registration plate to see the full DVSA record. Test results, expiry dates, advisories, defects with severity tags ("dangerous", "major", "advisory"), and odometer growth between tests. Direct from the DVSA MOT History API. Useful for spotting things flagged at the last test that might fail next time.</p>

<h2>Pickup wait timer</h2>

<p>On the Active Recording screen there is a new "Wait at pickup" tappable card. Tap it when you arrive at a restaurant or depot, and a stopwatch runs. Tap "Picked up" when the order is ready, and the wait is saved with location and platform.</p>

<p>For now, this is just personal data collection - your own waits. A future version will use the aggregated data to surface community insights: "this McDonald's averages 12-minute waits", "Uber pickups in this zone average 4 minutes". You will be able to avoid the slow ones. The infrastructure is in 1.1.0; the community surface comes once enough drivers are contributing.</p>

<h2>First-time Self Assessment guide</h2>

<p>Plain-English walkthrough for drivers filing Self Assessment for the first time. Covers UTR registration, the UK tax year (6 April to 5 April), what you actually pay (income tax + Class 4 NI + Class 2 NI), the AMAP mileage deduction at 55p/25p (raised from 45p on 6 April 2026; or 24p flat for mopeds), and the 31 January deadline.</p>

<p>It is reachable from the Tax Readiness card, and exists to make sure new self-employed drivers do not miss the basics in their first year. UTR registration alone takes 10 working days - drivers who leave it until October regret it.</p>

<h2>Plus</h2>

<ul>
<li><strong>HMRC attestation cover sheet on the Self Assessment PDF</strong> - one-page signed declaration page with your name, UTR, tax year period, and the contemporaneous-record attestation language HMRC inspectors recognise. Pro feature. Accountants will share it.</li>
<li><strong>Earnings adoption nudge</strong> - if you are tracking trips but have not logged earnings recently, the Tax Readiness card shows a one-tap shortcut to the earnings form. Without earnings, the tax estimate cannot work.</li>
<li><strong>Sparse-GPS-trace reliability fix</strong> - solved the bug where iOS could suspend the JS runtime mid-trip and leave recording stuck in low-power detection mode. The recording-mode upgrade now verifies it took effect and retries automatically.</li>
</ul>

<h2>Why 1.1.0 and not 1.0.11</h2>

<p>Version numbers are arbitrary, but they signal something. 1.0.x said "we are still figuring out what this app is". 1.1.0 says "we know what this app is now: it is the tool that helps UK gig drivers stay in control of their tax, their vehicle, and their pricing".</p>

<p>The features in 1.1.0 are not just refinements. The Tax Readiness card is a genuinely new pillar of the product. Anonymous Benchmarking is a new pillar. HMRC Reconciliation is a new pillar. Vehicle compliance is a new pillar. That is four new pillars in one release, on top of the existing tracking and exports. It is the right time for the version line to move.</p>

<h2>Get it</h2>

<p>Version 1.1.0 is now live on the <a href="https://apps.apple.com/app/mileclear/id6759671005">App Store</a>. Install MileClear or update your existing install to get all of this.</p>

<p>If you have been following along through the 1.0.x cycle, thank you for sticking with it. The diagnostic dumps, the bug reports, the "this would be useful" notes - they all shaped this release.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "whats-coming-next",
    title: "What's Coming Next",
    excerpt:
      "1.2.0 is MTD ITSA: HMRC quarterly submissions in time for the first practical deadline of 7 August 2026. Plus community wait-time insights, deeper Anonymous Benchmarking, and longer-term strategic plays.",
    date: "26 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.1.0 is a substantial step. The natural question is: what comes next? Here is the rough shape of where MileClear is heading, organised by when each piece is realistic.</p>

<p>None of this is a hard commitment. Solo development moves with the data, and the data sometimes says "do this thing instead". But the direction is set.</p>

<h2>1.2.0: MTD ITSA quarterly submissions (target: 7 August 2026)</h2>

<p>This is the big one, and it is happening sooner than originally planned. Build starts the week of 5 May 2026.</p>

<p>The April 2026 MTD ITSA threshold of £50,000 is already in effect. The first practical deadline that matters is <strong>7 August 2026</strong> - the close of the Q1 2026-27 quarterly submission window for self-employed drivers crossing that threshold. That is full-time DPD ODFs, full-time Amazon Flex drivers, full-time Uber drivers, and any multi-app driver running 60+ hour weeks. They need MTD-compliant software now, and whichever app they pick first becomes their default.</p>

<p>So MileClear is shipping it as 1.2.0, on a tight ~12-week timeline:</p>

<ul>
<li><strong>Phase 1 (week of 5 May):</strong> OAuth flow against HMRC sandbox + the 9-15 mandatory fraud-prevention headers HMRC requires on every call.</li>
<li><strong>Phase 2 (10 May - 14 June):</strong> Submission flow against the Self Employment Business API. Mapping MileClear earnings, mileage, and expenses to HMRC's schema; wiring the Obligations and Individual Calculations APIs so drivers see their period status and tax estimate directly.</li>
<li><strong>Phase 3 (parallel):</strong> Mobile UI - connect HMRC, see your obligations, preview the figures, submit, confirm. Pro feature.</li>
<li><strong>Phase 4 (parallel, weeks of 19 May - 21 June):</strong> HMRC production accreditation - 3-4 weeks of HMRC review, submitted early so it runs alongside development.</li>
<li><strong>Phase 5 (21 June - 5 July):</strong> Closed beta with high-earner drivers running real submissions against production HMRC.</li>
<li><strong>By 19 July:</strong> Public TestFlight or App Store availability for &gt;£50k drivers.</li>
<li><strong>7 August 2026:</strong> First real Q1 quarterly submissions land at HMRC via MileClear.</li>
</ul>

<p>The MileClear sandbox application is already registered with HMRC's Developer Hub, with all 9 relevant Self Assessment APIs subscribed. The pre-positioning is done; the build is what is ahead.</p>

<p>The strategic case is simple. Every month MileClear delays MTD ITSA is a month it cedes the highest-value customer segment to QuickBooks, Xero, or TripCatcher. Once a driver has wired their financial life into a tax tool, switching is hard. Better to be the tool they pick first.</p>

<h2>1.3+ (following months)</h2>

<h3>Community pickup-wait insights</h3>

<p>The pickup wait timer in 1.1.0 collects per-driver data. The aggregation surface is what makes that data valuable: "this McDonald's averages 12-minute waits across 8 drivers", "Friday evenings here are 18 minutes". Once enough drivers are using the timer, the average wait at every pickup point becomes a useful piece of intelligence. Privacy floor is the same as Anonymous Benchmarking - never show a bucket with fewer than 5 contributors.</p>

<h3>Deeper Anonymous Benchmarking</h3>

<p>1.1.0 ships national-level benchmarks. As the user base grows, regional breakdowns become statistically meaningful: "drivers in your postcode area average X miles per week". The infrastructure is ready; the data needs to catch up. Greater London, Greater Manchester, Birmingham, Glasgow, and Edinburgh first, then expand outward as density increases.</p>

<h3>Onboarding revamp</h3>

<p>The biggest gap in MileClear's funnel today is users who classify trips but never log earnings. Without earnings, the tax estimate cannot work. The 1.1.0 earnings nudge addresses this for active users; the next step is rebuilding the first-launch experience so new users understand from day one why earnings logging matters.</p>

<h3>HMRC reconciliation auto-fill</h3>

<p>Right now you type in HMRC's reported figure manually. The Self Assessment Accounts API would let MileClear fetch this directly with consent - which becomes natural once the OAuth and accreditation work for MTD ITSA is in place.</p>

<h2>1.4+ (later in 2026)</h2>

<h3>Vehicle maintenance log</h3>

<p>Service intervals, oil changes, tyres, brakes. Push reminders ahead of due dates. For owner-driver-franchisees running £30,000 Sprinters, missing a service is real money. Builds on the existing DVLA + DVSA integrations.</p>

<h3>Insurance broker partnership</h3>

<p>Most UK gig drivers are either underinsured or paying too much for the wrong policy class. A "Find Insurance" screen would let drivers compare quotes from regulated UK gig-insurance brokers (Zego, Inshur, etc.) with one tap. The compliance work is non-trivial - FCA rules about advice vs introduction matter here - but the value to drivers is clear.</p>

<h2>Strategic plays (long-term)</h2>

<h3>Verified mileage handoff to insurers</h3>

<p>None of the gig-economy insurers have built a verified-mileage product, even though pay-per-mile insurance literally needs that data. If MileClear becomes the trusted source-of-truth for "miles driven for work" that insurers consume via API, that is a B2B moat plus a co-marketing channel.</p>

<h3>Native tracking module</h3>

<p>The current tracking layer runs in JavaScript via Expo. iOS can suspend the JS runtime mid-trip, which is the root cause of several reliability bugs we have layered fixes against. The proper long-term solution is a Swift native module that runs outside the JS runtime. This is a serious investment - 4-8 weeks of focused work - and only justified once the user base is big enough that reliability variance becomes a churn problem. Not yet, but on the radar.</p>

<h3>Android</h3>

<p>iOS-only is fine for now: 80% of the gig-driver target audience uses iPhone. But Android coverage is the natural next platform once the iOS app is genuinely stable. Android is a deferred 1.x or 2.0 release.</p>

<h2>Things that are not on the roadmap</h2>

<p>Worth being explicit about a few things MileClear is not going to do, because being focused matters more than being feature-complete.</p>

<ul>
<li><strong>Generic budgeting / savings goals.</strong> Banking apps do this better. MileClear is for drivers, not the general public.</li>
<li><strong>Multi-currency / international.</strong> UK-only. The whole product is built around HMRC, AMAP rates, and UK gig platforms. Going international would require redoing every assumption.</li>
<li><strong>Stocks, crypto, investments.</strong> Out of scope. MileClear is about earning more from driving, not about what to do with the savings.</li>
<li><strong>An Android-style fully customisable dashboard.</strong> The layout-customisation that already exists in 1.0.x is the limit. More flexibility just adds complexity without changing user outcomes.</li>
</ul>

<h2>How to influence what's next</h2>

<p>The roadmap moves with the data. If you are using the app and something feels missing, tell me - either through the in-app feedback screen, the MileClear Facebook group, or directly to gair@mileclear.com.</p>

<p>I read every message. Several of the features in 1.1.0 came directly from things drivers said they wanted: vehicle reminders ("I missed an MOT and lost three days of earnings"), benchmarking ("am I making the same as everyone else?"), HMRC reconciliation ("I do not even know what HMRC has on file for me"). If you have a "this would be useful" thought, it has a real chance of becoming a feature.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "whats-new-in-version-1-0-10",
    title: "What's New in Version 1.0.10",
    excerpt:
      "Self Assessment wizard, accountant sharing, receipt scanning, Siri Shortcuts, the new Active Recording screen, and critical fixes for trip data loss and Apple subscription processing.",
    date: "25 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.0.10 adds four features that make MileClear genuinely useful beyond just tracking miles, a new set of recording surfaces so you always know when GPS is on, plus fixes for two data loss bugs that affected real users.</p>

<h2>Self Assessment wizard</h2>

<p>This is the feature I'm most excited about. Instead of just giving you a PDF at tax time, MileClear now walks you through the actual HMRC Self Assessment form step by step. It maps your earnings, mileage deduction, and allowable expenses to specific SA103 box numbers - Box 9 for your turnover, Box 46 for simplified mileage, Box 27 for other expenses.</p>

<p>Each step shows the real numbers from your MileClear data with a full breakdown. The tax estimate includes income tax by band, Class 2 NI, and Class 4 NI, so you know roughly what to set aside. It is guidance, not tax advice - but it is a lot better than staring at a blank tax return wondering which number goes where.</p>

<h2>Accountant sharing</h2>

<p>You can now invite your accountant to a read-only dashboard by email. They get a private link - no MileClear account needed - showing your trip summaries, mileage deductions, expenses by category, and earnings by platform. They can download CSV and PDF exports directly.</p>

<p>This is a premium feature. The idea is that your accountant sees exactly what you see, formatted for their needs, without you having to export files and email them back and forth.</p>

<h2>Receipt scanning</h2>

<p>Point your camera at a parking ticket, toll receipt, or fuel receipt. MileClear extracts the amount, date, and vendor using Apple's on-device text recognition - your images never leave your phone. The extracted data pre-fills the expense form so you just tap confirm.</p>

<p>It handles most UK receipt formats and recognises common retailers. If the scan gets something wrong, the fields are editable before you save. This requires a development build - it will not work in Expo Go.</p>

<h2>Siri Shortcuts</h2>

<p>Four voice commands, all hands-free:</p>

<ul>
<li>"Hey Siri, start my shift in MileClear" - opens the app and starts GPS tracking</li>
<li>"Hey Siri, how many miles today in MileClear" - reads back your day's stats without opening the app</li>
<li>"Hey Siri, log expense in MileClear" - Siri asks for the amount and logs it</li>
<li>"Hey Siri, weekly goal in MileClear" - tells you your progress percentage</li>
</ul>

<p>The intents that just read data work entirely in the background - Siri responds without launching the app. Start Shift opens the app because GPS tracking needs it in the foreground.</p>

<h2>Fixes that matter</h2>

<p>Two bugs this week affected real users and both are fixed.</p>

<p>A driver ended a 10-hour overnight shift covering 260 miles, and the entire shift's trip data vanished. The cause: the app was deleting GPS coordinates from local storage before confirming that trips had been created from them. If anything went wrong during trip creation - an API error, a crash, memory pressure from processing thousands of coordinates - the data was gone with no recovery. Coordinates now stay in local storage until all trips are confirmed saved.</p>

<p>A separate user subscribed to Pro via Apple In-App Purchase and was charged, but the app never activated their premium access. The cause: Apple sends a webhook notification when a purchase completes, and our server verifies it using Apple's root certificates. The certificate directory was missing from the server. Every webhook verification silently failed. The certificates are now in place and future purchases process immediately.</p>

<h2>Active Recording surfaces</h2>

<p>One thing kept coming up in feedback: people couldn't tell whether MileClear was actually recording. iOS sometimes silently suppresses Live Activities, and the Dynamic Island isn't enough on its own. Build 50 adds three layered surfaces so the answer is never ambiguous.</p>

<p>A new <strong>Active Recording screen</strong> is reachable from the Live Activity, the Dynamic Island, the persistent in-progress notification, or a new amber banner that appears at the top of the dashboard whenever a trip is being tracked. It shows live distance, duration, and a one-tap End Trip button.</p>

<p>A <strong>passive ongoing notification</strong> stays on your lock screen for the duration of every auto-detected trip. Tap it to view live stats, or to end the trip. It does not vanish if iOS reclaims memory the way Live Activities sometimes do.</p>

<p>And every <strong>push notification now deep-links to the right screen</strong> - tax-deadline reminders open Exports, unclassified-trip nudges open the trips list pre-filtered to unclassified, payment-failed alerts open Settings, stuck-recording alerts open the new Active Recording screen.</p>

<h2>Get it</h2>

<p>Version 1.0.10 (build 50) is live on <a href="https://testflight.apple.com/join/SGrmnaaH">TestFlight</a> today. The Self Assessment wizard and accountant sharing are already live on the <a href="/dashboard/self-assessment">web dashboard</a> if you want to try them now.</p>

<p>As always, feedback goes straight to us - use the feedback screen in the app or email <a href="mailto:support@mileclear.com">support@mileclear.com</a>.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "whats-new-in-version-1-0-8",
    title: "What's New in Version 1.0.8",
    excerpt:
      "Weekly earnings goals, a working calendar, business expenses, tax estimates, smarter notifications, and a deep fix for a rare bug that silently lost trips.",
    date: "13 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Version 1.0.8 is the biggest update since launch. It adds proper financial tools for work-mode drivers, daily notifications that actually tell you something useful, and a tracking reliability fix that came from debugging my own lost trip.</p>

<h2>Weekly earnings goal</h2>

<p>You can now set a weekly earnings target on the dashboard. A progress bar fills up as you log earnings throughout the week - amber as you approach your goal, green when you hit it. It resets every Monday.</p>

<p>This was one of the most requested features from beta testers. If you're driving to hit a number each week, you should be able to see where you stand without doing mental arithmetic.</p>

<h2>Working calendar</h2>

<p>A month-view heatmap showing which days you drove, how many trips you did, and how much you earned. Colour intensity is based on earnings, so your best days stand out at a glance.</p>

<p>Tap any day to see a breakdown. Useful for spotting patterns - maybe Saturdays are consistently your best days, or maybe you're driving six days a week when five would earn nearly as much.</p>

<h2>Business expenses</h2>

<p>You can now log allowable business expenses - parking, tolls, congestion charges, phone costs, equipment, cleaning, professional fees, and more. Each category is flagged as HMRC-allowable or not, so you know what counts.</p>

<p>Vehicle costs (maintenance, insurance, MOT, road tax) are tracked separately with a clear explanation: HMRC won't let you claim them alongside the mileage allowance. You can log them for your own records, but they won't appear in your deduction total.</p>

<h2>Tax estimate</h2>

<p>Based on your earnings, mileage deduction, and allowable expenses, MileClear now estimates your income tax and National Insurance liability. The breakdown shows each tax band, Class 2 NI, and Class 4 NI individually so you can see exactly how the number is calculated.</p>

<p>This is an estimate, not tax advice. But it gives you a rough idea of what to set aside each month so you're not surprised in January.</p>

<h2>Morning briefing</h2>

<p>A daily push notification at 8am summarising yesterday: how many trips, total miles, earnings, weekly goal progress, and how many trips are waiting to be classified. Personal-mode drivers get a simpler version without the earnings.</p>

<p>The idea is that you start each day knowing where you stand. If you have unclassified trips building up, the briefing nudges you. If you hit your weekly goal yesterday, it tells you.</p>

<h2>Fuel price alerts</h2>

<p>If you have saved locations, MileClear checks the cheapest fuel near them every day using the UK government's mandatory fuel pricing data - over 8,300 stations reporting live prices. If a station near your home or depot is significantly cheaper, you get a notification.</p>

<p>This uses the same gov.uk Fuel Finder API that powers the fuel prices screen in the app. The data is mandatory reporting since February 2026, so it covers virtually every station in the UK.</p>

<h2>Proactive tracking alerts</h2>

<p>This is new and important. If MileClear detects a problem with your tracking setup - your location permission was downgraded, the background task stopped running, or a recording got stuck - it now sends you a push notification explaining what happened and how to fix it.</p>

<p>Before this update, if iOS silently revoked your background location permission (which it does occasionally), your trips would just stop recording and you might not notice for days. Now you'll know within hours.</p>

<h2>Smarter trip notifications</h2>

<p>Trip notifications now include your daily running total. Instead of just "Trip recorded - 3.2 mi", you see "Trip 4 today, 18.7 mi total". It's a small thing, but it makes your day feel like it's building towards something.</p>

<p>There's also a red badge on your avatar and in the navigation menu showing how many unclassified trips you have. It clears as you work through them.</p>

<h2>The trip that disappeared</h2>

<p>The most important fix in this build came from a bug I hit myself. I drove somewhere, the app recorded 429 GPS coordinates over a 30-minute drive, and when I opened the app the trip was gone. No error message, no notification, nothing.</p>

<p>The diagnostics screen (which we added in 1.0.7) told me exactly what happened. When the app tried to save the trip, it needed to read the authentication token from iOS secure storage. But iOS blocked the keychain access - a security restriction that can happen when the app transitions from background to foreground. The error wasn't classified as a network failure, so the app treated it as an API rejection and deleted the local copy of the trip. 429 coordinates, gone.</p>

<p>The fix has two parts. First, the authentication token is now cached in memory so background trip saves never need to touch the iOS keychain at all. Second, if a trip can't sync because of a local device error (as opposed to the server rejecting it), the trip stays saved on your phone and retries later instead of being deleted.</p>

<p>This was a rare edge case - most of the time the keychain access works fine. But "rare" means it will eventually happen to someone, and losing a trip with no explanation is exactly the kind of thing that makes people stop trusting the app. It won't happen again.</p>

<h2>Other fixes</h2>

<ul>
<li>Fixed a bug where tapping the "Looks like you're driving" notification body could accidentally start a background recording that ran for hours. Tapping now confirms the trip without changing the tracking mode.</li>
<li>Trips that fail to save now log the exact error in the diagnostics screen. If a trip ever goes missing on this build, you'll be able to see why.</li>
<li>Each new recording starts with a clean GPS buffer, so stale coordinates from a previous trip can't bleed into the next one.</li>
</ul>

<h2>Get it now</h2>

<p>Version 1.0.8 is live on the App Store. Open the App Store, search MileClear, and tap Update - or it may have updated automatically if you have auto-updates on.</p>

<p>As always, feedback goes straight to us - use the feedback screen in the app or email <a href="mailto:support@mileclear.com">support@mileclear.com</a>.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "what-real-drivers-taught-me",
    title: "What Real Drivers Taught Me About Building a Mileage Tracker",
    excerpt:
      "Six weeks after launch, MileClear has a growing user base, thousands of miles tracked, and a long list of lessons I could not have learned any other way. Here is what real drivers showed me about what actually matters.",
    date: "13 April 2026",
    author: "Anthony Gair",
    category: "announcement",
    content: `
<p>MileClear launched on the App Store on 1 March 2026. Six weeks later, the user base is growing day by day and retention is improving week on week. Thousands of miles have been tracked, hundreds of trips recorded, and a growing number of drivers have upgraded to Pro.</p>

<p>But the numbers are not the point of this post. What matters is what real drivers have shown me about what actually works, what breaks, and what I got wrong. Every trip and every bug report has taught me something I could not have learned by testing on my own phone.</p>

<h2>People want their mileage tracked. That is it.</h2>

<p>The single biggest lesson from the first six weeks is that users care about one thing above everything else: did my trip record? If the answer is yes, they are happy. If the answer is no, nothing else matters. Not the achievements, not the fuel prices, not the weekly P&L. The trip has to be there.</p>

<p>I built MileClear with a lot of features. <a href="/features">Twelve feature cards</a> on the homepage. Shift mode, gamification, fuel prices, business insights, platform tagging, classification rules. But the feedback I get is almost entirely about trip accuracy. "My drive to the shops did not show up." "Only half my commute was saved." "It says I drove somewhere I did not go."</p>

<p>That told me something important about priorities. Every hour I spend on a new dashboard widget is an hour I am not spending on making the next trip record correctly. The features can wait. The detection engine cannot.</p>

<h2>Background location permission is harder than I expected</h2>

<p>MileClear needs "Always Allow" location permission to detect when you start driving. Without it, the app can only track trips when it is open on screen, which defeats the purpose of automatic tracking.</p>

<p>iOS makes this permission deliberately hard to grant. The system asks twice: first "While Using" then later promotes to "Always." Some users never see the second prompt. Others see it and tap "Keep Only While Using" because it sounds safer. A few have their phone set to never allow background location for any app.</p>

<p>The result is that a meaningful number of users have drive detection that simply does not work, and they do not know why. The <a href="/updates/case-of-the-phantom-trip">diagnostics screen I built in 1.0.7</a> shows the permission state, but users have to know to look at it. For 1.0.8 I need the app to surface this problem proactively instead of silently failing.</p>

<h2>The shift and business side is what matters</h2>

<p>I launched MileClear with both a work mode and a personal mode. Work mode is for gig drivers and self-employed people who need to track business miles for <a href="/faq">HMRC tax deductions</a>. Personal mode is for anyone who just wants to see how much they drive.</p>

<p>Most of my current users are using personal mode. But the users who stick around, the ones who open the app every day, are the ones using shifts. They clock on, do their deliveries, clock off, and check their scorecard. That daily loop is what keeps people coming back.</p>

<p>I am happy about this because the shift system is where the real value is. A personal driver might check their mileage once a week. A gig driver checks it every shift. And every shift they run surfaces another edge case I need to fix. The more people who use shifts, the better the app becomes for everyone.</p>

<h2>About 10 trips have been lost</h2>

<p>I want to be honest about this. Across all users and hundreds of tracked trips, roughly 10 trips have been lost due to bugs in the auto-detection engine. Each one is a drive that someone did, that the app detected, that started recording, and that then silently failed to save.</p>

<p>10 is not a lot in absolute terms. But if one of those 10 was your trip to an important meeting, or a delivery run you needed for your tax return, it is 100% of what matters to you. Every lost trip erodes trust. And trust is the only thing a mileage tracker sells.</p>

<p>The causes are documented in the engineering blog. A <a href="/updates/case-of-the-phantom-trip">geofence bug</a> that consumed the departure anchor. A silent exit in the trip-save code path that swallowed errors without logging them. A buffer that bled stale GPS coordinates from one recording into the next. Each one is fixed or being fixed in <a href="/updates">1.0.8</a>.</p>

<h2>Norman's Kingston Park drive</h2>

<p>One user, Norman, sent me a diagnostics dump that changed how I think about debugging. He drove from his home near Newcastle to Kingston Park, stayed for about 45 minutes, then drove home. The outbound trip did not save. The return trip saved but with the wrong start address.</p>

<p>From the outside, that looks like "the app lost my trip." From the inside, it was five separate bugs interacting. A stale finalize that exited silently. Buffer residue from a previous recording bleeding into the new one. A phantom classifier marking a real drive as indoor GPS drift. A stop-detection timer that did not fire. And timestamps stored in UTC that I was comparing against the user's recollection in BST, which cost me 20 minutes of debugging before I noticed the one-hour offset.</p>

<p>Norman did not know any of that. He just knew his trip was missing. But his diagnostics dump, combined with the <a href="/features">detection event log</a> and a database query against the production trips table, let me reconstruct exactly what happened at every millisecond. Without that tooling, I would still be guessing.</p>

<p>Norman's case is why 1.0.7 added the diagnostics screen and why 1.0.8 adds logging at every exit point in the finalize code path. The next time a trip is lost, the diagnostics will say exactly why.</p>

<h2>Silence is the default</h2>

<p>The biggest surprise of launching is how quiet users are. The vast majority have never sent feedback, reported a bug, or asked a question. The feedback screen in the app has a handful of entries. The support email gets almost nothing.</p>

<p>This is not a complaint. It is a reality of building consumer software. Most people do not report bugs. They just stop using the app. The ones who do report bugs are worth their weight in gold, because for every user who sends a diagnostics dump, there are probably five others who had the same issue and silently moved on.</p>

<p>That is why I built the admin dashboard to track drive detection health across all users. I can see diagnostic verdicts (healthy, warning, error) for every user who has uploaded a dump. I can see who has not driven in weeks. I can see who has background permission issues. I do not have to wait for someone to tell me something is wrong.</p>

<h2>The numbers that matter</h2>

<p>I am not going to share exact user counts. MileClear is early stage and the numbers are still small. What I will say is that the trends are in the right direction. New users are signing up every week without any paid advertising. Retention is improving with each build as detection gets more reliable. And the ratio of active users to total signups is healthy enough to tell me the core product works - people who try it keep using it.</p>

<p>The number I watch most closely is how many users are still tracking trips a month after signing up. That is the real test of whether the app delivers on its promise. If your trips record accurately and your tax deduction ticks up every week, you keep using it. If a trip goes missing, you stop trusting it and you leave. Everything I build is in service of that one metric.</p>

<p>Eight app updates have shipped since launch, from 1.0.0 to 1.0.8. That pace is not slowing down.</p>

<h2>What is next</h2>

<p>The immediate priority for 1.0.8 is trip detection reliability. Every lost trip is a broken promise. The silent finalize bug, the buffer residue bug, the stuck recording bug, and the accidental quick-trip bug are all fixed and shipping in the next build.</p>

<p>After that, the focus shifts to making the app smarter. <a href="/features">Predictive trip classification</a> that learns your schedule and pre-fills the right platform tag. A daily morning briefing notification with your yesterday's stats and weekly goal progress. Fuel price alerts when prices drop near your saved locations. Small things that make the app feel like it knows you.</p>

<p>And eventually, Android. The most common question I get is "is it on Android?" Not yet. But the API, the web dashboard, and the business logic are all platform-independent. The mobile app is the only iOS-specific part. It is on the roadmap.</p>

<p>If you are a driver in the UK and you want a mileage tracker that is built here, priced fairly, and actively improving every week, <a href="https://apps.apple.com/app/mileclear/id6759671005">MileClear is free on the App Store</a>. And if something does not work, tell me. I am listening even when it is quiet.</p>
`,
  },
  {
    slug: "case-of-the-phantom-trip",
    title: "The Case of the Phantom Trip",
    excerpt:
      "Users were reporting trips that never showed up. We built a diagnostics screen to catch the bug red-handed, and what came back was a 5-hour phantom recording caused by two separate geofence bugs we never saw coming.",
    date: "8 April 2026",
    author: "Gair",
    category: "engineering",
    content: `
<p>Last week a tester sent me a message: "only half of my trip was recorded." Then another: "my commute this morning is missing." Then I noticed my own Sunday afternoon drive to the golf club was not in my trip list either.</p>

<p>Three reports, same shape. Auto-detection was broken, and we could not see why from the outside. Time to build a debugger.</p>

<h2>Building the diagnostics screen</h2>

<p>The problem with background bugs on mobile is that by the time a user notices, the context is gone. The app has moved on, iOS has flushed its buffers, and all you have is a report like "I drove to X but nothing saved." You cannot rewind time. You cannot attach Xcode to someone's iPhone in Doncaster.</p>

<p>What you can do is build a log. Since 1.0.5 we have had an internal <code>detection_events</code> table that records every state transition the drive detection engine makes: recording started, skipped, finalized, stale, every one tagged with a reason. It has been sitting there collecting data for weeks. What we did not have was a way to see it without pulling the user's SQLite file via Xcode's device container download, which requires the phone to be plugged in and a matching Xcode release installed.</p>

<p>1.0.7 adds a Drive Detection Diagnostics screen under Profile > Settings. It shows the current state of every relevant piece of data (permissions, task running, active shift, auto-recording flag, buffered coordinates, cooldown) plus the last 50 detection events with plain-English explanations. Crucially, it adds a Share button that exports the whole thing as text you can paste into a message or email.</p>

<p>Within a couple of hours of the new build landing, I had a diagnostic dump from my own phone and one from James, one of our testers. What the logs told us was not what I expected.</p>

<h2>Pattern one: the phantom on the sofa</h2>

<p>The first bug was on my device. After getting home from a short drive at 16:15 and parking up, the app saved the trip cleanly. Three minutes later, while I was sitting on the sofa, the event log showed this:</p>

<pre><code>16:31:41  finalize_saved  (1.92 mi, 6m 53s)
16:34:21  recording_started  (force_start, anchor_exit)
... 54 minutes of nothing ...
17:28:11  finalize_no_coords</code></pre>

<p>The geofence around my home had fired an "exit" event at 16:34. I had not moved. It was pure indoor GPS drift: the iPhone's location estimate jittered past the 200 metre anchor boundary while I was sitting still, iOS concluded I must be leaving, and the app dutifully marked a recording as in progress. 54 minutes later the stale-recording timeout fired and cleaned it up. Fine.</p>

<p>Except that while the phantom recording was sitting there doing nothing, iOS Core Location considered the anchor geofence "consumed". A CLCircularRegion can only fire an exit event once per boundary crossing, and until the user re-enters the region, the OS will not fire another exit. I was still physically inside the region, but my location estimate had briefly flickered outside, fired the exit, then flickered back. The OS was now waiting for me to re-enter before it would consider firing another exit.</p>

<p>About an hour later I actually did leave home, drove to Washington Golf Club, played a round, and drove back. The return trip was recorded perfectly. The outbound leg was completely missing. That 101 minute window of driving had zero detection events. iOS never fired the anchor exit, so the app never woke up to start a recording.</p>

<p><strong>Pattern one: indoor drift fires a false exit that consumes the anchor geofence, and the real departure later goes silently untracked.</strong></p>

<h2>Pattern two was worse</h2>

<p>James's diagnostic dump arrived an hour after mine. He had a different, weirder problem. Reading his events in time order:</p>

<pre><code>10:35:20.178  finalize_called (21 coords)
10:35:20.558  finalize_saved  (6.97 mi, 20m 14s)
10:35:20.630  recording_started  (force_start, anchor_exit)
... 81 minutes of zero coordinates ...
11:56:12      finalize_no_coords</code></pre>

<p>Look at that third line. 72 milliseconds after the trip saved, a new recording started. That is not indoor drift. That is iOS firing an exit event the instant the geofence was registered.</p>

<p>Here is what was happening. When a trip finalizes, the app registers a new departure anchor at the end of the drive so the next trip can be detected instantly from a high-confidence "user has moved away from where they last parked" signal. It was doing this by passing the trip's final GPS coordinate as the anchor centre.</p>

<p>But the code that decides the final GPS coordinate trims off any trailing stationary readings. It is trying to find the "real" end of the drive, not a point 30 seconds into a car park. So the anchor was being registered at a coordinate from maybe 30 seconds before "now". By then James had usually rolled another 50 to 200 metres further into his parking spot. iOS takes the new region, asks "is the user currently inside it?", and answers "no, already 150 metres outside". It fires an exit event immediately, the app starts a phantom recording, and the whole 81 minute cycle begins. James had not moved an inch.</p>

<p>James had this happen twice on the same day. Between the two phantom cycles, 5 hours 24 minutes of drive detection was burned on empty recordings. Any real trip he tried to take during those windows was lost.</p>

<p><strong>Pattern two: registering the departure anchor at a stale trimmed coordinate causes an immediate false exit the moment the new geofence comes online.</strong></p>

<h2>The fix, in three layers</h2>

<p>1.0.7 ships three related fixes.</p>

<p><strong>First</strong>, the trip-finalize path now registers the departure anchor using the user's current position from <code>getLastKnownPositionAsync()</code> instead of the trimmed last coord. Current position is fresh at finalize time because the detection task was just processing a location batch a few seconds ago. Centered on where the phone actually is, the user is inside the new region. iOS does not fire an immediate exit. No more 72 millisecond phantom cycles.</p>

<p><strong>Second</strong>, if a phantom does somehow still fire (from indoor drift, say), the finalize bail-out branches now re-register the anchor at the current position before returning. Previously, a <code>finalize_no_coords</code> result would return early without touching the anchor, leaving iOS with a consumed geofence and no way to fire on the next real departure. Now every finalize path (save, too short, no coords) ends with a fresh anchor registration. iOS re-evaluates the user's position against the new region, finds them inside, and is ready to fire on the next real exit.</p>

<p><strong>Third</strong>, the geofence handler no longer deletes the anchor keys from local state the moment an exit fires. Previously it did, which meant any subsequent call to re-register geofences would forget about the anchor entirely. The keys now persist until explicitly replaced.</p>

<h2>A bonus fix from the same investigation</h2>

<p>While I was in the detection code I found something else. A defensive purge added earlier was supposed to protect against stuck recordings from crashes by dropping any coordinates older than 30 minutes from the buffer. Good intent, terrible implementation: on any drive longer than about 25 minutes, the first half of the trip's coordinates were older than 30 minutes by the time finalize ran, and the purge would wipe them out. A 45 minute commute would save as its last 20 minutes only. That is the "only half of my trip was recorded" report.</p>

<p>The fix: replace the blanket age-based purge with gap detection. Walk the buffer looking for large time gaps between consecutive coordinates. A real stuck state from a crash looks like "10 coordinates from a week ago, then 15 coordinates from today, no coordinates in between" - a massive gap. A legitimate 45 minute drive looks like "900 coordinates, each a few seconds apart, no gaps". Trim at the gap if there is one, keep the whole buffer otherwise. A 45 minute drive with no gaps saves as a 45 minute drive.</p>

<h2>What to expect</h2>

<p>If you install 1.0.7 and drive normally for a day or two, three things should be different:</p>

<ol>
<li>Long drives save the whole drive, not just the tail.</li>
<li>Your afternoon trips record properly even if you sat at home for a couple of hours first.</li>
<li>The Drive Detection Diagnostics screen in Profile > Settings will show zero phantom exits in a healthy week. If it ever shows some, send me the screenshot.</li>
</ol>

<h2>Thank you</h2>

<p>None of this would have been caught from my own device alone. What moved this bug from "something feels off" to "root cause, exact line numbers, three layered fixes" was two testers spending twenty minutes each taking screenshots of their diagnostic dumps and sending them over.</p>

<p>If you are on TestFlight and something feels wrong with auto-detection, please: Profile > Settings > Diagnostics, take a screenshot, send it in. The new screen is designed to be a one-glance bug report. The verdict banner tells you what MileClear thinks is wrong. The problems card lists everything suspicious with a plain-English explanation. Even if you cannot tell what it means, I can.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "your-odometer-was-right-fixing-auto-trip-distance",
    title: "Your Odometer Was Right: Fixing Auto Trip Distance in 1.0.6",
    excerpt:
      "Several testers told us their auto-tracked trips were reading short of the real distance. We dug into the code, found the bug, and 1.0.6 fixes it. Here is what was going wrong and what we changed.",
    date: "7 April 2026",
    author: "Gair",
    category: "engineering",
    content: `
<p>Over the past couple of weeks we have heard the same thing from multiple testers: "MileClear says I drove 10.4 miles but my odometer says 12." That is not a small discrepancy. If you are claiming HMRC mileage for self-employed work, under-reporting by 5-10% on every trip adds up to real money over a tax year.</p>

<p>We pulled the code apart, found the root cause, and shipped a fix in 1.0.6. Here is what was going wrong.</p>

<h2>Why GPS undercounts winding roads</h2>

<p>When MileClear records an auto trip, it gets a GPS point roughly every 50 metres. To calculate the total distance, the old code drew a straight line between each pair of consecutive points and added them all up.</p>

<p>This works fine on a dead straight road. But on a winding country lane or a route with lots of gentle curves, the straight line between two GPS points is shorter than the road you actually drove. Mathematicians call this the "chord versus arc" problem. Each little chord shaves a couple of metres off the real distance. Over a 10 mile drive down B-roads, those shavings can add up to half a mile lost.</p>

<p>The effect is worst on:</p>
<ul>
<li>Motorway exits, slip roads, and roundabouts</li>
<li>Country lanes with lots of bends</li>
<li>Hilly routes where samples cluster on flat sections</li>
</ul>

<p>Straight motorway driving was fine because the chords hugged the road. Dense city driving was fine because the samples were close together. But if you earn a living on the rural and suburban roads most gig workers and couriers see every day, you were losing miles.</p>

<h2>The fix: cross-checking against real road data</h2>

<p>Starting in 1.0.6, every auto-detected trip is now cross-checked against UK road data. For each trip we calculate two things: the GPS sum (what we were doing before) and the actual driving distance from start to end along real roads. Whichever is larger wins.</p>

<p>This gives you the best of both worlds:</p>

<ul>
<li>On a simple A to B trip on a winding road, the road data corrects the GPS undercount.</li>
<li>On a trip with detours or multiple stops, the GPS sum captures the full path you actually took.</li>
<li>If the road data lookup fails for any reason (no signal, server blip), we fall back to the GPS sum. Your trip is still saved and still accurate to within a few percent.</li>
</ul>

<p>In testing we saw trips that were previously reading 10-11% short now matching the odometer within 2-3%. For HMRC purposes that is the difference between a defensible mileage claim and one that looks suspiciously round.</p>

<h2>The other complaint: trips not starting at all</h2>

<p>Alongside the distance reports we kept hearing "sometimes my trips are not starting, or they are starting a quarter mile down the road." Separate bug, separate cause.</p>

<p>The old detection logic needed to see two consecutive bursts of driving-speed GPS readings before it would mark a trip as in progress. This was a safety measure to avoid false triggers from GPS drift and bad cold-start fixes. But it cost you the first 400 metres or so of every trip, because the app was still waiting for confirmation.</p>

<p>1.0.6 changes this in three ways:</p>

<ul>
<li><strong>Leaving a saved location is now a high-confidence trip start.</strong> If you save your home, work, or a regular depot in MileClear, the app starts recording the moment you cross the geofence boundary. No more waiting for a second confirmation.</li>
<li><strong>A single fast reading is enough.</strong> If the GPS reports 25 mph or faster with decent accuracy on one reading, we skip the two-burst gate entirely and start recording immediately. Nothing fakes highway speeds.</li>
<li><strong>Cold-start GPS is trusted sooner.</strong> When you pull out of a garage or a shaded driveway, your first location fix might have 60-75 metres of accuracy while the chip is still settling. Previously we ignored those readings. Now we trust them for speed detection purposes.</li>
</ul>

<p>The net effect is that the first mile of your trip is captured properly. If your commute goes straight onto a motorway, the motorway entry is in the trip, not the second junction.</p>

<h2>A few smaller fixes</h2>

<ul>
<li>If iOS downgrades your location permission (it happens, especially after iOS updates), the app now reminds you within 4 hours instead of waiting a full day. Permission issues were one of the stealthier reasons trips were going missing.</li>
<li>The Trip Complete screen now formats long trips as HH:MM:SS. A bug in the formatter meant a 2 hour trip was displaying as a runaway four-digit minute counter, which was confusing at best.</li>
<li>We added internal event logging across the entire auto-trip detection path. If you report a wrong or missing trip from 1.0.6 onwards, we can look at exactly what the detection engine was doing at that moment instead of guessing.</li>
</ul>

<h2>What we are still investigating</h2>

<p>We are not calling auto-trip detection "done". The next edge cases on our list:</p>

<ul>
<li>Stop-start residential driving where the app never sees a single high-speed reading.</li>
<li>Trips that begin inside underground car parks where GPS is blind for the first few minutes.</li>
<li>Very short errands (under half a mile) that we currently filter out, which a few users have asked to be logged anyway.</li>
</ul>

<p>If you hit any of these or anything else, please use the Feedback button in your profile. With the new diagnostics we can actually debug what happened, not just shrug.</p>

<h2>Thank you</h2>

<p>Half the job of shipping software is hearing about the problems. Every person who took the time to say "my trip was wrong" made this fix happen. Particularly to the testers who included rough times and locations, that is what lets us narrow things down fast. Thank you.</p>

<p>1.0.6 is rolling out to TestFlight now. It will hit the App Store after a few days of beta testing. If you are on TestFlight, please drive a familiar route and check the distance against your odometer. We want to know if we got it right.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "happy-easter-from-mileclear",
    title: "Happy Easter from MileClear",
    excerpt:
      "A quick thank you to our beta testers, a look at what we shipped this week, and a reminder about the new tax year starting tomorrow.",
    date: "5 April 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p>Happy Easter from the MileClear team. Whether you're on the road today, spending the weekend with family, or doing both - we hope you're having a good one.</p>

<h2>A quick thank you</h2>

<p>We launched MileClear just over a month ago and the feedback from our beta testers has been brilliant. Every bug report, feature suggestion, and "me too" vote directly shapes what gets built next. If you've taken the time to report something or share an idea, thank you - it genuinely makes a difference.</p>

<p>Speaking of which, you can now see our replies directly on your feedback in the app. We've also added a Known Issues section at the top of the feedback screen so you always know what bugs we're aware of and where we are with fixing them. If something affects you, tap "Me too" and we'll prioritise accordingly.</p>

<h2>What we shipped this week</h2>

<p>Version 1.0.4 went live on the App Store this week, and 1.0.5 is already in TestFlight. Here are the highlights:</p>

<ul>
<li><strong>Smarter trip detection</strong> - Multi-stop journeys now stay as one trip. Fuel stops, school drop-offs, and drive-throughs no longer split your route into fragments. We doubled the stop timeout and added GPS drift filtering so parked cars don't generate phantom mini-trips.</li>
<li><strong>Trip merging</strong> - If a trip does split, consecutive segments are automatically merged back together.</li>
<li><strong>Live Activity fixes</strong> - The timer no longer resets to zero when you switch apps, and tapping the lock screen widget now opens the app properly.</li>
<li><strong>Notification tap opens your trip</strong> - Tapping the "Are you driving?" notification now opens the live trip map showing your full route from the moment we detected you driving.</li>
</ul>

<h2>New tax year starts tomorrow</h2>

<p>The 2025-26 tax year ends today, 5 April. The new tax year begins tomorrow. If you haven't checked your mileage records for the year that's ending, now is the time. Open MileClear, check for any unclassified trips, and export your records while everything is fresh.</p>

<p>If you're starting fresh for 2026-27, you're in a great position. Every trip from tomorrow is a clean slate. Set up your vehicle, save your regular locations, and let MileClear learn your routes over the first few weeks. By the end of April, most of your trips will classify themselves.</p>

<p>HMRC rates for 2026-27 remain the same: 45p per mile for the first 10,000 business miles (cars and vans), 25p after that, and 24p flat for motorbikes.</p>

<p><em>Editor's note (May 2026): HMRC subsequently raised the first-tier car/van rate from 45p to 55p per mile for the 2026-27 tax year, effective from 6 April 2026. The 25p second-tier and 24p motorbike rates are unchanged. See our <a href="/hmrc-mileage-rates">HMRC mileage rates page</a> for the current figures.</em></p>

<h2>What's next</h2>

<p>We're working on business expense tracking so your weekly P&L shows real costs instead of estimates, receipt scanning for fuel and maintenance, and deeper analytics. More on all of that soon.</p>

<p>Enjoy the bank holiday. And if you are driving this weekend, at least your miles are being tracked.</p>

<p>- Gair</p>
    `.trim(),
  },
  {
    slug: "why-we-built-smart-classification",
    title: "Why We Built Smart Classification (And Why You'll Never Need to Swipe)",
    excerpt:
      "Most mileage apps make you classify every single trip manually. We think you shouldn't have to classify at all. Here's how MileClear learns your patterns and does it for you.",
    date: "28 March 2026",
    author: "Gair",
    category: "engineering",
    content: `
<p>Every mileage tracking app has the same problem: you drive somewhere, the app records the trip, and then you have to tell it whether it was business or personal. Every. Single. Time.</p>

<p>Some competitors solve this with a swipe gesture. Left for business, right for personal. It's satisfying the first few times. It's tedious by trip number fifty. And by trip number two hundred, most people stop doing it altogether. Their mileage log fills up with unclassified trips, their HMRC deduction is wrong, and the whole point of tracking is undermined.</p>

<p>We think the answer isn't a better swipe. It's no swipe at all.</p>

<h2>The insight: you already know</h2>

<p>Think about your driving for a second. If you're a Deliveroo rider, you probably drive the same route to the same area every shift. If you're an Uber driver, you leave from home, drive to a busy area, and come back. If you visit clients, you drive to the same offices on the same days.</p>

<p>Your driving is far more predictable than you think. And if a human can look at your trip history and say "obviously that's a work trip", so can software - it just needs enough context.</p>

<h2>Five signals, one answer</h2>

<p>MileClear's classification engine checks five things, in order, every time an auto-detected trip is recorded:</p>

<ol>
<li><strong>Were you on a shift?</strong> If you started a shift in MileClear and the trip happened during it, it's business. 100% confidence. No question.</li>
<li><strong>Do your classification rules match?</strong> You can set rules like "Monday to Friday, 6am to 2pm = business" or "any trip starting from my depot = business". If a rule matches, the trip is classified automatically.</li>
<li><strong>Has this route been classified before?</strong> If you've classified the same route (within 300 metres of the same start and end points) three times with the same answer, MileClear remembers. The fourth time, it's automatic.</li>
<li><strong>Is the trip near a saved location?</strong> If you've saved your workplace or depot as a location, trips starting or ending there get a suggested classification.</li>
<li><strong>Does it fall within your work schedule?</strong> If you've set up a work schedule, trips during those hours get a suggestion.</li>
</ol>

<p>The engine evaluates these from top to bottom and stops at the first confident match. Shifts and rules auto-classify immediately. Route learning auto-classifies after three confirmations. Saved locations and work schedules produce suggestions that you confirm with one tap.</p>

<h2>When it can't decide, you get buttons - not a form</h2>

<p>For trips where the engine isn't confident enough to auto-classify, we don't dump you into a classification screen. Instead, the "Trip recorded" notification on your lock screen gets two buttons: <strong>Business</strong> and <strong>Personal</strong>. Tap one. Done. You never opened the app.</p>

<p>And that tap isn't wasted - it feeds back into the route learning system. Classify that route three times from your lock screen, and the fourth time it's automatic.</p>

<h2>When you fall behind, batch classify</h2>

<p>Life happens. Maybe you ignored your notifications for a week and now you've got twenty unclassified trips. Competitors would make you swipe through each one individually.</p>

<p>MileClear groups your unclassified trips by route. If you drove the same route five times this week, they're grouped together with a header showing the route, the dates, and the total distance. Tap "Business (5)" and all five are classified in one go. The route is learned. You're caught up in seconds, not minutes.</p>

<h2>The goal: invisible classification</h2>

<p>The ideal mileage tracker is one where you never think about classification. You drive, the app records, and when tax time comes your trips are already sorted. That's what we're building towards.</p>

<p>Right now, the system gets smarter every time you classify a trip. After a few weeks of normal use, most regular routes are learned. Your work hours are set. Your saved locations are configured. The percentage of trips that need manual attention drops rapidly.</p>

<p>We're not there yet for every edge case. A trip to a new client, a one-off delivery to an unusual address, a personal errand in the middle of a work day - these still need a tap. But the everyday commute to the depot, the regular route to the sorting centre, the drive home after a shift - those should just work.</p>

<h2>Why this matters for your tax return</h2>

<p>The biggest risk with mileage tracking isn't that the GPS is inaccurate. It's that you stop classifying. An unclassified trip is a trip that doesn't count towards your HMRC deduction. If you drove 15,000 business miles but only classified 8,000 of them, you're leaving roughly 3,150 in unclaimed deductions on the table - that's over 600 in tax at the basic rate.</p>

<p>The classification UX isn't a nice-to-have. It's the difference between the app actually saving you money and the app being a GPS logger you forget about.</p>

<p>Try it out. Set up a classification rule, save your work location, and drive your normal routes for a week. You'll be surprised how quickly the inbox empties itself.</p>

<p>MileClear is free to download from the <a href="https://apps.apple.com/gb/app/mileclear-mileage-tracker-uk/id6759671005">App Store</a>.</p>
    `.trim(),
  },
  {
    slug: "tax-year-ends-5-april-mileage-checklist",
    title: "Tax Year Ends 5 April - Here's Your Mileage Checklist",
    excerpt:
      "The 2025-26 tax year ends on 5 April. Here's a quick checklist to make sure your mileage records are ready before the deadline.",
    date: "1 April 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>The 2025-26 UK tax year ends on 5 April. If you've been driving for work - whether that's Uber, Deliveroo, Amazon Flex, courier work, or any other self-employed driving - now is the time to get your mileage records in order.</p>

<p>You don't need to file your Self Assessment until January 2027, but the tax year boundary is what matters for your numbers. Any business miles driven after 5 April count towards next year's return, not this one.</p>

<p>Here's a quick checklist to make sure you're sorted.</p>

<h2>1. Check your trip classifications</h2>

<p>Open MileClear and go to your Trips tab. Filter by "Unclassified" - these are trips the app recorded but you haven't confirmed as business or personal yet. Go through them and classify each one. It only takes a tap per trip, but it makes a big difference to your deduction total.</p>

<p>If you're not sure whether a trip counts as business, the general rule is: if you were driving to earn money (heading to a pickup, driving between deliveries, going to a depot), it's business. Driving from home to your first job of the day is commuting and doesn't count - but once you're "on the clock", everything in between does.</p>

<h2>2. Check your vehicle details</h2>

<p>HMRC rates differ by vehicle type. Cars and vans get 45p/25p, motorbikes get 24p flat. Make sure your vehicle in MileClear is set to the right type - it affects every calculation.</p>

<p>If you changed vehicles during the year, make sure both are in the app and trips are assigned to the correct one.</p>

<h2>3. Fill in any gaps</h2>

<p>Did you do any business trips that MileClear didn't record? Maybe your phone was dead, or you hadn't installed the app yet at the start of the tax year. You can add manual trips with the date, start/end locations, and distance. MileClear will calculate the route distance for you if you enter the addresses.</p>

<p>It's better to add them now while you remember than to try and reconstruct them in January.</p>

<h2>4. Review your totals</h2>

<p>Go to your dashboard and check the tax year summary. You should see:</p>
<ul>
<li>Total business miles</li>
<li>Total personal miles</li>
<li>Your HMRC deduction amount</li>
</ul>

<p>Does the business mileage look about right for the year? If you drove 200 miles a week for work across 48 weeks, you'd expect roughly 9,600 business miles. If your number is wildly different, some trips might be misclassified or missing.</p>

<h2>5. Export your records</h2>

<p>Once everything looks right, export your records. MileClear Pro lets you download:</p>
<ul>
<li><strong>CSV</strong> - for your accountant or bookkeeping software</li>
<li><strong>PDF Trip Report</strong> - a detailed log of every trip with dates, times, routes, and distances</li>
<li><strong>HMRC Self Assessment PDF</strong> - a summary with your total deduction, broken down by vehicle and month</li>
</ul>

<p>Save these somewhere safe. If HMRC ever asks questions about your mileage claim, this is your evidence.</p>

<h2>The numbers that matter</h2>

<p>As a reminder, the HMRC mileage rates for 2025-26 are:</p>
<ul>
<li><strong>Cars and vans:</strong> 45p per mile (first 10,000 miles), 25p per mile (after 10,000)</li>
<li><strong>Motorbikes:</strong> 24p per mile (flat rate)</li>
</ul>

<p>These rates cover fuel, wear and tear, insurance, and servicing - you can't claim those separately if you're using the mileage allowance.</p>

<p><em>Editor's note (May 2026): HMRC raised the first-tier car/van rate from 45p to 55p per mile from 6 April 2026 for the 2026-27 tax year. The figures above are correct for any 2025-26 return; use 55p/25p for trips on or after 6 April 2026.</em></p>

<p>If you haven't been tracking your mileage yet, it's not too late to start for the new tax year beginning 6 April. Download MileClear, add your vehicle, and every trip gets recorded automatically from day one.</p>

<p>Get started free at <a href="https://mileclear.com">mileclear.com</a>.</p>
`,
  },
  {
    slug: "5-things-uber-drivers-should-track-for-tax",
    title: "5 Things Every Uber Driver Should Track for Tax (That Most Don't)",
    excerpt:
      "Most gig drivers know about mileage. But there are at least four other things you can claim that most people completely miss - and they add up fast.",
    date: "23 March 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>If you drive for Uber, Deliveroo, Amazon Flex, or any other gig platform in the UK, you're self-employed. That means you file a Self Assessment tax return, and you can deduct legitimate business expenses from your earnings before you pay tax on them.</p>

<p>Most drivers know about mileage. But there are at least four other things you can claim that most people completely miss - and they add up to hundreds of pounds a year.</p>

<h2>1. Mileage (obviously)</h2>

<p>This is the big one. HMRC lets you claim 45p per mile for the first 10,000 business miles in a tax year, then 25p per mile after that. If you're on a motorbike, it's 24p per mile flat.</p>

<p><em>Editor's note (May 2026): HMRC raised the first-tier car/van rate from 45p to 55p per mile from 6 April 2026 for the 2026-27 tax year. The worked example below uses the 45p rate that was current at time of writing - for trips on or after 6 April 2026 the same 12,000 miles is worth £6,000 in deductions (10,000 × 55p + 2,000 × 25p) and £1,200 back at basic rate.</em></p>

<p>Let's say you drive 12,000 business miles in a year. That's:</p>
<ul>
<li>10,000 miles x 45p = £4,500</li>
<li>2,000 miles x 25p = £500</li>
<li><strong>Total deduction: £5,000</strong></li>
</ul>

<p>That £5,000 comes off your taxable income. If you're a basic rate taxpayer (20%), that's £1,000 back in your pocket. And you don't need receipts - just a log of your business trips with dates, distances, and start/end points.</p>

<p>The catch? You need to actually track it. HMRC won't accept a guess. You need a proper mileage log, which is exactly what MileClear does automatically in the background.</p>

<h2>2. Your phone bill</h2>

<p>You can't do gig work without a phone. The Uber app, Google Maps, the Deliveroo rider app - they all run on your phone, and you're paying for that phone and the data it uses.</p>

<p>If you use your phone for both personal and business, you can claim the business proportion. A common approach is to estimate the split - if you reckon 60% of your phone usage is for work (maps, rider apps, customer calls), you can claim 60% of your monthly bill.</p>

<p>On a £30/month contract, that's £216 a year. Not huge on its own, but it adds up when you combine it with everything else.</p>

<h2>3. Car cleaning and valeting</h2>

<p>If you drive passengers (Uber, Bolt) or deliver food, keeping your car clean is a business expense. Regular car washes, interior valeting, air fresheners - all claimable as long as they're for the business vehicle.</p>

<p>Even if you're just doing deliveries, a monthly wash at £8 is nearly £100 a year. Keep the receipts or bank statements.</p>

<h2>4. Parking and tolls</h2>

<p>Any parking charges or road tolls you pay while working are fully deductible. The Dartford Crossing, congestion charges, parking at a collection point - all of it counts.</p>

<p>This one catches out a lot of drivers because parking charges feel like they're just part of driving. They are - but they're a deductible part. The key is keeping a record. A photo of the parking receipt or a note in your mileage log is enough.</p>

<p>Note: parking fines and speeding tickets are NOT deductible. HMRC draws the line at penalties.</p>

<h2>5. Equipment and accessories</h2>

<p>Phone mounts, charging cables, delivery bags, hi-vis vests, phone cases - anything you buy specifically for your gig work is a business expense. If you bought a thermal bag for Deliveroo deliveries, that's claimable. If you bought a phone mount so you can see Google Maps while driving, that's claimable too.</p>

<p>Some drivers also claim for dashcams on the basis that they protect them while working. This is a grey area - talk to an accountant if you want to be sure - but it's worth knowing about.</p>

<h2>The bottom line</h2>

<p>Most gig drivers only track mileage - if they track anything at all. But when you add up your phone bill, car cleaning, parking, and equipment, you could easily be looking at an extra £500-800 in deductions per year on top of your mileage.</p>

<p>At the 20% basic tax rate, that's £100-160 extra back from HMRC. Not life-changing, but not nothing either - especially when you're already doing the work.</p>

<p>The mileage is the biggest piece by far, and it's the one most people get wrong because they don't track it properly. MileClear handles that automatically - your phone records every business trip in the background, calculates the HMRC deduction, and gives you a ready-to-export report when Self Assessment time comes around.</p>

<p>Start tracking for free at <a href="https://mileclear.com">mileclear.com</a>, or download the app from the App Store.</p>
`,
  },
  {
    slug: "why-i-built-mileclear",
    title: "Why I Built MileClear",
    excerpt:
      "Most mileage apps are American, confusing, and way too expensive for someone doing a few Deliveroo shifts a week. I wanted something that actually made sense for UK drivers.",
    date: "15 March 2026",
    author: "Gair",
    category: "announcement",
    content: `
<p><em>Editor's note (May 2026): the AMAP rate referenced below was 45p per mile for the first 10,000 business miles at time of writing. HMRC raised it to 55p from 6 April 2026 for the 2026-27 tax year onwards.</em></p>

<p>I built MileClear because I couldn't find a mileage tracker that did what I actually needed.</p>

<p>A couple of years back, I was doing some delivery driving on the side  - nothing serious, a few Deliveroo and Amazon Flex shifts a week. I knew I could claim mileage back against my tax bill (45p per mile, first 10,000 miles  - it adds up faster than you'd think), but keeping a proper log was a nightmare. I tried the popular apps. Most of them were clearly designed for American users: they talked about "IRS rates" and "Schedule C", the UI looked like it hadn't been touched since 2018, and they wanted £8–12 a month for basic export functionality. For someone doing part-time gig work, that felt completely wrong.</p>

<h2>The UK gig worker gap</h2>

<p>What struck me was how specifically UK this problem is. Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD  - we have a huge population of self-employed drivers who are leaving real money on the table because they don't track their mileage properly. And HMRC is pretty generous about it: you don't need receipts, you don't need to justify anything. You just need a log of your business trips with dates, start and end points, and distances.</p>

<p>That's a solved problem, technically. GPS can do all of it automatically. But none of the existing apps were thinking about the UK gig worker specifically. There was no concept of "platforms"  - you couldn't tag a trip as an Uber job versus a personal run to the shops. There was no shift model that matched how gig work actually happens (you clock on, do several jobs, clock off  - that's a shift). And the pricing was just wrong for the market.</p>

<h2>What I wanted to build</h2>

<p>MileClear started as a notes file. My rough spec was:</p>

<ul>
  <li>Free trip tracking  - no artificial limits on the core feature</li>
  <li>Platform tags  - Uber, Deliveroo, Amazon Flex, etc., so you can see which platforms are worth your time</li>
  <li>Shift model  - clock on, do your jobs, clock off</li>
  <li>HMRC-native  - UK tax year (6 April boundary), pence not dollars, 45p/25p rates baked in</li>
  <li>Exports behind a paywall, but a cheap one  - £4.99/month felt right</li>
  <li>Offline first  - your GPS data shouldn't need an internet connection</li>
</ul>

<p>The gamification came later, and honestly it's one of my favourite parts of the app now. Streaks, achievements, personal records  - it sounds silly for a tax tool, but it actually works. Tracking mileage is one of those habits that's easy to forget about until it's too late (hello, January scramble). Having a streak to protect keeps you honest.</p>

<h2>The technical reality of building this solo</h2>

<p>Building a production iOS app solo is humbling. Background GPS tracking alone has about fifteen different failure modes across different iPhone models and iOS versions. Auto-trip detection  - where the app figures out you're driving without you tapping anything  - took months to get right. I'm still tuning it.</p>

<p>I made a deliberate choice to keep the stack boring: React Native with Expo, Fastify API, MySQL, no fancy infrastructure. Self-hosted on a cPanel server. The whole thing costs less than a coffee a month to run. That matters when you're bootstrapping something and you don't know if it's going to work.</p>

<h2>What's next</h2>

<p>MileClear is live on the App Store now, in early access. The core loop  - track trips, see your HMRC deduction, export when you need to  - works well. I'm adding an annual plan, improving the auto-trip detection, and listening carefully to what beta testers actually want before I build anything else.</p>

<p>If you're a UK driver of any kind  - gig worker, sole trader, employee who uses their personal car for work  - and you're not tracking your mileage, you're leaving money with HMRC that's legally yours. MileClear is free to try. Give it a go.</p>
    `.trim(),
  },
  {
    slug: "how-auto-trip-detection-works",
    title: "How Auto-Trip Detection Works",
    excerpt:
      "Getting an app to reliably know you're driving  - without draining your battery or triggering false positives on the sofa  - is harder than it sounds. Here's how MileClear does it.",
    date: "18 March 2026",
    author: "Gair",
    category: "engineering",
    content: `
<p>One of the trickiest problems in a mileage tracker is answering a deceptively simple question: "Is this person driving right now?"</p>

<p>Get it wrong one way and you're firing off notifications to someone sitting on their sofa watching TV. Get it wrong the other way and you're missing real trips, which is the entire point of the app. And all of this has to run on a phone that's trying to conserve battery, with iOS doing its best to kill background processes.</p>

<h2>The basic approach</h2>

<p>MileClear uses iOS's significant location change monitoring as the trigger. This is a low-power mode that wakes the app when the phone moves roughly 500 metres. The moment that happens, we check speed. If the phone is moving faster than about 15mph, we assume driving has started and begin recording coordinates at tighter intervals (100 metres).</p>

<p>Coordinates are buffered silently  - no notification, no UI, nothing. We're just collecting GPS breadcrumbs in the background.</p>

<h2>When does a trip end?</h2>

<p>This is where it gets more nuanced. We don't end a trip the moment you stop  - you might be at a red light, or queuing at a McDonald's drive-through, or briefly parked to drop off a package. Instead, we wait for five consecutive minutes of movement below 2.2mph (about walking pace).</p>

<p>Once that threshold is hit, we finalise the trip: calculate the distance, record the start and end times, save it to the local SQLite database, and mark it as "unclassified". It lands in your trip inbox waiting for you to tag it as business or personal.</p>

<h2>The Driver/Passenger problem</h2>

<p>Pure GPS detection can't tell the difference between you driving and you sitting in the back of an Uber. Both look identical from a location perspective: fast movement, then stopped.</p>

<p>The solution is a lock-screen notification. When MileClear detects a trip starting, it fires a notification with two action buttons: "Driver" and "Passenger". You can tap one without even unlocking your phone. If you're the passenger, the recording is cancelled and a 20-minute cooldown starts so you're not pestered again.</p>

<p>If you don't respond at all, the trip still gets recorded  - we'd rather have a false positive you can delete than miss a real business journey.</p>

<h2>GPS accuracy filtering</h2>

<p>Raw GPS is noisy. A phone sitting still on a desk will drift by 10–15 metres. When you're doing speed calculations from sequential coordinates, that drift can make a stationary phone look like it's moving at 5mph  - enough to cause false positives if you're not careful.</p>

<p>We filter out any location fix where iOS reports accuracy worse than 65 metres horizontal. We also require two consecutive readings above the speed threshold before registering movement. One blip doesn't start a trip.</p>

<h2>Quiet hours</h2>

<p>Nobody wants a phone notification at 2am because iOS decided to wake up the location service. Detection notifications are suppressed between 10pm and 7am. Trips still get recorded silently during those hours  - the quiet hours only affect the Driver/Passenger prompt.</p>

<h2>The battery reality</h2>

<p>Background GPS is the number one complaint in every mileage app review section. MileClear uses significant location changes (not continuous GPS) when not actively recording, which is very low power. Even during active recording, 100-metre intervals are much less aggressive than the 50-metre intervals used during manual shift tracking.</p>

<p>The honest answer is: it does use some battery. Any app that tracks your location uses battery. But "significant location change" monitoring adds maybe 2–5% battery drain per day in practice  - about the same as having Wi-Fi enabled. We're constantly tuning this.</p>

<h2>What doesn't work yet</h2>

<p>Train journeys are a known issue. A fast train exceeds the speed threshold and looks exactly like motorway driving from GPS. We're experimenting with CoreMotion activity recognition (the API that knows whether you're walking, cycling, or in a vehicle) to filter these out. It's not in the app yet, but it's coming.</p>

<p>If you spot a false positive, long-press the trip in your inbox and delete it. It takes two seconds and helps me understand where the thresholds need tuning.</p>
    `.trim(),
  },
  {
    slug: "hmrc-mileage-deduction-guide",
    title: "Understanding Your HMRC Mileage Deduction",
    excerpt:
      "If you drive for work in the UK  - whether that's gig work, visiting clients, or using your personal car for your employer  - you can claim up to 45p per mile back from HMRC. Here's exactly how it works.",
    date: "20 March 2026",
    author: "Gair",
    category: "guide",
    content: `
<p>The HMRC Approved Mileage Allowance Payment (AMAP) scheme is one of the most straightforward tax reliefs available to UK drivers  - but a surprising number of people who are entitled to it never claim it. This guide explains who qualifies, what the rates are, what counts as business mileage, and how to calculate your deduction.</p>

<p><em>Editor's note (May 2026): the figures below were the 2025-26 rates and correct at time of writing. HMRC raised the first-tier car/van rate from 45p to 55p per mile for the 2026-27 tax year, effective from 6 April 2026 - so for any trip on or after that date, use 55p (not 45p) on the first 10,000 business miles. The 25p second-tier rate, 24p motorbike rate and 20p bicycle rate are unchanged.</em></p>

<h2>The rates</h2>

<p>For the 2025–26 tax year, HMRC's approved mileage rates are:</p>

<ul>
  <li><strong>Cars and vans:</strong> 45p per mile for the first 10,000 business miles, 25p per mile after that</li>
  <li><strong>Motorcycles:</strong> 24p per mile (flat rate, no threshold)</li>
  <li><strong>Bicycles:</strong> 20p per mile</li>
</ul>

<p>These rates had been frozen since 2011 (until the 2026-27 rise to 55p), which was a mild annoyance given that fuel costs had roughly doubled since then  - but they're still a meaningful deduction, especially if you're putting in high mileage.</p>

<h2>What does "business mileage" actually mean?</h2>

<p>This is where a lot of people get confused. The key rule is that business mileage is travel you do in the course of your work  - it is <em>not</em> your commute.</p>

<p>For a typical employee: driving from your home to your regular office is commuting and you can't claim it. But driving from your office to visit a client, or from one work site to another, counts as business mileage.</p>

<p>For self-employed gig workers, the picture is simpler. If you're an Uber driver, Deliveroo rider, or Amazon Flex courier, <strong>every mile you drive during your working shift is business mileage</strong>  - including deadmiles (driving to pick up a delivery, for example). Your home is your base of operations, so journeys from home to your first job and from your last job home can also qualify.</p>

<h2>The 10,000-mile threshold</h2>

<p>The threshold applies per tax year, which in the UK runs from 6 April to 5 April. If you hit 10,000 business miles before 5 April, every mile after that is claimed at 25p instead of 45p.</p>

<p>At 45p per mile, 10,000 miles gives you a £4,500 deduction. That's real money. At 25p for the miles beyond that, each additional 1,000 miles is worth £250 off your tax bill.</p>

<h2>How does the deduction actually work?</h2>

<p>The mileage deduction reduces your taxable profit, not your tax bill directly. If you're a basic rate taxpayer (20%), a £4,500 mileage deduction reduces your tax bill by £900. If you're a higher rate taxpayer (40%), it's £1,800.</p>

<p>On your Self Assessment return, you enter your total business miles on the Self-employment pages. HMRC applies the approved rates automatically. You don't need to show your calculations  - you just need to have records if they ask.</p>

<h2>What records do you need to keep?</h2>

<p>HMRC doesn't prescribe a specific format, but your mileage log should include:</p>

<ul>
  <li>Date of each journey</li>
  <li>Start and end locations (postcodes are fine)</li>
  <li>Business purpose (e.g. "Uber shift", "client visit", "Amazon Flex route")</li>
  <li>Miles driven</li>
</ul>

<p>You need to keep these records for at least five years after the relevant tax return deadline. HMRC can ask to see them in an investigation, and a handwritten log in a notebook is perfectly acceptable  - though GPS evidence from an app like MileClear is considerably more convincing.</p>

<h2>Employees vs self-employed</h2>

<p>If you're an <strong>employee</strong> who uses their personal vehicle for work, your employer can pay you up to the AMAP rates tax-free. If your employer pays you less than the approved rate (or nothing), you can claim the difference as a <em>Mileage Allowance Relief</em> deduction  - same calculation, just a different box on your Self Assessment return.</p>

<p>If you're <strong>self-employed</strong>, you claim it as a business expense under the simplified expenses method (which is what the AMAP rates are). You can't also claim actual fuel costs and vehicle expenses separately  - it's one or the other. For most drivers, AMAP wins.</p>

<h2>How MileClear calculates it</h2>

<p>Every trip you classify as "business" in MileClear gets counted towards your annual total. The app tracks your cumulative business mileage per tax year across all your vehicles, applies the 45p rate until you hit 10,000 miles, then switches to 25p automatically. You can see your running deduction total on the Work dashboard at any time.</p>

<p>When you export at the end of the year, the PDF includes a vehicle-by-vehicle breakdown of your business miles, the deduction calculations, and the tax year totals  - everything you need for your Self Assessment return in one document.</p>

<h2>One more thing</h2>

<p>If you haven't been tracking your mileage but you do drive for work, it's worth going back and estimating what you might have been owed for previous tax years. You can amend a Self Assessment return up to four years after the original filing deadline. Just something worth knowing.</p>
    `.trim(),
  },
];

// ----------------------------------------------------------------
// Helper functions
// ----------------------------------------------------------------

export type Post =
  | { type: "blog"; post: BlogPost }
  | { type: "release"; note: ReleaseNote };

/** All blog posts, newest first (by array order). */
export function getAllBlogPosts(): BlogPost[] {
  return BLOG_POSTS;
}

/** A single blog post by slug, or undefined if not found. */
export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** All release notes (newest first by array order). */
export function getAllReleaseNotes(): ReleaseNote[] {
  return RELEASE_NOTES;
}

// ----------------------------------------------------------------
// Guides - evergreen reference pages, separate from time-sensitive Blog
// ----------------------------------------------------------------
export const GUIDES: Guide[] = [
  {
    slug: "hmrc-mileage-rates",
    title: "HMRC Mileage Rates for Cars and Vans",
    excerpt:
      "The 55p/25p approved rates (raised from 45p on 6 April 2026) with a worked example: 18,800 miles a year reaches a £7,700 tax deduction. Covers sole traders, employees, and limited company directors.",
    category: "tax",
    readTime: "5 min read",
  },
  {
    slug: "business-mileage-guide",
    title: "The UK Business Mileage Guide",
    excerpt:
      "Everything a UK driver needs to know about tracking business miles for tax. Why the fuel-AND-mileage double claim is the trap most drivers fall into, and how to keep a log HMRC will accept.",
    category: "tracking",
    readTime: "8 min read",
  },
  {
    slug: "what-counts-as-business-mileage",
    title: "What Counts as Business Mileage?",
    excerpt:
      "Eight real-world situations with plain answers: home-to-first-job, trips between sites, training, supplier runs, client lunches, charity volunteering, and the school-run detour.",
    category: "rules",
    readTime: "6 min read",
  },
];

export function getAllGuides(): Guide[] {
  return GUIDES;
}

export const GUIDE_CATEGORY_LABELS: Record<Guide["category"], string> = {
  tax: "Tax",
  tracking: "Tracking",
  rules: "Rules",
};

export const CATEGORY_LABELS: Record<BlogPost["category"], string> = {
  engineering: "Engineering",
  guide: "Guide",
  announcement: "Announcement",
};
