// Release notes — single source of truth for both the website's
// /updates page and the Product Update email campaign sent from the
// admin panel. Adding a new release: append at the top of the array,
// flip the previous "Latest" to "App Store", set this one's label to
// "Pending Review" while in App Store review, then "Latest" once
// approved. The email campaign reads the entry with label "Latest".
//
// To make the Product Update email auto-render: populate the optional
// emailSubject / emailHero / emailTagline / emailHighlights fields on
// the new release. The email function falls back to sensible defaults
// if any are absent, so they're not strictly required — but a focused
// 5-7 highlights array reads better than the full 18-item changelog.

export interface ReleaseNote {
  version: string;
  date: string;
  label?: "Latest" | "Major" | "Pending Review" | "App Store" | "In Testing" | "In Development";
  items: string[];
  ctaUrl?: string;
  ctaLabel?: string;
  // Email-campaign overrides (optional). Used by the admin "Product
  // Update" send-to-all flow. If omitted, the email falls back to a
  // generic template derived from version + items.
  emailSubject?: string;
  emailHero?: string;
  emailTagline?: string;
  emailHighlights?: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.2.0",
    date: "13 May 2026",
    label: "Pending Review",
    emailSubject: "MileClear 1.2.0 is here - and it's a big one",
    emailHero: "1.2.0 - the biggest update since launch",
    emailTagline:
      "Two weeks. One huge update. Quarterly HMRC submissions, road-accurate trip distances, a Lock Screen that earns its keep while you drive, and every sole-trader feature the community has been asking for. Thirty-odd things in total, all in one release - free for free users, baked in for Pro. Open the app and have a poke around.",
    emailHighlights: [
      "**Quarterly Self Assessment direct to HMRC.** Connect your HMRC account, confirm your trade, preview each quarterly update against your MileClear figures, and submit. The headline figures cross-check against HMRC's own calculation engine so you see the marginal-rate breakdown before it's locked in. The headline tax feature most UK sole traders will need from April 2026 - already in the app.",
      "**Your Lock Screen actually shows what you're doing.** Leave home, head out for a delivery, and your Lock Screen now shows a 'Trip Active - From Home' Live Activity with miles ticking up in real time. Park at the destination and it flips to a Trip Complete summary that, for business trips, shows the pound value you just earned back from HMRC. Visible the moment you stop the car, before you've even unlocked the phone.",
      "**Trip distances that are actually accurate.** Manual trip A to B uses our self-hosted UK routing engine - same address pair returns the same mileage, every time. Auto-tracked trips get road-snapped polylines so the map shows your actual route, not the GPS-jittered breadcrumb trail. The figure on your tax return is now structurally consistent.",
      "**Smarter trip classification.** Tag the same A to B journey as Work three times, and the fourth time MileClear auto-classifies it for you. Auto-detected trips now ask 'Was this a Work trip?' with one-tap Yes / Personal / Not me buttons right on the Lock Screen. The classification tap disappears.",
      "**Invoices for freelancers and sole traders.** Track who owes you, when invoices went out, what's been paid. Free tier covers 3 invoices a month, plenty for the occasional side gig. Pro unlocks unlimited. Tax Readiness only counts income that's actually arrived (cash basis, the UK default since April 2024) so your figures stay honest.",
      "**'My Accountant' factors the filing fee into your set-aside.** Settings - Work & Tax - My Accountant. Enter their annual fee and we spread it across 52 weeks. The Tax Readiness set-aside line covers both the tax bill AND the accountant by the time filing season comes around.",
      "**PAYE deductions counted properly.** If you have a salaried day job alongside gig work, tell MileClear what your employer has already deducted in PAYE. The 'still owed' figure on Tax Readiness becomes honest instead of double-counting tax that's already been collected via your payslip.",
      "**Confidence indicator on every trip.** High / medium / low badge with tap-to-expand reasons. HMRC-defence material - every claimed mile is auditable.",
      "**Help & Tutorials right inside the app.** Avatar menu - Help & Tutorials. Replayable first-launch tour, categorised FAQ, and inline info buttons throughout the app. Tap any ⓘ next to the Tax Readiness card, the PAYE field, the My Accountant row, or the tax basis toggle and a focused explainer slides up. No more guessing what something means.",
      "**Rock-solid foundations.** The under-the-hood work no one sees but everyone benefits from. Refresh-token sessions don't randomly drop you to the login screen anymore. End Shift from the Lock Screen actually ends the shift. Opening the app while parked no longer triggers a phantom trip. Brief petrol-station stops no longer split a single drive into two records. A dozen smaller reliability wins on top of those.",
    ],
    items: [
      "**HMRC MTD ITSA submissions — full flow.** Settings → Work & Tax → MTD ITSA. Connect your HMRC account, enter your National Insurance Number, confirm your trade, and submit quarterly periods directly from the app. The preview screen shows exactly what we're about to send — per-platform income breakdown, mileage tier crossings, expense bucketing — so there are no surprises. After submission, MileClear asks HMRC's own calculation engine for the tax due and shows you both their number and ours.",
      "**Premium routing stack.** Replaces the previous mileage calculation path that occasionally fell back to straight-line distance when the public routing service was rate-limited. Manual trips now use a three-layer stack: a persistent cache (so identical A→B always returns the same mileage), our self-hosted UK routing engine, and a commercial fallback. Same address pair → same distance, every time, structurally.",
      "**GPS map-matching.** Auto-tracked trips now get a clean road-snapped polyline. The map shows the actual roads you drove, not the GPS-jittered breadcrumb trail with corner-cutting and the occasional driving-through-a-building artefact.",
      "**Pattern-learning trip classification.** Done a particular A→B three or more times tagged consistently? The fourth time we auto-classify it. Toast confirms the decision so you can override if it's wrong. Won't auto-apply unless the same classification has 80%+ agreement across at least 3 prior trips.",
      "**Invoices.** Sole traders and freelancers can now track outstanding work in MileClear. Each invoice carries a company name, amount, sent date, due date (30 days by default), and paid status. Simple list that exports cleanly to your accountant. Free tier covers 3 invoices a month; Pro unlocks unlimited.",
      "**Tax basis: cash or accruals.** Settings → Work & Tax → Tax basis. Cash basis (the UK default since April 2024) means invoices only count toward your tax figure when they're paid — accurate to how the money actually flows. Accruals counts when invoiced regardless of payment.",
      "**PAYE tax deducted offset.** If you've got a salary alongside gig work, the new 'Tax already deducted' field subtracts what your employer's withheld from the Tax Readiness 'still owed' figure. No more being shown a £4,000 tax bill when £3,200 has already been collected via your payslip.",
      "**Per-trip confidence indicator.** Every trip now shows a high / medium / low badge based on GPS sample quality, breadcrumb count, route verification, and average speed sanity. Tap the badge for a plain-English breakdown of what makes it confident or what to watch. Lives on the trip detail screen + a small dot on the trips list.",
      "**One-tap recalculate distance.** On any trip's detail screen there's now a 'Recalculate distance' button. Hits our routing engine on demand. Self-service fix for any trip with a wrong-looking number, without needing support.",
      "**Bulk recalculate suspicious trips.** Settings → Data & Exports → Recheck suspicious trips. We scan your recent history for low/medium-confidence trips and re-run routing/map-matching across them. Closes the loop on any historical data quality issues in a single tap.",
      "**Trip-merge suggestion banner.** If you have two trips with the same vehicle within 15 minutes and 1km of each other (signature of a fuel stop or quick errand), the detail screen offers a one-tap merge.",
      "**Post-trip review card.** After saving a manual trip you get a brief moment-of-completion overlay showing the distance, the AMAP £ value, what we classified it as, and how we calculated the distance. Replaces the abrupt return to dashboard.",
      "**Live Activity richness.** Lock screen during a recording now shows up to three context lines below the main stats: today's running total mileage, proximity to your next milestone (e.g. '5 mi to 10K Club'), and — for shift workers — today's earnings tally.",
      "**Heartbeat-driven proactive alerts.** If background location is turned off, background app refresh is denied, your sync queue has permanently-failed rows, or your phone storage is critically low, we now push you a one-tap fix before you notice trips have stopped recording.",
      "**Data-quality celebration.** If we corrected any of your trips behind the scenes (rare, but it's happened to a handful of users on older routing paths), you'll see a one-shot banner on the dashboard telling you what changed and how many miles you recovered.",
      "**Auto-classify suggestion on manual trip flow.** When you set a start + end for a manual trip, we now look at your prior trips with the same A→B and pre-fill the classification + platform dropdown. Saves a tap.",
      "**Routing provenance shown to user.** Every trip's distance now carries a small label — 'Route distance via road', 'Route distance via road (cached)', or 'Route distance via Google Maps' — so the figure is auditable for HMRC purposes. No more silent fallback to crow-flies.",
      "**Heartbeat sync deep-link.** Tapping a 'N trips failed to upload' push notification now lands you directly on the Sync Status screen with a retry button, instead of dumping you on the dashboard.",
      "**Pair-based classification suggestion endpoint.** Same as point 4 but available for client-side use in the Active Recording trip-end flow, giving real-time suggestions as soon as both endpoints of a trip are known.",
      "**Routing stack admin panel** (internal): live GraphHopper health probe, cache row count, recent route source breakdown, fallback rate. Lets us spot when the primary engine has issues before it shows up in user reports.",
      "**Geofence trips get a full Live Activity.** Previously, when MileClear auto-detected a trip via geofence Exit / Enter (most commonly when you leave home or work without manually starting anything), the recording happened silently with no in-drive feedback. Now the Lock Screen shows a 'Trip Active' Live Activity from the moment you cross the saved-location boundary, with a 'From Home' / 'From Work' badge naming where you set off. Distance and speed tick up live as you drive. Park at the destination and the Activity flips to a frozen Trip Complete summary.",
      "**HMRC £ value shown on the Trip Complete Lock Screen summary.** For business trips, the frozen summary card now shows the £X.XX HMRC mileage deduction you've just earned back — visible the moment you park, before you've even unlocked the phone. Personal trips show the standard 'Saved' confirmation. Calculation honours the 10,000-mile tier crossing and your vehicle type.",
      "**Smart classification suggestion in the trip-confirmation push.** When MileClear auto-detects a trip and asks you to confirm it, the notification now leads with our best guess based on where you started and where you ended. 'Work trip detected · Home → Work · 12.3 mi · Tap Yes, Work to confirm.' Three action buttons live on the lock screen (Yes Work / Personal / Not me) so you can confirm without unlocking. Confirms feed back into the auto-classifier so future trips between the same pair get more confident over time.",
      "**Trip-confirmation push respects your toggle, not iOS quiet hours.** A trip you've just finished driving is a moment in your day, not a 3am alarm — iOS Focus and Do Not Disturb already handle muting at the OS level. Previously the app silently suppressed confirmation pushes between 10pm and 7am, which meant evening drivers were sometimes missing the confirm-trip prompt entirely.",
      "**'My Accountant' settings.** New screen under Settings → Work & Tax → Sole Trader → My Accountant. Enter your accountant's name, contact, and annual fee. The annual fee gets spread across 52 weeks and added to the weekly set-aside figure on your Tax Readiness card, so when filing season comes around the cash is already there for both the tax bill AND the accountant's invoice. Stays free tier (tax tooling, always free per the paywall philosophy).",
      "**End Shift from the Lock Screen now properly ends your shift.** Previously, tapping End Shift on the Live Activity dismissed the Activity but the shift itself stayed open on the server, so subsequent drives accumulated into it. Now the shift gets closed cleanly via the API, mileage caps off at the right number, and the Activity flips to the Trip Complete summary view.",
      "**Live Activity no longer pins to the Dynamic Island after you park.** A bug in the geofence trip Activity kept refreshing it on every GPS callback, which blocked iOS's natural stale-dismiss timer and burned battery via the constant SQLite + native-bridge churn. The update path now throttles to once per 20 seconds AND only fires when distance has actually advanced, so when you stop moving the Activity goes stale and dismisses naturally within 8 minutes. A foreground cleanup pass also catches any orphaned Activities older than 2 hours and clears them out.",
      "**Phantom 'driving' trips from cell-tower drift are blocked at the source.** Geofence Exit events used to be trusted unconditionally — but iOS occasionally fires them from low-accuracy cell-tower or WiFi positioning fixes, even though the phone hasn't moved. A user could sit at their office all morning, have iOS phantom-fire an Exit at a nearby saved location, and find the Lock Screen recording GPS jitter as a fake 'Trip Active'. Now every Exit gets position-verified: if the device's actual position is still inside the geofence (or if the fix that triggered the event is too coarse to trust), the Exit is rejected and no trip starts.",
      "**Session reliability rebuilt.** A small percentage of users were hitting an auto-logout bug on app cold-start that, when they signed back in with Apple, sometimes landed them in a fresh blank profile. Root cause was the previous refresh-token rotation deleting the old token before the client had a chance to acknowledge receipt of the new one — common cause was iOS suspending the app mid-flight. New rotation model uses token families with replay detection: legitimate dropped responses get recovered seamlessly, while genuine token theft is detected and the whole session is force-terminated. Industry-standard pattern (OAuth 2.0 Security BCP) and an audit-friendly answer for the SOYOStudios entity when compliance reviews start landing.",
      "**First-launch Quick Start tour.** A 5-card swipeable tour slides up the first time you open the app after signing in. Covers the core value loop in plain English: automatic trip tracking, Work / Personal classification, the Tax Readiness card, and how HMRC quarterly submissions work. Skippable from the top right, and you can replay it anytime from Avatar → Help & Tutorials.",
      "**Help & Tutorials screen with categorised FAQ.** New screen at Avatar → Help & Tutorials. ~28 topics across Getting started / Tax & HMRC / Trips / Money / Privacy & data / Troubleshooting. Tap a topic to expand the answer or jump straight to the relevant settings screen.",
      "**Contextual ⓘ info buttons inline throughout the app.** Tap the small ⓘ next to the Tax Readiness card header, the PAYE field, the Tax basis toggle, the My Accountant row, the Employer mileage row, or the Quarterly Self Assessment row — a bottom sheet slides up with a focused explainer plus a deep-link to the relevant screen. Same content source as the full Help screen, surfaced exactly where you'd ask the question.",
      "**No more phantom trip at app launch.** iOS's geofence subsystem re-evaluates the device's position against your saved locations the moment the app starts. If the cached fix was stale or coarse (cell-tower triangulation territory), it could fire a phantom Exit event and kick off a fake trip while you were sitting still. Exits within 30 seconds of registration now demand a fresh high-accuracy GPS fix before being accepted — so opening the app while parked can no longer create a phantom recording.",
      "**Overlapping trip segments merge correctly.** The trip-merge logic used to require the new segment's first coord to come strictly AFTER the previous trip's end. But the watch-and-wait detector buffers coords from the first sighting of motion, so a brief stop that gets stop-detected after the motion resumed produced overlapping timestamps that were rejected for merge — even though they're the strongest signal of a continuous drive. Now the 15-minute merge window is symmetric, and trips that overlap by up to 15 min still combine.",
      "**Personal welcome email when you upgrade to Pro.** First time you upgrade, you'll get a one-shot welcome from gair@mileclear.com (the founder, Anthony). Reply-to lands in his inbox directly, not a generic support queue. Doesn't fire on renewals or restored purchases — just on the first upgrade.",
    ],
  },
  {
    version: "1.1.4",
    date: "8 May 2026",
    label: "App Store",
    ctaUrl: "https://apps.apple.com/app/mileclear/id6742044832",
    ctaLabel: "Install on the App Store",
    emailSubject: "MileClear 1.1.4 - phantom trips blocked, tax brackets that match your real income",
    emailHero: "A lot has changed since the last update",
    emailTagline:
      "1.1.4 is the cumulative result of six builds of work across the last two weeks. The headline is reliability — but there are two genuinely new features for drivers who don't fit the simple self-employed mould.",
    emailHighlights: [
      "**Tax brackets that match your real income** - if you have a day job, pension, or rental income alongside gig work, the dashboard tax estimate now uses your real marginal rate. Settings → Work settings → Other annual income. PAYE drivers with a £50k+ main job were silently seeing 20% basic-rate estimates when they should have been seeing 40%; that's now fixed for anyone who fills it in.",
      "**Employer mileage rates** - if your employer reimburses you for using your own car, you can now tell MileClear what they pay. Every total in the app reflects what you actually claim back, plus the gap to HMRC's 45p / 25p that you can recover through Mileage Allowance Relief on a P87. Roughly 5 million UK drivers reimburse mileage from an employer; this is for them.",
      "**Phantom trips while parked: blocked at source** - if you've ever opened the app and seen a 'trip' you never took (sat at home, on break at Aldi, somewhere you weren't), the cause was iOS occasionally falling back to cell-tower positioning when GPS dropped. Those fixes can be hundreds of metres off and look like motion. The app now refuses to act on any imprecise location, so phantom recordings simply cannot form.",
      "**Drives recorded from where you actually set off** - no more trips that mysteriously start on the A1 when you actually left from your own driveway. If your first 15-20 minutes are slow residential streets before joining a main road, that opening section is now preserved end to end.",
      "**School-run / multi-stop trips stay as one journey** - drive past a saved place at speed and the trip no longer chops into pieces. Three-layer protection: a 90-second dwell window, a position check the moment iOS fires the entry event, and a position re-check at finalize.",
      "**Tap any tax-deduction figure to see how it was calculated** - new 'Why this number?' panel on the Tax Readiness card shows the rate breakdown, the trip count and date range used, and links to the relevant HMRC pages.",
      "**Settings hub + What you see** - Profile is now split into 8 focused sub-screens. The new 'What you see' panel toggles which dashboard cards appear in plain English, instead of the hidden customisation gesture from 1.1.0.",
    ],
    items: [
      "Tax brackets you can actually trust. If you have a main job (or pension, or rental income) on top of your gig work, the dashboard tax estimate now uses your real marginal rate instead of assuming gig profit is your only taxable income. Settings → Work settings → Other annual income, enter your pre-tax salary from elsewhere, and every set-aside figure on the dashboard becomes accurate for your actual bracket. Drivers with a £50k+ main job were silently seeing basic-rate (20%) estimates when they should have been seeing 40%; that's now fixed for anyone who fills in the field. NI calculations stay tied to gig profit only because Class 4 NI is per-source.",
      "New 'Freelance / Private gig' platform tag for trips. If you do consultancy, photography, freelance bookings or anything that isn't food delivery or rideshare, you no longer have to file those trips under 'Other'. Picks the right voice and avoids the gig-platform clutter when you classify and review.",
      "Employer mileage rates. If you drive your own car for an employer who reimburses you (rather than self-employed gig work), you can now tell MileClear what they pay. Settings → Work type → Employee using own vehicle, then enter your first-10,000-miles rate and an optional after-10,000-miles tier. Every total in the app then reflects what you actually claim from your employer, not the HMRC default. The gap between your employer's rate and HMRC's 45p / 25p is what you can claim back through Mileage Allowance Relief on a P87 or self-assessment, and the new figures put that gap into your numbers all year, not just at year-end. Roughly 5 million UK drivers reimburse mileage from an employer; this update is for them.",
      "Drives that begin with slow residential streets now record from your actual departure point, not from where you joined the main road. Previously, if your first 15-20 minutes of driving were under 15 mph (school traffic, junctions, estate streets), the recording could chop those minutes off and save the trip as starting on the A1 / motorway / main road. Fixed - the watch-mode buffer is now preserved through to the saved trip, so the start address and start time match where you actually set off.",
      "Driving past a saved location no longer ends your trip. The app now waits to see if you've genuinely parked before deciding it's a real arrival, so a single drive past multiple saved geofences (school run, depot pass-through, drive-by a saved shop) stays as one continuous trip. Three layers protect against this: a 90-second dwell window, a position check at the moment iOS fires the Enter event (catches the 'iOS thinks you're in your mum's village when you're at a roundabout 2 km away' phantoms), and a position re-check at finalize.",
      "Cell-tower phantom trips fully blocked. iOS sometimes falls back to cell-tower or Wi-Fi positioning when GPS signal drops, which can place your phone hundreds of metres from where it actually is and look like motion to the app. A handful of users saw 'driving' trips appear while sat on break at Aldi, or noticed the app thinking they'd been to a saved location in a different village. The app now ignores any location fix imprecise enough to be cell-tower-derived, for both starting a new recording and confirming arrival at a saved place. Real GPS in built-up areas (50-80 m typical accuracy) flows through normally, and tunnels / multi-storey car parks are still captured during an active recording so legitimate distance isn't lost.",
      "Default geofence radius reduced from 150 m to 100 m. Tighter circles fire more reliably for real arrivals and stop overlapping with neighbouring places. The slider on the saved-location form still lets you go down to 50 m if you want a tighter parking-spot precision, or up to 500 m for a large depot.",
      "No more 'as the crow flies' trips. Auto-detected trips with too few GPS points to render properly on the map (e.g. a 14-mile 'trip' with only two coordinates that draws as a single straight line across the city) are now caught and dropped before they ever reach your trips list. Both the phone and the server side enforce the rule, so existing crow-flies trips have already been hidden too.",
      "Pickup wait timer can no longer get stuck on a runaway elapsed counter. If you ever forgot to tap 'Picked up' after a wait and the timer accumulated 49 hours of false elapsed time, the next time you opened the active recording screen the server now auto-closes any wait older than 2 hours and the timer resets to ready. Bonus: this also stops bogus multi-hour waits skewing the community wait-time medians at popular pickup points.",
      "Rating prompt redesigned to be far less interruptive. The dashboard-focus trigger that fired every time you switched to the home tab is gone; the prompt now only appears after positive moments (achievement earned, streak milestone, trip saved or classified, end-of-shift scorecard). Dismissing once gives you 14 days of peace, twice gives you 30, and after a third dismissal we stop asking entirely.",
      "New 'Rate MileClear' link in Profile → Help & Support. Opens the App Store rating screen directly, so you can leave a review on your own terms without waiting for the in-app prompt to surface.",
      "Tap the tax-deduction figure on the Tax Readiness card to see exactly how it was calculated. The new 'why this number?' panel shows the rate breakdown, the trip count and date range used, and links to the relevant HMRC pages. First number with this treatment; more to follow.",
      "Stale-state bugs in the Pro upgrade flow and the trip-save flow: under specific timing it was possible for outdated values to be persisted (wrong plan selection, missing anomaly answers). Both flows now correctly capture the latest state at the moment you tap.",
      "Live Activity now seeds with the correct buffered totals when watch-and-wait detection promotes a real trip. Previously the Live Activity could show 0.0 mi / 0:00 while the in-app screen showed the right numbers.",
      "Auth screen no longer flashes a loading spinner in front of the dashboard during sign-in. Replaced with a skeleton placeholder so the dashboard cascade reveal stays as the focal moment.",
      "Quieter background error handling. The fuel-price fallback (when the gov.uk Fuel Finder API is having a bad day) used to log every fall-through; now it logs once on transition. DVLA lookups for any registration that returns a 4xx error stop retrying for a week, so a single bad plate doesn't generate noise on every cron run.",
      "Behind-the-scenes reliability for Apple subscriptions. The server now refuses to start if the Apple In-App Purchase service fails to initialise, instead of running in a half-broken state where validate calls quietly return errors and customer purchases don't link to their accounts. Discovery and fix of a long-standing latent issue here led to several stranded paying customers being recovered.",
      "Polish across screen layouts: the 'items pending sync' top banner is fully retired, and the second wave of mobile screens is now on the unified design tokens (loading skeletons, button styles, spacing) for a consistent look between Dashboard, Trips, Active recording, and the rest of the app.",
      "iPad fix: the 'Got it' button on the Work mode explainer is now reliable on iPad regardless of which iPadOS version you're running. iPadOS 26 changed how transparent modals are presented and the old animated button could swallow the tap; the modal now declares its presentation explicitly and the CTA is a plain tappable so the touch always lands.",
    ],
  },
  {
    version: "1.1.3",
    date: "3 May 2026",
    label: "In Testing",
    items: [
      "Auto-trip detection now waits until you're actually driving before showing the Live Activity. No more '0 mi' alerts firing while you're parked in a carpark or walking past your car. The app stays quiet, watches the GPS, and only commits to a recording once it sees real driving speed.",
      "Saved-location trips (Home to Work, depot to home, anything between two of your saved places) now sync to the cloud properly. A handful of users had local-only 'Pending sync' trips that never reached the server; this update auto-recovers them on first launch, and any classifications you'd applied while they were stuck replay automatically once the underlying trip lands.",
      "New server-side watchdog notices if any trip ever gets stuck recording and finalises it for you. You no longer need to open the app to 'wake up' a recording that iOS suspended in the background.",
      "Filter trips by platform. New chip row beneath the All / Inbox / Business / Personal filters lets you tap any of Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr or Yodel and the list narrows to just that work, with the stats summary card at the top totalling for that platform alone. Composes with the existing classification + date filters, so 'Business' + 'Uber' + 'Last tax year' is one set of taps.",
      "'This tax year' and 'Last tax year' added to the date-range filter on the Trips screen. The UK tax year runs 6 April to 5 April, so before this you had to use a custom date range to pull up your full HMRC year. One tap now does it. Pairs naturally with HMRC Reconciliation and the Self Assessment wizard.",
      "Web dashboard's Trips page caught up to mobile: same chip-based date presets (Custom still gives you From / To inputs), same platform filter, same stats summary showing miles, trip count, and the business / personal split for the filtered period. Whether you classify on your phone or on the desktop, the experience is the same now.",
      "Three of the most-used screens (Dashboard, Trips, Active recording) now load with skeleton placeholders instead of a generic spinner. The shape of the screen appears instantly while data fills in, and dashboard cards animate in one after another rather than all-at-once.",
      "The 'End trip' button on the active-recording screen now requires a press-and-hold instead of a single tap, so an accidental bounce of your phone in the car cradle can't end a trip by mistake.",
      "Subtle haptic tick at every whole-mile mark while recording, so you feel progress without needing to look.",
      "Tighter copy across notifications and empty states. The app reads more like a human wrote it.",
      "The 'items pending sync' banner across the top of every screen has gone. The same information lives more usefully inside the trips list.",
      "Faster nearby community insights: queries that used to take 15+ seconds now respond instantly for most users.",
    ],
  },
  {
    version: "1.1.1",
    date: "30 April 2026",
    label: "App Store",
    ctaUrl: "https://apps.apple.com/app/mileclear/id6742044832",
    ctaLabel: "Install on the App Store",
    items: [
      "Business Mileage card was stuck showing 0 miles for everyone, regardless of how many business trips you'd actually classified. The card was hitting an internal page-size limit that silently rejected the request and rendered 0 instead of an error. Fixed - the card now uses a dedicated stats endpoint and shows a clear 'couldn't load' message if anything goes wrong, instead of failing silently.",
      "Trip recording reliability: phantom 0.1-mile trips appearing while you were actively driving. iOS occasionally suspends background processing during long drives, and the recording watchdog was treating that suspension as 'you stopped driving' and saving a tiny zero-duration trip from your starting point - while the Live Activity / Dynamic Island correctly continued tracking your real journey on the side. Fixed - the watchdog now actively verifies you've stopped before finalizing a trip, and any tiny zero-duration trip that somehow gets through is dropped automatically rather than saved.",
      "'Trip not found' error when classifying trips that hadn't finished syncing yet. If a trip's initial save to the server was still queued (network blip, app backgrounded mid-save), tapping Business or Personal would 404 against the server. Fixed - the app now waits for a trip to reach the server before sending classification updates, and the underlying sync queue rewires itself so your classifications always apply once the create completes. No more silently lost classifications.",
      "Sync queue could get stuck. A failed save would only retry on app restart or network toggle - if you stayed online and the app stayed open, queued items could sit there indefinitely. Fixed - the sync engine now retries every 60 seconds and on every app foreground, so stuck items drain automatically within a minute of conditions clearing.",
      "Pull down on the trips list to flush any stuck items and reload. A discoverable single-gesture recovery if anything ever looks wrong with your trip count.",
      "Marketing email unsubscribe link in every update / check-in / re-engagement email footer. Replaces the previous 'reply with unsubscribe' instruction with a real one-click link, plus an Email preferences toggle on the web dashboard. The mail clients that support it (Gmail, Apple Mail, Outlook) now also show a native Unsubscribe button next to the sender.",
    ],
  },
  {
    version: "1.1.0",
    date: "29 April 2026",
    label: "App Store",
    ctaUrl: "https://apps.apple.com/app/mileclear/id6742044832",
    ctaLabel: "Install on the App Store",
    items: [
      "Tax Readiness card - new dashboard widget for Work mode showing estimated tax + NI for the year, suggested set-aside this week from your real numbers, and a countdown to the 31 January filing deadline that turns amber at 90 days and red at 30. Free for all users.",
      "Higher-rate threshold warning - if your projected profit gets within £15,000 of the £50,270 higher-rate band, the dashboard tells you exactly how far away you are and reminds you to claim every business mile.",
      "Activity Heatmap - dashboard card showing when you actually drive and earn most across the last 12 weeks. 7 days × 24 hours, intensity-coloured. Filter by platform (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart) and toggle between trips and earnings. Tap any cell for the breakdown.",
      "Anonymous Benchmarking - new 'How You Compare' card showing your weekly miles and trips against the median, p25 and p75 of all UK MileClear drivers. Per-platform breakdowns light up when each platform crosses 5 active contributors. Privacy floor of 5 contributors per cell, never exposes individual data.",
      "HMRC Reconciliation - new screen letting you enter the earnings figure HMRC has on file for each platform (from your Personal Tax Account notice) and see the gap against MileClear's tracked figure. Helps drivers spot under- or over-reporting before HMRC does. Free for all users.",
      "First-time Self Assessment guide - plain-English walkthrough for drivers filing Self Assessment for the first time. Covers UTR registration, the UK tax year, what you actually pay (income tax + Class 4 NI + Class 2 NI), the AMAP mileage deduction, and the 31 January deadline.",
      "HMRC attestation cover sheet on the Self Assessment PDF - one-page signed declaration page sits in front of the existing report, with your name, UTR (blank for you to fill in), tax year period, and the contemporaneous-record attestation language HMRC inspectors recognise. Pro feature.",
      "Vehicle MOT and tax expiry reminders - MileClear now refreshes your primary vehicle's DVLA data weekly and sends a push notification when MOT or tax expires within 14 days. Tap the notification to jump straight to the vehicle.",
      "MOT History - tap 'View MOT History' on any vehicle with a registration plate to see the full DVSA record. Test results, expiry dates, advisories, defects with severity tags, and odometer growth between tests. Pulled live from the DVSA MOT History API.",
      "Pickup wait timer - tap 'Wait at pickup' on the Active Recording screen when you arrive at a restaurant or depot. The stopwatch runs while you wait; tap 'Picked up' when the order's ready. Survives app suspension. Foundation for community-aggregated 'this McDonald's averages 12-min waits' insights landing once enough drivers contribute.",
      "Earnings adoption nudge - if you're tracking trips but haven't logged earnings, the Tax Readiness card shows a one-tap shortcut to the earnings form. Drivers who don't log earnings can't see their real tax estimate.",
      "Customize Layout - show, hide and reorder dashboard cards from Profile > Customize Layout (or via the new 'Customize this dashboard' link at the bottom of the dashboard itself). Switch each card on or off, use the up/down arrows to reorder, and reset per-screen or all-at-once. Locked cards (hero, Start Trip CTA, account actions) stay put. Works across the Work dashboard, Personal dashboard, Profile, and the avatar menu.",
      "Work dashboard reordered to summary-up, detail-down - hero, Start Trip, today's recap, tax readiness and weekly goal at the top; activity heatmap, benchmark, calendar and community insights toward the bottom. Existing layouts are preserved - only fresh installs and the Reset action see the new default.",
      "Trip distance preserved when reopening a saved trip - the OSRM road-route auto-calc no longer silently overwrites the original GPS-breadcrumb-summed distance. Multi-stop trips, Deliveroo loops, anything with a detour now shows the same distance on the trips list and inside the trip itself.",
      "Lock-screen Delete on the 'Trip recorded' notification - alongside the existing Business and Personal classification buttons, you can now Delete a trip directly from the lock screen. No need to open the app to bin one you did not want recorded.",
      "Smart location-permission recovery - the dashboard's 'Auto-detection is off' card now does the right thing based on what iOS has actually been asked. If MileClear has never requested location, tapping the card fires the in-app prompt (which is what creates the Location row in iOS Settings - until you've been asked once, that row simply doesn't exist). If foreground was granted but background never asked, it fires the upgrade prompt. Only opens Settings as a last resort, with explicit step-by-step guidance.",
      "Tap the MileClear logo in the header to jump back to the dashboard from any screen - universal home button. Fixes the case where the avatar menu's tab-switch left you with no obvious way back.",
      "Business Mileage card on the work dashboard - shows your business-classified miles for the month, with prev/next chevrons to navigate back through previous months. No more digging through the trips list to total up March's claim - tap the back arrow once and it's there.",
      "Monthly History card on the personal dashboard - same month navigator as Work mode but with no classification filter, so personal-mode drivers can analyse all their driving by month. Prev/next chevrons walk back through any past month; sub-stats show trips, average miles per trip, and whether the month is in progress or complete.",
      "Date-range filter + stats summary on the Trips screen - new chip row beneath the All / Inbox / Business / Personal filters with presets for This week, This month, Last month, and Custom. Tap Custom to pick any from / to dates. When a range is active, a stats card at the top shows total miles, trip count, and the business / personal split for that period - so a driver can pick last week, see exactly what they did, and have the totals ready to hand. Composes with the classification filter (e.g. 'Business' + 'Last month' to see only your business mileage for March).",
      "Auto-trip Live Activity opt-out - new toggle in Profile > Notifications. When off, the lock-screen Dynamic Island indicator only appears when you tap Start Trip / Start Shift yourself, never on auto-detected trips. Default stays on so existing behaviour is unchanged.",
      "Driving Patterns card clarity fixes - busiest-day bars now show their actual trip counts above each bar, and the peak-hours rows show their time-block labels (Morning, Afternoon, Evening...) and ranges (08-12, 12-16, 16-20...) instead of ambiguous weather icons. Added a 'You drive most on [day] during the [time block]' insight at the bottom.",
      "Onboarding refresh - pain bullets and social proof reworked to speak to gig drivers, employees with work cars, and self-employed drivers, not just gig drivers. New step 3 captures vehicle type (Car / Van / Motorbike) so HMRC rates are correct from your first trip - a placeholder vehicle is auto-created and you can fill in make / model / MPG anytime in Profile. Employees who pick the Employee work type now get a quick 25p / 30p / 40p / 45p chip selector to set their employer reimbursement rate during setup, so the Business Mileage card shows 'owed by employer' figures from day one. The Notifications step's confusing 'Trip detection' bullet renamed to 'Classify-trip prompts' with a clarification that auto-tracking still works without these. The all-set screen now shows a real setup checklist (Location / Notifications / Vehicle / Employer rate / Goal) with green ticks and amber warnings for anything skipped.",
      "Empty-state dashboard rework - new users finishing onboarding used to land on a sea of zeros: £0 saved, 0 trips, empty heatmap, empty benchmark, empty calendar. The hero now shows a Day 1 welcome with 'Tap Start Trip the next time you drive. Your HMRC deduction starts adding up from your first business mile.' Tax Readiness and Weekly Goal stay hidden until you have at least one logged trip. The Activity Heatmap, How You Compare and Working Calendar - which all filter for business-classified trips - stay hidden until you have any business activity to display. They appear automatically as soon as you classify a trip as Business.",
      "'Classify your trips' nudge on the Tax Deduction hero - if you have trips logged but none are marked Business yet, the hero now shows an actionable prompt ('You have N trips tracked but none are marked Business. Tap any work-related trip in the Trips tab and switch its classification to start your HMRC deduction') instead of the confusing '£0 next to 123 trips' display. Tapping the hero opens the Trips tab.",
      "Bluetooth auto-trip detection removed - this never actually worked, and we're being upfront about why. Apple does not let third-party apps detect when a phone connects to a car via Bluetooth (cars use 'Bluetooth Classic', and Apple restricts that detection to MFi-certified accessories - your average Ford or Vauxhall is not MFi). The 'connect your car's Bluetooth' option in MileClear was checking nothing useful, while making it look like the feature was real. We've removed the option from vehicle setup, onboarding, the dashboard, and from the privacy / terms pages. CarPlay activation is the realistic future path for 'I'm in my car' detection - we'll revisit that when there's time to do it properly.",
      "Visible trash icon on every trip in the list - replaces the long-press-only delete that most users never tried. Long-press still works as a fallback.",
      "Auto-trip false-positive hardening for stationary drift - the detection engine now distinguishes iOS-reported speed (Kalman-filtered, trustworthy) from calculated speed (susceptible to GPS noise). Calculated speed always needs the consecutive-detection confirmation, won't fast-track at 25mph, and requires at least 3-second sample periods and 30m of real movement before counting. Saved-location fallback radius bumped to 150m. Phone-in-pocket indoor drift can no longer fake a highway-speed reading.",
      "Background-fetch trip recovery - if iOS suspends the JS runtime mid-park and your auto-trip never gets a chance to finalise, the app now wakes itself periodically (every ~15 min, iOS schedules) to finalise stale recordings and fire the 'Trip recorded - classify it' notification. You no longer need to open MileClear before your trip is recognised.",
      "Sync queue accuracy fixes - the 'X items pending sync' badge now only counts what the engine will actually attempt, so retry-exhausted rows can no longer pile up forever. Transient failures now transition to a terminal 'permanently_failed' state at the retry ceiling. Long sync batches surface 'Syncing 3 of 12...' progress text instead of an opaque spinner. First-launch hydration shows a 'Taking longer than usual' note after 8s on slow connections.",
      "Sparse-GPS-trace fix - solved the bug where iOS could suspend the JS runtime mid-trip and leave recording stuck in low-power detection mode (200m intervals instead of 50m). The recording-mode upgrade now verifies it took effect and retries automatically.",
      "Web dashboard: Footer 'For drivers' column linking all 6 niche guides (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri) plus the MileIQ comparison.",
      "API: new /business-insights/tax-snapshot, /business-insights/heatmap, /business-insights/benchmarks, /hmrc-reconciliation, /pickup-waits, /vehicles/:id/mot-history endpoints powering the dashboard cards. All free-tier; premium-gated APIs remain unchanged.",
    ],
  },
  {
    version: "1.0.10",
    date: "25 April 2026",
    label: "App Store",
    items: [
      "Active Recording screen - reachable from the Live Activity, the Dynamic Island, the persistent in-progress notification, or the new amber banner that now appears at the top of the dashboard whenever a trip is being tracked. You always know exactly when MileClear is recording, even if iOS quietly suppresses the Live Activity.",
      "Passive ongoing notification - stays on your lock screen for the duration of every auto-detected trip. Tap it to view live distance and duration, or to end the trip and save it.",
      "Every push notification now opens the screen that the message refers to. Tax-deadline reminders open Exports. Unclassified-trip nudges open the trips list pre-filtered to unclassified. Payment-failed alerts open Settings. Stuck-recording alerts open the Active Recording screen.",
      "Self Assessment wizard - a step-by-step guide that maps your MileClear data to HMRC SA103 form boxes. Shows exactly which numbers go in which boxes, with a full income tax and National Insurance breakdown.",
      "Accountant sharing - invite your accountant by email to a read-only dashboard showing your trips, mileage deductions, expenses, and earnings. They can download CSV and PDF exports without needing a MileClear account.",
      "Receipt scanning - point your camera at a parking ticket, toll receipt, or fuel receipt and it extracts the amount, date, and vendor automatically. Uses on-device processing so your images never leave your phone.",
      "Siri Shortcuts - 'Hey Siri, start my shift', 'How many miles today?', 'Log expense', 'Weekly goal progress'. Works hands-free while driving.",
      "Clearer location permission flow during onboarding - if you decline 'Always' access, you now see a plain-English card explaining what auto-detection costs (manual Start taps, missed HMRC-deductible miles) with a one-tap Open Settings link that deep-links straight to MileClear's location page. The card flips to green automatically when you return with the permission granted.",
      "Trip distances are noticeably more accurate. We now filter out GPS noise (the random spikes that used to inflate your mileage) and snap your route to actual roads using OpenStreetMap routing. Expect roughly 5-10% better accuracy on winding country lanes, and a clean polyline on the map instead of jagged jumps.",
      "Auto-detection no longer triggers when you're parked at a saved location. Setting Home, Work, or your depot now blocks the 'You started driving' notification when GPS drift makes your phone briefly look like it's moving at 15mph indoors. The legitimate 'leaving home to drive' case still works via the geofence exit.",
      "Change your password from inside the app and on the web dashboard, without needing a reset email. Useful when reset emails get filtered by Outlook, Hotmail, or other strict spam filters. Your other devices are signed out automatically; the device you change it from stays signed in.",
      "Race-condition fix: under rare conditions two anchor-exit handlers could fire concurrently and start the same recording twice. A mutex now collapses concurrent starts onto a single recording.",
      "Stuck recording watchdog - if iOS stops delivering location updates during a trip, a repeating timer now detects and saves the trip instead of leaving it stuck indefinitely.",
      "Fixed a bug where ending a long shift could lose all trip data. GPS coordinates are now preserved until trips are confirmed saved.",
      "Smarter rating prompts. Cooldown shortened from 7 to 3 days, plus a new dashboard trigger for users who don't classify trips often. Every skipped prompt now records a reason (cooldown, already rated, not enough trips, etc.) so we can fix the gates that were silently swallowing it.",
      "Diagnostic alerts now retry every 24 hours instead of every 7 days, so high-frequency drivers get repeat reminders if a problem persists. Stuck-recording detection on the server side also kicks in 15 minutes after you stop, instead of waiting 30.",
      "Per-trip GPS quality scoring. Each trip now records how clean the underlying GPS data was: percentage of high-accuracy fixes, how many outlier points were dropped, and whether the road-match succeeded. Lets us spot suspect trips without having to pull the full coordinate trace.",
      "Background app heartbeat. Your app pings the server with its tracking permissions and task state on launch and on every foreground (rate-limited to once per 24h). Catches the silent-failure case where iOS revokes background location after onboarding and detection quietly stops.",
      "Auto-classification accuracy tracking. When you change a trip's classification from the auto-suggested value, that decision is now recorded (the first time only) so we can measure how often our suggestions are correct and tune the rules over time.",
      "Fixed Apple In-App Purchase webhook verification - subscription activations that were silently failing now process correctly. Webhooks now accept both Sandbox (TestFlight beta testers) and Production (live App Store customers), and can auto-link a purchase back to your account if the normal validation call hasn't completed yet (network blip, app backgrounded mid-purchase, etc.).",
      "Web dashboard: fixed the broken vehicle icon in the sidebar that appeared after switching avatars.",
    ],
  },
  {
    version: "1.0.8",
    date: "13 April 2026",
    label: "App Store",
    items: [
      "Weekly earnings goal - set a target and track your progress with a live progress bar on the dashboard. Turns amber as you approach and green when you hit it",
      "Working calendar - a month-view heatmap showing which days you drove, how much you earned, and how many trips you did. Colour intensity by earnings so your best days stand out at a glance",
      "Business expenses - log parking, tolls, congestion charges, phone costs, equipment, and other allowable expenses. Vehicle costs (maintenance, insurance, MOT, road tax) are tracked separately because HMRC won't let you claim them alongside the mileage allowance",
      "Tax estimate - see your estimated income tax and National Insurance based on your earnings minus mileage deduction minus allowable expenses. Full breakdown by tax band, Class 2 NI, and Class 4 NI so you know roughly what to set aside",
      "Morning briefing - a daily push notification at 8am with yesterday's trips, miles, earnings, weekly goal progress, and how many trips need classifying. Personal mode gets a simpler summary without the earnings",
      "Fuel price alerts - daily notification with the cheapest fuel near your saved locations. Pulls live data from 8,300+ UK government-mandated station feeds so prices are always current",
      "Proactive tracking alerts - if MileClear detects an issue with your tracking setup (location permission missing, background task stopped, or a stuck recording), it sends you a push notification explaining what to fix. No more silent failures where trips just stop recording without you knowing",
      "Trip notifications now show your daily running total - 'Trip 4 today, 18.7 mi total' - so you can see your day building up in real time",
      "Unclassified trip badge - a red count appears on your avatar and in the navigation menu when you have trips waiting to be classified. Clears as you work through them",
      "Fixed a rare bug where trips could be lost when iOS blocked secure storage access during a background-to-foreground transition. The app now caches your auth token in memory so background trip saves never depend on the iOS keychain",
      "Fixed a bug where tapping the 'Looks like you're driving' notification could accidentally start a background recording that ran for hours. Tapping now just confirms the trip without changing the tracking mode",
      "Trips that failed to save now log the exact reason instead of failing silently. If a trip ever goes missing on this build, the diagnostics screen will tell you why",
      "Fixed stale GPS data from a previous trip bleeding into the next one. Each new recording now starts with a clean buffer so your start address and distance are always from the current drive",
      "If a trip can't sync to the server because of a local device error, it now stays saved on your phone and retries later instead of being deleted",
    ],
  },
  {
    version: "1.0.7",
    date: "11 April 2026",
    label: "App Store",
    items: [
      "Long drives now save the whole drive - fixed a bug where any trip longer than about 25 minutes would lose its opening section, so commutes and road trips with delayed finalisation were saving as only their tail end. Full route end to end now",
      "Phantom trip cycles eliminated - a pair of geofence bugs could cause iOS to fire false 'you're driving' events from indoor GPS drift or the instant a trip saved, then silently fail to fire on the real trip later. Your afternoon errands now record properly even after the phone has been sitting at home for a couple of hours",
      "Drive Detection Diagnostics screen - new under Profile > Settings. Shows a verdict banner, a plain-English problems list, and the last 50 detection events so you (or we) can see exactly what the engine is doing. If something feels off, take a screenshot and send it over for instant triage",
      "End Trip on the lock screen actually ends the trip now - tapping the button on the Live Activity flips it to a 'Saving trip' state instantly via iOS 17.2+ App Intents, then a 'Trip Complete' summary with your final distance and classify CTA",
      "New 'Trip Complete' Live Activity view - shows a checkmark, your frozen duration (HH:MM:SS for long trips), and a one-tap Classify Trip button when the trip needs classifying",
      "Trips land in the inbox faster - reverse geocoding, classification, and road-data lookups now run in parallel during finalisation instead of sequentially, and the 'Trip recorded' notification fires before the API call for auto-classified trips",
      "Fixed the runaway Trip In Progress timer that could show wildly incorrect elapsed times like '5369:16' on a fresh drive. A stale session from a previous crash no longer bleeds into new trips",
      "Fresh trip starts now clear any leftover GPS breadcrumbs from a crashed previous session, so distance and start location are always accurate",
    ],
  },
  {
    version: "1.0.6",
    date: "7 April 2026",
    label: "App Store",
    items: [
      "More accurate auto trip distances - winding routes and country lanes no longer read 5-10% short. Distances are cross-checked against UK road data so your HMRC mileage claims match your odometer",
      "Reliable trip starts - leaving home, work, or any saved location now records from the moment you drive off instead of a few hundred metres later",
      "Faster highway detection - a single motorway-speed reading is now enough to start recording, no more waiting for a second confirmation on fast roads",
      "Cold-start GPS trusted - the first location fix when leaving a garage or shaded driveway is no longer ignored while accuracy is still settling",
      "Faster permission recovery - if location access gets downgraded the app nudges you every 4 hours instead of once per day, so trips do not silently stop recording",
      "Trip Complete screen fix - long trips over an hour now display as HH:MM:SS instead of a runaway minute counter",
      "Internal diagnostics added to help pin down the remaining auto-trip edge cases reported by users",
    ],
  },
  {
    version: "1.0.5",
    date: "5 April 2026",
    label: "App Store",
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

/**
 * Pick the release marked "Latest" — the entry the Product Update email
 * announces. Returns null if no release is currently in that state
 * (e.g. mid-submission, label set to "Pending Review"); the admin send
 * flow should refuse to send when this happens.
 */
export function getLatestRelease(): ReleaseNote | null {
  return RELEASE_NOTES.find((r) => r.label === "Latest") ?? null;
}

/**
 * Build the version-specific blog-post URL on mileclear.com from a
 * release version. Used in the Product Update email footer.
 */
export function blogUrlForRelease(version: string): string {
  return `https://mileclear.com/updates/whats-new-in-version-${version.replace(/\./g, "-")}`;
}
