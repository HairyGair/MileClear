/**
 * The EmSee / Help question bank: things drivers actually ask (support inbox,
 * feedback, missing-trip replies, app reviews), in their own words, each
 * pinned to the written answer that covers it (packages/shared/src/data/help.ts)
 * and the key facts a correct answer must contain.
 *
 * Every question is phrased as a how-to, never as a report that something is
 * broken: the live eval (scripts/eval-emsee-help.ts) sends these to the real
 * model, and a problem report would make EmSee message the team.
 *
 * `expect` patterns are checked against EmSee's live answer (case-insensitive).
 * Keep them to what any correct answer must say: the menu path words and the
 * free/Pro fact, not exact sentences.
 */
import type { HelpArea } from "@mileclear/shared";

export interface BankQuestion {
  q: string;
  area: HelpArea;
  id: string;
  expect: RegExp[];
  /** Must NOT appear in a correct answer. */
  reject?: RegExp[];
  /** A correct answer can come from EmSee's data tools (rates, tax year, what EmSee is) without mileclear_help. */
  toolOptional?: boolean;
}

const SETTINGS = /settings/i;
const PRO = /\bpro\b/i;
const FREE = /free/i;

export const QUESTION_BANK: BankQuestion[] = [
  // Getting started
  { q: "What does this app actually do?", area: "getting_started", id: "what-it-does", expect: [/business|personal/i, /claim/i] },
  { q: "I've just downloaded it, what now?", area: "getting_started", id: "first-steps", expect: [/vehicle/i, /always|all the time/i] },
  { q: "What should I set up first on a new phone?", area: "getting_started", id: "first-steps", expect: [/vehicle/i] },
  { q: "What's all the stuff on the home screen?", area: "getting_started", id: "home-screen", expect: [/start trip/i, /status|recording/i] },
  { q: "How do I hide one of the shortcuts on home?", area: "getting_started", id: "home-screen", expect: [/hold/i, /home screen/i] },
  { q: "How do I switch to personal mode?", area: "getting_started", id: "work-personal-mode", expect: [/top of home|work \| personal|switch/i] },
  { q: "Whats the diffrence between work and personal mode", area: "getting_started", id: "work-personal-mode", expect: [/tax/i, /insights/i] },
  { q: "What does 'You drive for' mean?", area: "getting_started", id: "you-drive-for", expect: [/gig|employer/i, /just me/i] },
  { q: "How do I tell the app I only drive for myself, not work?", area: "getting_started", id: "you-drive-for", expect: [/just me/i, /you drive for/i] },
  { q: "I drive a company car, what do I pick?", area: "getting_started", id: "company-car", expect: [/a company car/i, /you drive for/i] },
  { q: "What are the green ticks at the top of settings?", area: "getting_started", id: "settings-checks", expect: [/record/i, /notification/i] },
  { q: "What does the Fix button in settings do?", area: "getting_started", id: "settings-checks", expect: [/fix/i] },
  { q: "Can I use it if I'm employed, not self-employed?", area: "getting_started", id: "who-for", expect: [/employ/i] },

  // Recording trips
  { q: "Do I have to press anything to record a trip?", area: "recording_trips", id: "automatic-trips", expect: [/automatic/i] },
  { q: "How does it know when im driving", area: "recording_trips", id: "automatic-trips", expect: [/speed|15 ?mph/i] },
  { q: "What's the Start Trip button for?", area: "recording_trips", id: "start-trip", expect: [/arrived|i'm here/i] },
  { q: "How do I record a trip myself with Start Trip?", area: "recording_trips", id: "start-trip", expect: [/start trip/i, /arrived/i] },
  { q: "How do I stop Start Trip ending while I wait at the depot?", area: "recording_trips", id: "start-trip", expect: [/runs until i tap arrived/i, /recording options/i] },
  { q: "Should I use start trip or just leave it on automatic?", area: "recording_trips", id: "start-trip-vs-automatic", expect: [/automatic/i, /start trip/i] },
  { q: "What's this 'Still on your trip?' message?", area: "recording_trips", id: "still-on-your-trip", expect: [/10 minutes/i, /keep going/i] },
  { q: "What's a shift and how is it graded?", area: "recording_trips", id: "shifts", expect: [/start shift/i] },
  { q: "Where do I see my old shifts?", area: "recording_trips", id: "shifts", expect: [/more/i, /shifts/i] },
  { q: "How do I time how long I wait at a restaurant?", area: "recording_trips", id: "pickup-wait", expect: [/wait at pickup/i] },
  { q: "I'm on holiday, how can I stop it recording for a week?", area: "recording_trips", id: "pause-recording", expect: [/pause/i, /for a week/i] },
  { q: "How do I resume recording after a pause?", area: "recording_trips", id: "pause-recording", expect: [/resume/i] },
  { q: "How do I turn off automatic tracking?", area: "recording_trips", id: "turn-off-automatic", expect: [/automatic trips/i] },
  { q: "Is it going to kill my battery?", area: "recording_trips", id: "battery", expect: [/save battery when it's low|low power|battery saver/i] },
  { q: "What does save battery when it's low do?", area: "recording_trips", id: "battery", expect: [/low/i] },
  { q: "How long a stop before it starts a new trip?", area: "recording_trips", id: "journey-end", expect: [/end a trip after/i, /30 minutes/i] },
  { q: "How do I get rid of the lock screen thing?", area: "recording_trips", id: "live-activity", expect: [/show a trip on your lock screen/i, /notifications/i] },
  { q: "What permissions does it need?", area: "recording_trips", id: "permissions", expect: [/always|all the time/i, /motion|physical activity/i] },
  { q: "Will it work in a tunnel or with no signal?", area: "recording_trips", id: "offline", expect: [/phone|online/i] },
  { q: "Can I use Siri to start a shift?", area: "recording_trips", id: "siri", expect: [/start my shift/i] },
  { q: "Why is there always a MileClear notification on my Android?", area: "recording_trips", id: "android-notification", expect: [/recording|monitoring/i] },

  // Missing or wrong trips
  { q: "If a trip from this morning isn't in my list, what should I do?", area: "missing_or_wrong_trips", id: "missing-trip", expect: [/missing a trip\? tell us/i, /trips/i] },
  { q: "How do I tell you about a trip that didn't record?", area: "missing_or_wrong_trips", id: "missing-trip", expect: [/missing a trip\? tell us/i] },
  { q: "What are journeys to check?", area: "missing_or_wrong_trips", id: "journeys-to-check", expect: [/add trip/i, /not a trip/i] },
  { q: "Why do some trips show up hours later?", area: "missing_or_wrong_trips", id: "late-trip", expect: [/background|open/i] },
  { q: "How do I fix a long wait splitting my trip in two?", area: "missing_or_wrong_trips", id: "split-trip", expect: [/join/i, /end a trip after|runs until i tap arrived/i] },
  { q: "How do I correct the distance on yesterday's trip?", area: "missing_or_wrong_trips", id: "wrong-distance", expect: [/work out the miles again/i] },
  { q: "What does the low confidence badge on a trip mean?", area: "missing_or_wrong_trips", id: "wrong-distance", expect: [/distance may be off/i, /work out the miles again/i] },
  { q: "How can I check all my trips for wrong distances at once?", area: "missing_or_wrong_trips", id: "wrong-distance", expect: [/check my trips for odd ones/i] },
  { q: "What should I do with a trip it logged while I was sat at home?", area: "missing_or_wrong_trips", id: "phantom-trip", expect: [/delete trip/i] },
  { q: "What do I do with a train journey it recorded?", area: "missing_or_wrong_trips", id: "passenger", expect: [/personal|delete/i] },
  { q: "How do I end a trip that's still recording after I parked?", area: "missing_or_wrong_trips", id: "trip-not-ending", expect: [/arrived|open/i] },
  { q: "How do I get my trips onto the website?", area: "missing_or_wrong_trips", id: "web-missing", expect: [/settings|upload/i, /retry|sync/i] },

  // Managing trips
  { q: "How do I mark a trip as business?", area: "managing_trips", id: "classify", expect: [/business/i] },
  { q: "where do i sort my unclassified trips", area: "managing_trips", id: "classify", expect: [/to sort/i] },
  { q: "Does driving to the depot count as business?", area: "managing_trips", id: "what-is-business", expect: [/commut/i], toolOptional: true },
  { q: "I forgot to track a trip, can I add it?", area: "managing_trips", id: "add-past-trip", expect: [/add a past trip/i] },
  { q: "How do I log a journey from last week by hand?", area: "managing_trips", id: "add-past-trip", expect: [/add a past trip/i] },
  { q: "How do I change the time on a trip?", area: "managing_trips", id: "edit-trip", expect: [/edit trip/i] },
  { q: "Can I join two trips together?", area: "managing_trips", id: "merge-trips", expect: [/join trips/i, /hold/i] },
  { q: "How do I split a trip in two?", area: "managing_trips", id: "split-a-trip", expect: [/split into separate trips/i] },
  { q: "How do I delete a trip?", area: "managing_trips", id: "delete-trip", expect: [/delete trip/i] },
  { q: "How do I tag a trip as Amazon Flex?", area: "managing_trips", id: "platform-tag", expect: [/which app|edit trip/i] },
  { q: "Can I see miles per client?", area: "managing_trips", id: "projects", expect: [/miles by project/i] },
  { q: "How do I keep odometer readings for my employer?", area: "managing_trips", id: "odometer", expect: [/odometer log/i, PRO] },
  { q: "Can it mark my work trips automatically?", area: "managing_trips", id: "auto-classify", expect: [/sort trips automatically|3 times|automatic/i] },
  { q: "How do I undo an automatic sort on a trip?", area: "managing_trips", id: "auto-classify", expect: [/sorted for you/i, /undo/i] },

  // Tax and claims
  { q: "What's the mileage rate this year?", area: "tax_and_claims", id: "rates", expect: [/55p/, /25p/], toolOptional: true },
  { q: "Why are some trips at 45p?", area: "tax_and_claims", id: "rates", expect: [/45p/, /6 april 2026/i], toolOptional: true },
  { q: "whats the rate for a motorbike", area: "tax_and_claims", id: "rates", expect: [/24p/], toolOptional: true },
  { q: "Is the mileage claim money I get paid?", area: "tax_and_claims", id: "claim-meaning", expect: [/profit|expense/i], toolOptional: true },
  { q: "Can I claim fuel as well as mileage?", area: "tax_and_claims", id: "claim-meaning", expect: [/fuel/i], toolOptional: true },
  { q: "What does the Tax tab show me?", area: "tax_and_claims", id: "tax-tab", expect: [/return|tax so far|put by/i] },
  { q: "How do I get my tax return ready for January?", area: "tax_and_claims", id: "your-return", expect: [/31 january/i] },
  { q: "How do I fill in my tax return with this?", area: "tax_and_claims", id: "sa-wizard", expect: [/box by box/i] },
  { q: "Is the box by box thing free?", area: "tax_and_claims", id: "sa-wizard", expect: [FREE, /pdf/i] },
  { q: "Does MileClear submit my tax return for me?", area: "tax_and_claims", id: "sa-wizard", expect: [/(doesn't|does not|can't|cannot|won't|never) (file|submit)|you or your accountant/i] },
  { q: "How do I send my mileage to my accountant?", area: "tax_and_claims", id: "exports", expect: [/downloads/i, PRO] },
  { q: "How do I export a CSV of my trips?", area: "tax_and_claims", id: "exports", expect: [/downloads/i, /csv/i] },
  { q: "Can my accountant log in to see my figures?", area: "tax_and_claims", id: "accountant", expect: [/mileclear\.com/i, PRO] },
  { q: "How is my tax estimate worked out?", area: "tax_and_claims", id: "tax-estimate", expect: [/earnings/i, /expenses|mileage/i] },
  { q: "How much should I put by each week for tax?", area: "tax_and_claims", id: "payment-plan", expect: [/payment plan/i] },
  { q: "When do I pay my tax bill?", area: "tax_and_claims", id: "payment-plan", expect: [/31 january/i] },
  { q: "This is my first tax return, where do I start?", area: "tax_and_claims", id: "first-return", expect: [/new to self assessment/i] },
  { q: "My boss pays 30p a mile, can I claim the rest?", area: "tax_and_claims", id: "employee", expect: [/mileage allowance relief/i] },
  { q: "How do I claim tax back on a P87?", area: "tax_and_claims", id: "mileage-relief", expect: [/p87|gov\.uk/i] },
  { q: "How do I add my full-time job salary so the tax is right?", area: "tax_and_claims", id: "other-income", expect: [/other annual income|tax already taken off/i] },
  { q: "Should I use cash basis or accruals?", area: "tax_and_claims", id: "cash-basis", expect: [/how you count income/i] },
  { q: "Uber sent my earnings to HMRC, how do I check them?", area: "tax_and_claims", id: "hmrc-check", expect: [/check your platform figures/i] },
  { q: "How can I show my insurer proof of my business miles?", area: "tax_and_claims", id: "certificate", expect: [/mileage certificate/i] },
  { q: "Is MileClear HMRC approved?", area: "tax_and_claims", id: "hmrc-approved", expect: [/\bno\b|isn't|not/i], reject: [/hmrc[- ](approved|compliant|ready|recognised)/i] },
  { q: "Does it do Making Tax Digital?", area: "tax_and_claims", id: "mtd", expect: [/test/i], reject: [/submits? (your|quarterly) updates? to hmrc/i] },
  { q: "When does the tax year end?", area: "tax_and_claims", id: "tax-year", expect: [/5 april/i], toolOptional: true },

  // Money
  { q: "How do I add my Deliveroo earnings?", area: "money", id: "earnings", expect: [/earnings/i, /add manually/i] },
  { q: "Can I just screenshot my Uber earnings?", area: "money", id: "snap-statement", expect: [/snap a statement/i, PRO] },
  { q: "Can I upload my Amazon Flex earnings file?", area: "money", id: "csv-import", expect: [/import csv/i, PRO] },
  { q: "How do I add a parking receipt?", area: "money", id: "expenses", expect: [/expenses/i] },
  { q: "Is scanning receipts free?", area: "money", id: "receipts", expect: [FREE, /scan receipt/i] },
  { q: "Why does my lunch expense have a warning on it?", area: "money", id: "meal-warning", expect: [/meal/i] },
  { q: "Can it read my bank?", area: "money", id: "bank", expect: [/link a bank/i, PRO] },
  { q: "What's the bank inbox for?", area: "money", id: "bank", expect: [/accept as (earning|expense)|ignore/i] },
  { q: "Can I invoice a client?", area: "money", id: "invoices", expect: [/invoices/i, /3 /] },
  { q: "Do I need to log fuel?", area: "money", id: "fuel", expect: [/optional|doesn't|does not/i] },
  { q: "I got a parking ticket, can the app show where I was?", area: "money", id: "ticket-defender", expect: [/ticket defender/i, PRO] },
  { q: "Does it know about ULEZ charges?", area: "money", id: "caz", expect: [/log charge|expense/i] },

  // Vehicles and places
  { q: "How do I add my van?", area: "vehicles_and_places", id: "add-vehicle", expect: [/vehicles/i, /look up|registration/i] },
  { q: "How many vehicles can I have on the free plan?", area: "vehicles_and_places", id: "add-vehicle", expect: [/\b1\b|one/i] },
  { q: "Will it remind me when my MOT is due?", area: "vehicles_and_places", id: "mot-reminders", expect: [/14 days/i] },
  { q: "How do I see my car's MOT history?", area: "vehicles_and_places", id: "mot-reminders", expect: [/view mot history/i] },
  { q: "How do I save my home address?", area: "vehicles_and_places", id: "saved-places", expect: [/saved places/i] },
  { q: "Do saved places start trips?", area: "vehicles_and_places", id: "saved-places", expect: [/(don't|do not|doesn't) start/i] },
  { q: "How do I set my working hours?", area: "vehicles_and_places", id: "work-schedule", expect: [/work hours/i] },

  // Pro and billing
  { q: "What do I get with Pro?", area: "pro_and_billing", id: "free-vs-pro", expect: [/downloads|export/i] },
  { q: "Is tracking free?", area: "pro_and_billing", id: "free-vs-pro", expect: [FREE, /unlimited|no (monthly )?limit/i] },
  { q: "How much is Pro?", area: "pro_and_billing", id: "price", expect: [/£4\.99/] },
  { q: "How do I cancel my subscription?", area: "pro_and_billing", id: "cancel", expect: [/your plan|subscriptions|google play/i] },
  { q: "How do I restore my Pro purchase on a new phone?", area: "pro_and_billing", id: "restore", expect: [/restore purchase/i] },
  { q: "How do I get Pro for free?", area: "pro_and_billing", id: "refer", expect: [/invite a friend/i, /3/] },
  { q: "My company uses MileClear, how do I get Pro through them?", area: "pro_and_billing", id: "team-pro", expect: [/invite|team/i] },

  // Account and app
  { q: "If I sign in and see an empty account, what should I do?", area: "account_and_app", id: "sign-in", expect: [/same way|way you first|first did|originally/i] },
  { q: "How do I change my email address?", area: "account_and_app", id: "change-email", expect: [SETTINGS, /email/i, /code/i] },
  { q: "How do I change my password?", area: "account_and_app", id: "change-email", expect: [/change password/i] },
  { q: "How do I change my display name?", area: "account_and_app", id: "names", expect: [/your name|you screen/i] },
  { q: "How do I delete my account?", area: "account_and_app", id: "delete-account", expect: [/delete account/i, /your name|you screen/i] },
  { q: "Can I download everything you hold about me?", area: "account_and_app", id: "my-data", expect: [/get a copy of your data/i] },
  { q: "Can I put a password on the app?", area: "account_and_app", id: "app-lock", expect: [/app lock/i] },
  { q: "Can I use it on my laptop?", area: "account_and_app", id: "website", expect: [/mileclear\.com/i] },
  { q: "How do I update the app?", area: "account_and_app", id: "updates", expect: [/restart|app store|google play/i] },
  { q: "Is there an Android version?", area: "account_and_app", id: "android", expect: [/google play/i] },
  { q: "How do I speak to someone?", area: "account_and_app", id: "contact", expect: [/feedback|support@mileclear\.com/i] },
  { q: "How do I stop the update emails?", area: "account_and_app", id: "emails", expect: [/unsubscribe/i] },
  { q: "What can EmSee do for me?", area: "account_and_app", id: "emsee", expect: [/records|miles|earnings/i], toolOptional: true },
  { q: "Is there a group for drivers?", area: "account_and_app", id: "community", expect: [/discord/i] },
  { q: "Who can see my trips?", area: "account_and_app", id: "privacy", expect: [/accountant|only you/i] },

  // Insights and alerts
  { q: "Where are my stats?", area: "insights_and_alerts", id: "insights", expect: [/insights/i] },
  { q: "How do I see my monthly summary?", area: "insights_and_alerts", id: "insights", expect: [/insights/i, /month/i] },
  { q: "Where can I see my longest trip?", area: "insights_and_alerts", id: "records", expect: [/insights/i] },
  { q: "How do streaks work?", area: "insights_and_alerts", id: "achievements", expect: [/days? in a row|weeks? in a row/i] },
  { q: "Where are my badges?", area: "insights_and_alerts", id: "achievements", expect: [/achievements|badges/i] },
  { q: "How do I set a weekly miles goal?", area: "insights_and_alerts", id: "weekly-goal", expect: [/set a weekly goal/i] },
  { q: "How do I compare to other drivers?", area: "insights_and_alerts", id: "benchmarks", expect: [/drivers near you/i] },
  { q: "How do I turn some notifications off?", area: "insights_and_alerts", id: "notifications", expect: [/settings/i, /notifications/i] },
  { q: "Where's the cheapest fuel near me?", area: "insights_and_alerts", id: "fuel-prices", expect: [/fuel/i] },
  { q: "What are road alerts?", area: "insights_and_alerts", id: "road-alerts", expect: [/usual|closed|delay/i] },
];
