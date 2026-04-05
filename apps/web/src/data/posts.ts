// ================================================================
// MileClear  - Posts data: Release Notes + Blog
// Add new blog posts to the BLOG_POSTS array.
// Add new release notes to the RELEASE_NOTES array.
// ================================================================

export interface ReleaseNote {
  version: string;
  date: string;
  label?: "Latest" | "Major" | "Pending Review" | "App Store" | "In Testing";
  items: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: "engineering" | "guide" | "announcement";
  content: string; // full HTML string  - trusted, developer-authored
}

// ----------------------------------------------------------------
// Release Notes
// ----------------------------------------------------------------
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.0.5",
    date: "5 April 2026",
    label: "In Testing",
    items: [
      "Smarter trip detection - multi-stop journeys (fuel stops, school drop-offs, drive-throughs) now record as one continuous trip instead of splitting into fragments",
      "10-minute stop timeout - up from 5 minutes, so brief stops no longer end your trip prematurely",
      "GPS drift filtering - a new stop anchor system prevents phantom mini-trips from GPS wobble while parked",
      "Trip merging - if a trip does split, consecutive segments within 15 minutes and 500m are automatically merged",
      "Live Activity timer fix - the timer no longer resets to zero when switching between apps",
      "Notification tap opens live trip - tapping the driving notification now opens the trip map showing your full route from the detection point",
      "Live Activity lock screen tap - now correctly opens the app to the dashboard",
      "Trip filter fix - switching between Business, Personal, and Inbox no longer shows the wrong trips",
      "Sync stability - fixed a crash when saving trips that were already synced via background hydration",
    ],
  },
  {
    version: "1.0.4",
    date: "1 April 2026",
    label: "App Store",
    items: [
      "Admin feedback replies - admin can now reply directly to user suggestions and bug reports, with email notifications",
      "Known Issues section - pinned at the top of the feedback screen so you always know what bugs we're working on",
      "Me too voting - tap to let us know if a known issue affects you",
      "Web admin expansion - new Activity feed, Feedback management tab, push-to-user from user detail, feedback stats on overview",
      "Known issue status tracking - Investigating, Fix in Progress, and Fixed badges visible to all users",
    ],
  },
  {
    version: "1.0.3",
    date: "28 March 2026",
    label: "App Store",
    items: [
      "Smart classification  - MileClear now auto-classifies your trips using your saved locations, work schedule, and driving patterns. No more manually tagging every trip",
      "Route learning  - classify the same route 3 times and MileClear remembers. Future trips on that route are classified automatically",
      "Lock screen classification  - Business and Personal buttons appear right on the trip notification. Classify without opening the app",
      "Classification rules  - set up rules like 'Mon-Fri 6am-2pm = Business' or 'Trips from Depot = Business' in Profile > Classification Rules",
      "Inbox triage  - unclassified trips are grouped by route with dates. Tap 'Business (5)' to classify all trips on the same route with one tap",
      "Live Activities  - your trip or shift appears on the Dynamic Island and lock screen with a real-time timer, miles, and speed. Branded design with amber (work) or green (personal) accents",
      "Live Activity action buttons  - 'End Trip' and 'Not Driving' buttons on the lock screen widget. End a trip or dismiss a false detection without unlocking your phone",
      "Dynamic Island  - compact pill shows a car icon and timer, expanded view shows speed, miles, timer, and trip count",
      "Faster trip finalization  - auto-detected trips now appear in your inbox within about 6 minutes of parking, not 30+ minutes",
      "Bluetooth trip end  - if your car's Bluetooth disconnects (engine off), the trip finalizes in about 90 seconds instead of 5 minutes",
      "Navigation-grade GPS  - all trip recording now uses iOS's highest accuracy mode with sensor fusion and dead reckoning through tunnels",
      "Admin dashboard  - revenue metrics, user engagement, auto-trip health monitor, push notification sender, and email campaign tools",
    ],
  },
  {
    version: "1.0.2",
    date: "24 March 2026",
    items: [
      "Platform tag suggestions  - if your last 10 trips from a location were all Uber, the next one auto-suggests Uber",
      "Honest shift grades  - your A-F shift grades now factor in fuel and wear costs so you see real profit, not just gross earnings",
      "Tax savings on dashboard  - your running HMRC deduction total is now front and centre on the work dashboard for all users",
      "Help & Support section  - new section in your profile with direct email support, feedback, and FAQ links",
      "Contact Support in errors  - if something goes wrong, error messages now include a button to email support with context pre-filled",
      "3-day check-in email  - a personal email from Gair a few days after signup to make sure everything's working",
      "Feedback acknowledgement  - submitting feedback now sends a confirmation email so you know it was received",
      "Auto-detected trips now correctly show your vehicle in PDF and CSV exports",
      "Updates & Blog page added  - mileclear.com/updates",
    ],
  },
  {
    version: "1.0.1",
    date: "20 March 2026",
    items: [
      "Annual plan available  - save 25% with yearly billing",
      "Smarter trip detection  - Driver/Passenger notification buttons so you can confirm or dismiss without unlocking",
      "More accurate trip end times  - timestamps now reflect when you actually stopped driving, not when you tapped the app",
      "Improved sign-in reliability across iOS 18 and iOS 26 betas",
      "Expanded onboarding  - set your driving goals and notification preferences during setup",
      "Delete trips with a long-press  - tap to select, then delete",
      "Web dashboard: forgot password and email verification pages added",
    ],
  },
  {
    version: "1.0.0",
    date: "1 March 2026",
    items: [
      "Initial release  - MileClear is live on the App Store",
      "GPS trip tracking with background detection and an offline-first local database",
      "HMRC mileage deduction calculator (45p/25p car, 24p motorbike)",
      "Shift management for gig workers  - start a shift, group your trips, see your scorecard",
      "Fuel price finder covering 8,300+ UK stations from government-mandated feeds",
      "Gamification with 43 achievements, streaks, and personal records",
      "Apple Sign-In for one-tap iOS onboarding",
      "Stripe Checkout and Apple In-App Purchase billing for Pro",
    ],
  },
];

// ----------------------------------------------------------------
// Blog Posts
// ----------------------------------------------------------------
export const BLOG_POSTS: BlogPost[] = [
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

<h2>The rates</h2>

<p>For the 2025–26 tax year, HMRC's approved mileage rates are:</p>

<ul>
  <li><strong>Cars and vans:</strong> 45p per mile for the first 10,000 business miles, 25p per mile after that</li>
  <li><strong>Motorcycles:</strong> 24p per mile (flat rate, no threshold)</li>
  <li><strong>Bicycles:</strong> 20p per mile</li>
</ul>

<p>These rates have been frozen since 2011, which is a mild annoyance given that fuel costs have roughly doubled since then  - but they're still a meaningful deduction, especially if you're putting in high mileage.</p>

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

export const CATEGORY_LABELS: Record<BlogPost["category"], string> = {
  engineering: "Engineering",
  guide: "Guide",
  announcement: "Announcement",
};
