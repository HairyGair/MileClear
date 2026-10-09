# Insights: one figure, one source (9 Oct 2026)

For every figure the redesigned Insights screen shows, the ONE endpoint and field to use. If a card needs a figure that is not here, add it to the endpoint below rather than computing it on the phone. Never show the same fact from two sources (SPEC-UX decision 4b).

All periods are UK calendar periods: day, Monday-to-Sunday week, calendar month (`apps/api/src/lib/ukTime.ts`). Tax year is 6 April to 5 April. Phantom trips never count.

## Period figures (Week | Month)

One call per shown period: `fetchRecap("weekly" | "monthly", date, { compare: true })` → `GET /gamification/recap?period=&date=YYYY-MM-DD&compare=1`. `date` is any day inside the period (send the UK date, `YYYY-MM-DD`).

| Figure | Field | Notes |
|---|---|---|
| Miles (Personal) | `totalMiles` | all trips, any classification |
| Miles (Work) | `businessMiles` | |
| Trips | `totalTrips` (Personal), `businessTrips` (Work) | |
| Mileage claim built | `deductionPence` | the claim rule: gig trips at the approved rates, other work trips at the employer's rate when set, 10,000-mile threshold counted from 6 April (`periodClaimPence`). Show as "mileage claim", never "deduction" or "HMRC deduction". Work mode only |
| Earnings | `earningsPence`, `earningsCount` | earnings dated in the period. `earningsCount === 0` means "none this week", not "never added" |
| vs last week / month | `change.totalMilesPercent` (Personal), `change.businessMilesPercent` (Work), `change.totalTripsPercent`, `change.earningsPercent`; absolute: `previous.*` | the ONLY "vs last week" on the screen (Pro, Decision A). `null` = nothing to compare: hide the chip |
| Busiest day | `busiestDayLabel`, `busiestDayMiles` | |
| Longest trip in period | `longestTripMiles`, `longestTripDate`, `longestTripId` | |
| Period dates | `startsAt`, `endsAt` (ISO instants), `label` | |

Bars by day: local SQLite (`buildWeekDays`) is fine for the shape, but the headline numbers come from the recap.

Do NOT use for period figures: `/analytics/weekly-report` (old Trends card; it now reads the same calculation, but it is being removed), `/business-insights/pnl` (Go deeper only; same calculation), `BusinessInsights.mileTrendPercent` / `earningsTrendPercent` (same weeks, but a second copy of the comparison), `GamificationStats.weekMiles` (Home only).

## Tax year

| Figure | Endpoint + field | Notes |
|---|---|---|
| Tax-year miles | `GET /gamification/stats` `totalMiles`, `businessMiles` | this tax year only |
| Tax-year claim | `GET /gamification/stats` `deductionPence` | MileageSummary, the same rule as the period claim. Matches the Home hero (£139.33 on the demo) |
| Tax year label | `stats.taxYear` | rates from `getHmrcRatesForTaxYear(stats.taxYear)` |
| Lifetime miles (milestones) | `GET /gamification/stats` `lifetimeMiles` (new) | every mile ever, phantoms excluded. `totalMiles` resets each April, so it is wrong for lifetime milestones; Home's `MilestoneTracker` still uses `totalMiles` (not changed here) |

Not the same fact: the Home HMRC card's "£171.38 mileage deduction" (`/business-insights/tax-snapshot` `ytd.mileageDeductionPence`) is the deduction against self-employed profit, approved rates on every business trip (Anthony, 23 Sep 2026). Insights must not show it. See "Open" below.

## Running cost

`GET /business-insights/running-cost?period=week|month&date=` (free; `fetchRunningCost`).

| Figure | Field |
|---|---|
| Cost per mile | `pencePerMile` (1 dp), labelled by `source`: `"fill_ups"` = "from your fill-ups", `"estimate"` = "estimate" |
| MPG | `mpg`, `mpgSource` (`odometer` = actual, `vehicle`, `typical`) |
| Price per litre | `pencePerLitre` |
| Fuel cost for the period | `period.fillUpSpendPence` when `period.fillUps > 0`, else `period.estimatedCostPence` (miles x rate, show with "~") |

Definition (`runningCostPerMile` in `apps/api/src/lib/insightsMath.ts`): with fill-ups logged this tax year and at least 100 miles driven, fuel spend / miles driven, tax year to date (every period uses this one rate; a week's fill-ups swing with when you happen to fill up). Otherwise MPG (odometer, else the vehicle's, else 35) at the average price paid per litre (else a typical pump price). Electric: `null` (use the charging card). `/analytics/fuel-cost` `fuelCostPerMilePence` and `/business-insights` `fuelCostPerMilePence` return the same number.

