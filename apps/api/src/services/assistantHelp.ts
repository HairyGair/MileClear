/**
 * EmSee's "how does MileClear work" knowledge (Oct 2026).
 *
 * EmSee's data tools answer questions about a driver's own figures. This is
 * the other half: how to use the app, where things are, what is free or Pro,
 * and what to do when something goes wrong. The model reads it through the
 * `mileclear_help` tool, one area at a time, and is told never to describe a
 * screen, setting or feature that is not written here.
 *
 * Written for EmSee, not copied from the in-app Help screen
 * (apps/mobile/lib/help/topics.ts), because some of that copy is out of date.
 * Menu paths were checked against the app on 9 Oct 2026: tabs are Home, Trips,
 * Tax (Insights in Personal mode), More. When a screen moves, update it here
 * too; the tests check the wording rules and that every area has answers.
 *
 * Rules for the text: UK English, plain words, no em dashes, never an
 * adjective next to HMRC about MileClear ("HMRC-ready" and the like), never a
 * claim that MileClear files anything with HMRC, and no promises about
 * features that are not live.
 */

export const HELP_AREAS = [
  "getting_started",
  "recording_trips",
  "missing_or_wrong_trips",
  "managing_trips",
  "tax_and_claims",
  "money",
  "vehicles_and_places",
  "pro_and_billing",
  "account_and_app",
  "insights_and_alerts",
] as const;

export type HelpArea = (typeof HELP_AREAS)[number];

export interface HelpEntry {
  id: string;
  area: HelpArea;
  q: string;
  a: string;
}

export const HELP_AREA_LABELS: Record<HelpArea, string> = {
  getting_started: "What MileClear is, first steps, Work and Personal mode",
  recording_trips: "Automatic trips, Start Trip, shifts, pausing, battery, permissions",
  missing_or_wrong_trips: "A trip is missing, late, split, too long, or wasn't a real drive",
  managing_trips: "Classifying, adding a past trip, editing, merging, splitting, deleting, odometer readings",
  tax_and_claims: "Mileage rates, the Self Assessment wizard, exports, accountant access, tax estimate, payment plan, employees, MTD, mileage certificate",
  money: "Earnings, expenses, receipts, statements, bank import, invoices, fuel, fines",
  vehicles_and_places: "Vehicles, MOT and road tax reminders, saved places, work schedule",
  pro_and_billing: "What's free, what's Pro, price, cancelling, restoring, inviting friends",
  account_and_app: "Sign-in, email and password, deleting your account, your data, updates, the website, contacting the team, EmSee",
  insights_and_alerts: "Insights, recaps, achievements, streaks, notifications, fuel prices, road alerts",
};