## Platform league (Work, gig)

`fetchPlatformPnL("week" | "month" | "tax_year", date)` → `GET /business-insights/platform-pnl?period=&date=`. Rows come back ranked; do not re-sort.

| Figure | Field |
|---|---|
| Position | `rank` |
| Platform | `platform` (lower-case GIG_PLATFORMS value) |
| Pay per mile | `earningsPerMilePence` (null: no miles or no earnings, show "No trips tagged" / "No earnings") |
| Trips | `trips` |
| Hours | `drivingHours` (time on that platform's trips; shifts have no platform, so this is not logged-in time), `earningsPerHourPence` |
| Few trips | `fewTrips` (under 5 trips: ranked after the others, show "few trips") |
| Earned / net | `grossEarningsPence`, `netPence` (costs split by earnings share) |

The same ranking (`rankPlatforms`) feeds `/business-insights` `platformPerformance` and `bestPlatform` (tax year). Use only the league on Insights; don't show "Top platform" or "Best: X netted £" separately.

## When you drive

| Figure | Source |
|---|---|
| Pattern grid (Personal) | `GET /gamification/stats` `drivingPatterns` |
| Heatmap (Work) | `GET /business-insights/heatmap` `cells` (trips by UK hour) |
| Best paid hours (Work, Pro) | `GET /business-insights` `goldenHours[]`: `label` ("Saturday 6 PM to 7 PM"), `avgEarningsPence`, `tripCount` = days that hour was worked |
| Best earning days (by weekday) | `GET /analytics/earnings-by-day` |

Earnings are stored with a date only (`Earning.periodStart` is a DATE column; there is no time field and no shift link). Hour-of-day figures now spread a one-day earning over the hours actually worked that day (shifts, else that platform's trips, else all business trips), by minutes worked. Earnings covering several days, or on days with no recorded work, are left out of hour figures but count in totals and weekday figures. Show "best paid hours" only when `goldenHours.length > 0`. (The web dashboard's `isRealHour` filter that drops hours 0 and 1 is now unnecessary and hides real late-night hours.)

## Streaks and records

| Figure | Endpoint + field |
|---|---|
| Current streak (Work, days) | `GET /gamification/stats` `currentStreakDays` |
| Best streak | `stats.longestStreakDays` (= `personalRecords.longestStreakDays`) |
| Personal weekly streak (Decision B) | not on the server yet: weeks in a row with a trip. Compute from local trips until added; ask developer A to add it to `/gamification/stats` |
| Best day | `stats.personalRecords.mostMilesInDay`, `mostMilesInDayDate` |
| Longest trip | `personalRecords.longestSingleTrip`, `longestSingleTripDate` (no trip id yet: cell not a button) |
| Most trips in a shift (Work) | `personalRecords.mostTripsInShift`, `mostTripsInShiftDate` |

Records and streak days group trips by the database's calendar date (UTC), so a trip between 00:00 and 01:00 BST counts on the day before. The "today" check for the current streak now uses the UK date. Phantom trips are excluded from records (they were not before).

## Shift

`GET /gamification/scorecard` `deductionPence` uses the same claim rule (`periodClaimPence`, threshold aware).

## Changed on 9 Oct 2026 (what the old screen showed)

1. Week claim £72.68 (Trends) vs £99.94 (Weekly P&L): Weekly P&L valued every trip at the approved rate; recaps and the scorecard valued each trip from zero. All now `periodClaimPence`.
2. Tax-year claim £139.33 vs £171.38: different facts (claim vs self-employed deduction); Insights shows only £139.33.
3. +251% vs +235%: Business Intelligence compared business miles, Trends compared all miles (and counted phantom trips). One comparison now: the recap's `change`.
4. £0.14 vs 23.0p vs 23p: the Overview card summed the first 3 fill-ups of the month over the month's miles. One rate now.
5. Deliveroo vs Uber: one table sorted by £/mile, the other by net £. One league now, by £/mile.
6. 1-2 AM golden hours: date-only earnings read as midnight (1 AM in BST). Fixed as above.
7. "Not added" vs £562.85: the week really had no earnings (the demo's six earnings, £562.85 in all, are dated before 5 Oct); the "October 2026" card was showing this tax year's earnings and miles under the month's name. `BusinessRecapCard` month view now reads the month recap.

## Open

- Home HMRC card: "after £171.38 mileage deduction" sits under a £139.33 hero. Both are right but say "deduction". Suggest relabelling the card's figure "mileage deduction on your self-employed income" or explaining the employer-rate trips (Anthony's call; Home is outside this work).
- `usePersonalStats` asks `/trips` for `pageSize=500`; the API caps at 200 and the request fails silently. Insights no longer depends on it; Home still does.