export const HELP_ENTRIES: HelpEntry[] = [
  // ── Getting started ──────────────────────────────────────────────────────
  {
    id: "what-it-does",
    area: "getting_started",
    q: "What does MileClear do?",
    a: "MileClear records your drives, lets you mark each one Business or Personal, and works out your mileage claim at the approved mileage rates. It also keeps your earnings, expenses and fuel in one place and walks you through the self-employment pages of your Self Assessment. Recording trips is free with no monthly limit.",
  },
  {
    id: "first-steps",
    area: "getting_started",
    q: "I've just installed it. What should I do first?",
    a: "Add your vehicle (More > Vehicles), allow location \"Always\" and Motion & Fitness (Physical activity on Android) when asked, and allow notifications so you can sort trips from the lock screen. Then just drive: trips record by themselves. Saving Home and your depot under More > Saved places makes your trip list easier to read.",
  },
  {
    id: "work-personal-mode",
    area: "getting_started",
    q: "What's the difference between Work and Personal mode?",
    a: "Work mode shows your mileage claim, tax and business figures, with a Tax tab. Personal mode is for everyday driving, with an Insights tab instead of Tax (Tax is then under More). Switch at the top of Home. To stop work and tax reminders, choose \"Just me, not for work\" under You drive for (More > Settings > You drive for).",
  },
  {
    id: "you-drive-for",
    area: "getting_started",
    q: "What does \"You drive for\" in Settings do?",
    a: "It tells MileClear how you work, so you only get the right reminders and tax tools. Choose Deliveries or gig work, An employer in your own car, Gig work and an employer, A company car, or Just me, not for work. \"Just me\" stops tax and work reminders; pick another answer any time to switch them back on. It's in More > Settings > You drive for.",
  },
  {
    id: "settings-checks",
    area: "recording_trips",
    q: "What are the ticks at the top of Settings?",
    a: "They answer \"is MileClear working?\": whether trips are recording (the same line as on Home), your last trip, whether your phone lets MileClear send notifications, and whether all your trips are saved to your account. A red line says what's wrong and has a Fix or Retry button. Tap any line to see more.",
  },
  {
    id: "who-for",
    area: "getting_started",
    q: "Who is MileClear for?",
    a: "Self-employed and gig drivers (Uber, Deliveroo, Just Eat, Amazon Flex, Evri, DPD and others), employees who drive their own car for work, and anyone who wants to keep track of their own driving. Employees can set their employer's mileage rate in More > Settings > You drive for.",
  },
  {
    id: "android",
    area: "getting_started",
    q: "Is MileClear on Android?",
    a: "Yes, as a closed test on Google Play while it's finished off; mileclear.com/android explains how to join. Testers get Pro free while the test runs. iPhone has the full release on the App Store.",
  },

  // ── Recording trips ──────────────────────────────────────────────────────
  {
    id: "automatic-trips",
    area: "recording_trips",
    q: "How does MileClear know I'm driving?",
    a: "With Automatic trips on (More > Settings > Recording, also on Home), MileClear notices when you're moving at driving speed and records the trip by itself, then ends it when you stop. It needs location set to \"Always\" with Precise on, and Motion & Fitness (Physical activity on Android) allowed.",
  },
  {
    id: "start-trip",
    area: "recording_trips",
    q: "What is Start Trip?",
    a: "Start Trip on Home records one trip from the moment you tap it until you tap I've Arrived, then shows a summary for you to save. By default it saves by itself after 15 minutes parked. If you turn on \"Start Trip runs until I tap Arrived\" (More > Settings > Recording), waits and stops stay in the same trip.",
  },
  {
    id: "still-on-your-trip",
    area: "recording_trips",
    q: "What is the \"Still on your trip?\" notification?",
    a: "With \"Start Trip runs until I tap Arrived\" turned on, MileClear reminds you once you've been stopped for 10 minutes. Tap Arrived to save the trip up to where you stopped driving, or Keep going if you're still working. You get one reminder per stop, and it works without signal. It needs notifications allowed.",
  },
  {
    id: "shifts",
    area: "recording_trips",
    q: "What is a shift?",
    a: "Start Shift on Home groups every trip you make into one work session until you end it. When you end it you get a summary and a Shift Scorecard (a grade from A to F based on earnings per mile and per hour, miles between jobs and shift length). Shifts are free. Past shifts are under More > Shifts.",
  },
  {
    id: "pause-recording",
    area: "recording_trips",
    q: "Can I pause recording?",
    a: "Yes. Tap \"Pause recording\" under the Start Trip buttons on Home and pick how long. It switches back on by itself when the pause ends, and while paused Home shows a warning with a Resume button. Trips you drive while paused are not recorded, but you can add them by hand.",
  },
  {
    id: "turn-off-automatic",
    area: "recording_trips",
    q: "How do I stop it recording every drive?",
    a: "Turn off Automatic trips in More > Settings > Recording (the switch is also on Home). You can still use Start Trip or Start Shift, or add trips by hand. Personal trips are never claimed, so leaving them recorded does no harm.",
  },
  {
    id: "battery",
    area: "recording_trips",
    q: "Does it drain my battery?",
    a: "MileClear uses about 2 to 4% of battery over an 8-hour shift. \"Save battery when it's low\" (More > Settings > Recording) eases off when the battery is low and you're not plugged in, without dropping trips. Low Power Mode on iPhone can delay or miss trips, so leave it off while you work if you can.",
  },
  {
    id: "journey-end",
    area: "recording_trips",
    q: "How long does a stop have to be before a new trip starts?",
    a: "Set it under More > Settings > Recording > End a trip after. Stops shorter than that stay in one trip; longer ones split it into two. The default is 30 minutes.",
  },
  {
    id: "live-activity",
    area: "recording_trips",
    q: "What is the box on my lock screen while I drive?",
    a: "That's the Live Activity on iPhone, showing the trip as it records. If it doesn't show, check iPhone Settings > MileClear > Live Activities is on. You can switch it off in More > Settings > Notifications (\"Show a trip on your lock screen\").",
  },
  {
    id: "permissions",
    area: "recording_trips",
    q: "Which permissions does MileClear need?",
    a: "Location \"Always\" with Precise Location on, Motion & Fitness (Physical activity on Android), and notifications. Without \"Always\" it can only record while the app is open. More > Settings > Recording > Check recording in detail shows what is set and what needs fixing.",
  },
  {
    id: "offline",
    area: "recording_trips",
    q: "Does it work without signal?",
    a: "Yes. Trips, earnings, expenses and fuel are saved on your phone first and upload when you're back online. Settings opens with a check that says whether all your trips are saved to your account, and tapping it shows anything still waiting.",
  },

  // ── Missing or wrong trips ────────────────────────────────────────────────
  {
    id: "missing-trip",
    area: "missing_or_wrong_trips",
    q: "A trip is missing. What do I do?",
    a: "First check the Trips tab, including the Inbox and \"Journeys to check\", because some trips arrive late. If it isn't there, tap \"Missing a trip you made?\" at the top of the Trips tab to tell us, or add it with Add a past trip. Then check the usual causes: location not set to \"Always\", Precise Location off, Low Power Mode, recording paused, Automatic trips off, or the app swiped away. More > Settings > Recording > Check recording in detail shows what to fix.",
  },
  {
    id: "late-trip",
    area: "missing_or_wrong_trips",
    q: "Why did a trip appear hours after I drove?",
    a: "Your phone sometimes stops MileClear in the background before it finishes saving a trip. The trip is kept on the phone and saved the next time MileClear gets a chance to run, often when you open the app. Opening MileClear for a few seconds at the end of a shift helps.",
  },
  {
    id: "split-trip",
    area: "missing_or_wrong_trips",
    q: "One journey was split into two trips.",
    a: "A long stop, such as a wait at a pickup, ends one trip and starts another. You can merge them: open one of the trips and use More, or long-press it in the Trips list. To keep waits in one trip in future, make the stop length longer under More > Settings > Recording > End a trip after, or use Start Trip with \"Start Trip runs until I tap Arrived\" on.",
  },
  {
    id: "wrong-distance",
    area: "missing_or_wrong_trips",
    q: "A trip's distance looks wrong.",
    a: "Open the trip, tap More, then Recalculate distance to re-measure it along the roads. You can also edit the trip and type the distance. The confidence badge on a trip tells you how sure MileClear is about the distance; tap it for the reasons.",
  },
  {
    id: "phantom-trip",
    area: "missing_or_wrong_trips",
    q: "A trip was recorded that I didn't make.",
    a: "GPS drift indoors, or a trip that didn't end cleanly, can do this. Open the trip, tap More, then Delete trip. If it keeps happening, tap \"Missing a trip you made?\" or use More > Feedback > Report a problem so the team can look at your phone's details.",
  },
  {
    id: "passenger",
    area: "missing_or_wrong_trips",
    q: "It recorded a trip when I was a passenger or on a bus or train.",
    a: "Mark it Personal so it never counts towards your claim, or delete it (open the trip, More, Delete trip). Personal trips are never included in your mileage claim or exports of business trips.",
  },
  {
    id: "trip-not-ending",
    area: "missing_or_wrong_trips",
    q: "A trip is still recording after I've stopped.",
    a: "Open MileClear: an automatic trip finishes once the app sees you've stopped. For a Start Trip, tap I've Arrived. If it still won't end, use More > Feedback > Report a problem.",
  },
  {
    id: "web-missing",
    area: "missing_or_wrong_trips",
    q: "My trips aren't showing on the website.",
    a: "Trips upload when your phone is online. Open Settings on your phone: if anything failed to upload, the \"All trips saved\" line turns red. Tap it and tap Retry. Make sure you're signed in to the same account on the website.",
  },

  // ── Managing trips ───────────────────────────────────────────────────────
  {
    id: "classify",
    area: "managing_trips",
    q: "How do I mark trips as Business or Personal?",
    a: "Open the Trips tab; trips to sort are at the top with Business and Personal buttons. You can also open a trip and tap Business or Personal, or use the buttons on the notification after a trip. Only Business trips count towards your mileage claim.",
  },
  {
    id: "what-is-business",
    area: "managing_trips",
    q: "Which trips count as business?",
    a: "Generally, driving to do paid work counts: between jobs, pickups and drops, and to a temporary place of work. Ordinary commuting from home to a permanent workplace usually doesn't. This is general guidance, not personal tax advice; ask an accountant if you're unsure.",
  },
  {
    id: "add-past-trip",
    area: "managing_trips",
    q: "How do I add a trip I forgot to record?",
    a: "Tap Add a past trip on Home or the Trips tab. Enter where you started and finished (or pick them on the map), the date and time, and Business or Personal. MileClear works out the distance along the roads.",
  },
  {
    id: "edit-trip",
    area: "managing_trips",
    q: "How do I edit a trip?",
    a: "Open the trip and tap Edit trip to change the places, times, distance, platform, notes or classification. More on the trip has split, merge, recalculate distance, odometer readings, saving a place and delete.",
  },
  {
    id: "merge-trips",
    area: "managing_trips",
    q: "How do I merge two trips?",
    a: "Open one of the trips and tap More, or long-press it in the Trips list, and choose to merge it with the other trip. Check before you confirm, because merging can't be undone.",
  },
  {
    id: "split-a-trip",
    area: "managing_trips",
    q: "How do I split a trip?",
    a: "Open the trip, tap More, then Split into several trips, and choose the stops to split at.",
  },
  {
    id: "delete-trip",
    area: "managing_trips",
    q: "How do I delete a trip?",
    a: "Open the trip, tap More, then Delete trip. Deleting can't be undone, so if a trip is just personal, mark it Personal instead.",
  },
  {
    id: "platform-tag",
    area: "managing_trips",
    q: "How do I say which platform a trip was for?",
    a: "Open the trip and tap Edit trip, then choose the platform (Uber, Deliveroo, Amazon Flex and so on). MileClear learns your regular journeys and suggests the platform and classification next time.",
  },
  {
    id: "projects",
    area: "managing_trips",
    q: "Can I label trips by client or project?",
    a: "Yes. Add a project or client name when you edit a trip, earning or expense. The Trips tab has \"Miles by project\" to total your business miles per project.",
  },
  {
    id: "odometer",
    area: "managing_trips",
    q: "Can MileClear keep an odometer reading?",
    a: "Yes. Enter a reading in More > Odometer log and MileClear adds your recorded miles to it, giving a start and end reading for each day you drive. You can also add readings to a single trip (open it, More, Add odometer readings). The log is free; the odometer CSV download is Pro.",
  },
  {
    id: "auto-classify",
    area: "managing_trips",
    q: "Can trips be classified automatically?",
    a: "MileClear suggests Business or Personal for journeys you repeat. \"Sort trips automatically\" (More > Settings > Recording) marks trips by your working hours, saved places or time of day without asking. Set your hours in More > Work hours (or Settings > Work hours).",
  },

  // ── Tax and claims ───────────────────────────────────────────────────────
  {
    id: "rates",
    area: "tax_and_claims",
    q: "What mileage rates does MileClear use?",
    a: "Cars and vans: 55p a mile for the first 10,000 business miles in a tax year and 25p after that, for trips from 6 April 2026. Trips before then use 45p and 25p. Motorbikes: 24p a mile. MileClear uses the rate for the date of each trip, and cars and vans share one 10,000-mile count.",
  },
  {
    id: "claim-meaning",
    area: "tax_and_claims",
    q: "What is my mileage claim?",
    a: "Your business miles multiplied by the approved rates. If you're self-employed it's an allowable expense that comes off your profit, so you pay less tax; it isn't money paid to you. It covers fuel, insurance, servicing and wear, so you can't also claim those running costs for the same vehicle.",
  },
  {
    id: "sa-wizard",
    area: "tax_and_claims",
    q: "How does the Self Assessment wizard work?",
    a: "Tax > Self Assessment (in Personal mode, More > Tax) walks you through the self-employment pages box by box, showing the figure from your records and where it goes on your return. The wizard is free; the print-ready PDF is Pro. MileClear does not file your return; you or your accountant do that.",
  },
  {
    id: "exports",
    area: "tax_and_claims",
    q: "How do I export my mileage for my accountant?",
    a: "Tax > Tax exports gives you a CSV or PDF trip log and the Self Assessment PDF for any tax year. Exports are Pro. You can also give your accountant read-only access with Pro (Tax > Your accountant, set up on mileclear.com).",
  },
  {
    id: "accountant-access",
    area: "tax_and_claims",
    q: "Can my accountant see my records?",
    a: "Yes, with Pro. Sign in at mileclear.com, open Your accountant on the Tax page and enter their email. They get read-only access to your mileage and tax figures without your password, and you can stop it at any time. In the app, Tax > Your accountant takes you there.",
  },
  {
    id: "tax-estimate",
    area: "tax_and_claims",
    q: "How is the tax estimate worked out?",
    a: "From your recorded earnings, minus your mileage claim and allowable expenses, giving your profit. MileClear applies the current personal allowance, income tax bands and Class 4 National Insurance, and takes your other income into account if you've entered it in More > Settings > You drive for. It's only as good as what you've recorded, and it's an estimate, not a bill.",
  },
  {
    id: "payment-plan",
    area: "tax_and_claims",
    q: "When do I have to pay my tax?",
    a: "Tax > Tax payment plan shows what to pay and when, including payments on account on 31 January and 31 July, and can remind you beforehand. It's free. The Self Assessment deadline for filing online and paying is 31 January after the tax year ends.",
  },
  {
    id: "first-return",
    area: "tax_and_claims",
    q: "It's my first Self Assessment. Where do I start?",
    a: "Tax > First Self Assessment? is a plain guide covering registering, your UTR, the tax year (6 April to 5 April), what you pay and the 31 January deadline. Tax > Ready for 31 January? is a checklist before you file.",
  },
  {
    id: "employee",
    area: "tax_and_claims",
    q: "I'm an employee and my employer pays me per mile.",
    a: "Set your work type and your employer's rate in More > Settings > You drive for. If your employer pays less than the approved rates, Tax > Mileage Allowance Relief works out the difference you can claim back from HMRC. It's free.",
  },
  {
    id: "other-income",
    area: "tax_and_claims",
    q: "I have a job as well as driving.",
    a: "Enter your other income, or the tax already taken through PAYE, in More > Settings > You drive for. The tax estimate then shows only the extra tax your driving profit adds.",
  },
  {
    id: "hmrc-check",
    area: "tax_and_claims",
    q: "Can I compare my figures with what platforms told HMRC?",
    a: "Yes. Tax > Check against HMRC's figures lets you enter what each platform reported and shows the differences next to what you recorded in MileClear.",
  },
  {
    id: "certificate",
    area: "tax_and_claims",
    q: "Can I prove my mileage to an insurer or employer?",
    a: "With Pro, Tax > Mileage certificate makes a PDF of the miles you recorded for a period, with a link anyone can use to check it at mileclear.com/verify.",
  },
  {
    id: "hmrc-approved",
    area: "tax_and_claims",
    q: "Is MileClear approved by HMRC?",
    a: "No. HMRC doesn't approve or endorse mileage apps, and MileClear isn't endorsed by HMRC. MileClear uses HMRC's approved mileage rates and keeps a record of each business trip (date, distance, start and end), which is the kind of record HMRC asks you to keep. You or your accountant are responsible for your tax return.",
  },
  {
    id: "mtd",
    area: "tax_and_claims",
    q: "Does MileClear do Making Tax Digital?",
    a: "Quarterly updates for Making Tax Digital are being tested on HMRC's test service only. MileClear can't send anything to HMRC for real yet, so keep filing your Self Assessment as normal.",
  },
  {
    id: "tax-year",
    area: "tax_and_claims",
    q: "When does the tax year start and end?",
    a: "The UK tax year runs from 6 April to 5 April. MileClear groups your figures and exports by tax year.",
  },

  // ── Money ────────────────────────────────────────────────────────────────
  {
    id: "earnings",
    area: "money",
    q: "How do I add my earnings?",
    a: "More > Earnings > add an earning, with the platform, amount and dates. With Pro you can also Snap a statement (read the total from a platform screenshot), import a platform CSV, or link your bank to bring earnings in.",
  },
  {
    id: "expenses",
    area: "money",
    q: "How do I add an expense?",
    a: "More > Expenses. Add it by hand or scan a receipt with your camera; the receipt is read on your phone. Parking, tolls, congestion and clean air zone charges can be claimed on top of the mileage rate. Fuel, insurance and repairs can't be, if you claim mileage for that vehicle.",
  },
  {
    id: "snap-statement",
    area: "money",
    q: "What is Snap a statement?",
    a: "A Pro feature that reads the total and dates from a screenshot of your Uber, Deliveroo, Just Eat, Amazon Flex or other earnings screen. You check it before it's saved. It's on the Earnings screen.",
  },
  {
    id: "csv-import",
    area: "money",
    q: "Can I import my earnings from a platform CSV?",
    a: "Yes, with Pro, from the Earnings screen. MileClear reads the earnings file from your platform and skips anything you've already added.",
  },
  {
    id: "bank",
    area: "money",
    q: "Can MileClear read my bank account?",
    a: "With Pro, More > Link a bank connects your bank read-only through Open Banking. Payments from known platforms come in as earnings, and everything else waits in More > Bank inbox for you to mark as an earning, an expense or ignore. MileClear can't move money, and you can disconnect at any time.",
  },
  {
    id: "invoices",
    area: "money",
    q: "Can I send invoices?",
    a: "Yes, from More > Invoices. The free plan covers 3 invoices a month; Pro removes the limit and adds branded PDFs, emailing the client and payment reminders. Set your logo and bank details under Invoice details at the top of More > Invoices.",
  },
  {
    id: "fuel",
    area: "money",
    q: "Should I log fuel?",
    a: "It's optional. Logging fill-ups in More > Fuel shows your real running costs and fuel economy. It doesn't change your mileage claim, because the mileage rate already covers fuel. The Fuel screen also shows prices at stations near you.",
  },
  {
    id: "ticket-defender",
    area: "money",
    q: "I got a parking or speeding fine. Can MileClear help?",
    a: "With Pro, More > Ticket defender shows where MileClear recorded your phone at the time on the notice, how fast and how accurately, as a PDF you can send with an appeal. It can only show what was recorded; it can't promise an appeal will succeed.",
  },
  {
    id: "caz",
    area: "money",
    q: "Does MileClear tell me about clean air zone charges?",
    a: "If a recorded trip goes through a Clean Air Zone or ULEZ, the trip shows it and you can log the charge as an expense. Pay-by reminders the evening before a charge is due can be turned on in More > Settings > Notifications.",
  },

  // ── Vehicles and places ──────────────────────────────────────────────────
  {
    id: "add-vehicle",
    area: "vehicles_and_places",
    q: "How do I add a vehicle?",
    a: "More > Vehicles > add, then enter your registration to fill in the make, model and fuel from the DVLA. Set whether it's a car, van or motorbike, because that sets the mileage rate. The free plan has 1 vehicle; Pro has as many as you need.",
  },
  {
    id: "mot-reminders",
    area: "vehicles_and_places",
    q: "Does MileClear remind me about MOT and road tax?",
    a: "Yes, for a vehicle added by registration: you get a notification before the MOT or road tax runs out. You can see the vehicle's MOT history from More > Vehicles. Both are free.",
  },
  {
    id: "saved-places",
    area: "vehicles_and_places",
    q: "What are saved places?",
    a: "Places like Home or your depot, saved in More > Saved places. Trips show the name instead of an address, and MileClear ignores GPS drift while you're there. The free plan has 2 saved places; Pro has as many as you need. MileClear also suggests places you visit often.",
  },
  {
    id: "work-schedule",
    area: "vehicles_and_places",
    q: "What is the work schedule?",
    a: "More > Work hours (also in Settings) is where you set your working days and hours. It's free. With Pro, \"Sort trips automatically\" can use it to mark trips in your working hours as Business, and it can switch you to Work mode while you're working.",
  },

  // ── Pro and billing ──────────────────────────────────────────────────────
  {
    id: "free-vs-pro",
    area: "pro_and_billing",
    q: "What is free and what is Pro?",
    a: "Free: unlimited trip recording, classifying, shifts and scorecards, earnings and expenses by hand, receipt scanning, fuel, the Self Assessment wizard, the tax estimate and payment plan, Mileage Allowance Relief, the odometer log, achievements and recaps, 1 vehicle and 2 saved places. Pro adds: the Self Assessment PDF, CSV and PDF exports, the mileage certificate, Snap a statement, CSV import, bank import and inbox, unlimited invoices, Ticket defender, business insights and driving analytics, classification rules, the journey map, accountant access, EmSee, and unlimited vehicles and saved places.",
  },
  {
    id: "price",
    area: "pro_and_billing",
    q: "How much is Pro?",
    a: "£4.99 a month. On iPhone there's also a yearly plan at £44.99. Pro never limits how many trips are recorded; that's always free.",
  },
  {
    id: "cancel",
    area: "pro_and_billing",
    q: "How do I cancel Pro?",
    a: "If you subscribed on iPhone, cancel in iPhone Settings > your name > Subscriptions. On Android, use Google Play > Payments & subscriptions. If you paid by card on the website, cancel from More > Settings > Your plan in the app, or Settings at mileclear.com. Pro stays on until the end of the period you've paid for, and your records stay as they are.",
  },
  {
    id: "restore",
    area: "pro_and_billing",
    q: "I paid but Pro isn't unlocked.",
    a: "Open Settings (tap your picture on Home), then Your plan > Restore purchase, signed in with the same Apple ID you paid with. Check you're signed in to the MileClear account you subscribed on. If it still isn't unlocked, use More > Feedback > Report a problem or email support@mileclear.com.",
  },
  {
    id: "refer",
    area: "pro_and_billing",
    q: "Can I get Pro free?",
    a: "Invite friends from More > Invite a friend, get Pro free. When a friend joins with your link and records their first trip, you both get a free month of Pro, up to 3 months for you. The trip has to be recorded, not typed in by hand.",
  },
  {
    id: "team-pro",
    area: "pro_and_billing",
    q: "My employer or manager uses MileClear. Do I get Pro?",
    a: "If you join your employer's team through the invite link they send you, Pro can come with the team while you're a member, depending on your employer's plan. If you think it should be on and isn't, ask your manager or use More > Feedback > Report a problem.",
  },

  // ── Account and app ──────────────────────────────────────────────────────
  {
    id: "sign-in",
    area: "account_and_app",
    q: "I signed in and my account is empty.",
    a: "You've probably signed in a different way from when you joined, which creates a new empty account. Sign out and sign in the way you first did: with Apple, or with your email and password. If that doesn't fix it, email support@mileclear.com.",
  },
  {
    id: "change-email",
    area: "account_and_app",
    q: "How do I change my email or password?",
    a: "More > Settings > Your account has Email and Change password. When you change your email, MileClear sends a code to the new address to confirm it.",
  },
  {
    id: "delete-account",
    area: "account_and_app",
    q: "How do I delete my account?",
    a: "Open Settings (tap your picture on Home), then Your account > Delete account. It removes your account and records permanently. Cancel any App Store or Google Play subscription separately. To keep your records first, download them (More > Settings > Downloads).",
  },
  {
    id: "my-data",
    area: "account_and_app",
    q: "Can I download all my data?",
    a: "Yes, free: More > Settings > Your data > Get a copy of your data has everything MileClear holds about you. For tax, use Tax > Tax exports instead (Pro).",
  },
  {
    id: "website",
    area: "account_and_app",
    q: "Is there a website version?",
    a: "Yes. Sign in at mileclear.com with the same account to see and edit your trips, earnings, expenses, vehicles and tax figures on a bigger screen. Recording trips needs the phone app.",
  },
  {
    id: "updates",
    area: "account_and_app",
    q: "How do I get the latest version?",
    a: "Most fixes arrive by themselves. When \"A new version of MileClear is ready\" shows, tap Restart. If something you've been told about isn't there, close MileClear fully (swipe it away) and open it again, twice. New builds also come through the App Store or Google Play.",
  },
  {
    id: "contact",
    area: "account_and_app",
    q: "How do I contact the team?",
    a: "More > Feedback > Report a problem sends your message privately with your phone's details, and you can follow the reply in the app. You can also email support@mileclear.com. Ideas go on the Feedback board, where you can vote. EmSee can pass a message on for you too.",
  },
  {
    id: "app-lock",
    area: "account_and_app",
    q: "Can I lock the app?",
    a: "Yes. The App lock switch in More > Settings locks MileClear with Face ID, Touch ID or your passcode.",
  },
  {
    id: "emails",
    area: "account_and_app",
    q: "How do I stop the update emails?",
    a: "Tap Unsubscribe at the bottom of any update email. Emails you need, like sign-in codes and receipts, keep coming.",
  },
  {
    id: "emsee",
    area: "account_and_app",
    q: "What can EmSee do?",
    a: "EmSee answers questions about your MileClear records (miles, earnings, expenses, fuel, your mileage claim and tax-year figures), explains how MileClear works, gives general guidance on what drivers can usually claim, and passes your suggestions and problems to the team. It's part of Pro, with a daily and monthly question limit. It can't see your routes or addresses, and it can't change your records.",
  },
  {
    id: "community",
    area: "account_and_app",
    q: "Is there a community of drivers?",
    a: "Yes, a Discord for UK drivers: More > Settings > MileClear community.",
  },
  {
    id: "privacy",
    area: "account_and_app",
    q: "Who can see my data?",
    a: "Only you, plus anyone you choose to share with: your accountant (Pro, through Tax > Your accountant) or your employer's team if you join one. Community figures like \"drivers near you\" only show when at least 5 drivers contribute, so no one can be picked out. The privacy policy is on mileclear.com.",
  },

  // ── Insights and alerts ──────────────────────────────────────────────────
  {
    id: "insights",
    area: "insights_and_alerts",
    q: "Where are my stats and trends?",
    a: "In Work mode, More > Insights; in Personal mode it's the Insights tab. It shows your recaps, personal records and achievements. Business insights (platform comparison, best hours, weekly profit) and driving analytics are Pro.",
  },
  {
    id: "recaps",
    area: "insights_and_alerts",
    q: "What are recaps?",
    a: "Summaries of your day, week, month and year: miles, trips, mileage claim and highlights. They're free, open from Insights, and can be shared.",
  },
  {
    id: "achievements",
    area: "insights_and_alerts",
    q: "How do achievements and streaks work?",
    a: "Badges unlock as you hit milestones in miles, trips and shifts (More > Achievements). A streak counts the days in a row you've recorded a trip. Both are free.",
  },
  {
    id: "notifications",
    area: "insights_and_alerts",
    q: "How do I choose which notifications I get?",
    a: "More > Settings > Notifications. You can turn on or off trip reminders, shift alerts, streaks, the morning briefing and evening summary, cheapest fuel near you, road alerts, tax deadline reminders, weekly and monthly summaries, and clean air zone reminders.",
  },
  {
    id: "fuel-prices",
    area: "insights_and_alerts",
    q: "Does MileClear show fuel prices?",
    a: "Yes. More > Fuel shows prices at stations near you from the UK government's fuel price data. You can also get a morning notification when a station near you is at least 3p a litre under the local average (More > Settings > Notifications).",
  },
  {
    id: "road-alerts",
    area: "insights_and_alerts",
    q: "What are road alerts?",
    a: "A trial that warns you before you usually set off if a road you use often is closed or badly delayed, at most once a day. Turn it on in More > Settings > Notifications.",
  },
  {
    id: "benchmarks",
    area: "insights_and_alerts",
    q: "Can I compare myself with other drivers?",
    a: "Drivers near you compares your weekly miles and earnings with other MileClear drivers in your area. It only shows when at least 5 drivers contribute, so no one can be identified.",
  },
];

/** Everything written for one area, plus the list of areas to try next. */
export function helpForArea(area: HelpArea): {
  area: HelpArea;
  covers: string;
  answers: { q: string; a: string }[];
  other_areas: Record<string, string>;
} {
  return {
    area,
    covers: HELP_AREA_LABELS[area],
    answers: HELP_ENTRIES.filter((e) => e.area === area).map(({ q, a }) => ({ q, a })),
    other_areas: Object.fromEntries(HELP_AREAS.filter((x) => x !== area).map((x) => [x, HELP_AREA_LABELS[x]])),
  };
}
