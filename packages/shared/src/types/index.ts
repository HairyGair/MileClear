// User types
export type WorkType = "gig" | "employee" | "both";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  fullName: string | null;
  avatarId: string | null;
  userIntent: "work" | "personal" | "both" | null;
  workType: WorkType;
  employerMileageRatePence: number | null;
  employerMileageRatePenceAfter10k: number | null;
  /** Annual income (pence) from sources outside self-employed gig work
   *  (main job salary, pension, rental, etc.). Optional: null means we
   *  treat gig profit as the user's only taxable income. Used to compute
   *  the correct marginal income-tax rate on gig profit. */
  otherAnnualIncomePence: number | null;
  /** PAYE tax already deducted by the user's employer this tax year, in
   *  pence. Subtracted from gross liability to compute the "still owed"
   *  figure on Tax Readiness. Added 10 May 2026. */
  payeAnnualPaidTaxPence?: number | null;
  /** Tax accounting basis. "cash" = count when paid; "accruals" = count
   *  when invoiced. Affects invoice → Tax Readiness aggregation. */
  taxBasis?: "cash" | "accruals";
  /** Accountant details (Laura Joyce 11 May 2026). When the annual fee
   *  is set, it gets amortised across 52 weeks and added to the Tax
   *  Readiness weekly set-aside. All three fields optional. */
  accountantName?: string | null;
  accountantContact?: string | null;
  accountantAnnualFeePence?: number | null;
  dashboardMode: "both" | "work" | "personal";
  weeklyEarningsGoalPence: number | null;
  marketingEmailsEnabled: boolean;
  emailVerified: boolean;
  // EFFECTIVE premium: true if a paid subscription, banked referral credit
  // or an entitled team membership is active. premiumSource says which. premiumExpiresAt is the subscription
  // expiry; referralProUntil is the banked referral-credit expiry.
  isPremium: boolean;
  isAdmin: boolean;
  premiumExpiresAt: string | null;
  premiumSource?: "subscription" | "referral" | "team" | "none";
  referralProUntil?: string | null;
  createdAt: string;
}

export interface WeeklyProgress {
  goalPence: number | null;
  currentWeekEarningsPence: number;
  progressPercent: number | null;
  weekStart: string;
}

export interface CalendarDay {
  date: string;
  earningsPence: number;
  miles: number;
  businessMiles: number;
  tripCount: number;
  shiftMinutes: number;
}

// Expenses
export interface Expense {
  id: string;
  userId: string;
  vehicleId: string | null;
  category: string;
  amountPence: number;
  date: string;
  description: string | null;
  vendor: string | null;
  notes: string | null;
  createdAt: string;
  vehicle?: { id: string; make: string; model: string } | null;
}

export interface ExpenseSummary {
  category: string;
  totalPence: number;
  count: number;
  deductibleWithMileage: boolean;
}

// Tax estimate
export interface TaxEstimate {
  taxYear: string;
  grossEarningsPence: number;
  mileageDeductionPence: number;
  allowableExpensesPence: number;
  vehicleExpensesPence: number;
  taxableProfitPence: number;
  incomeTaxPence: number;
  class2NiPence: number;
  class4NiPence: number;
  totalTaxOwedPence: number;
  effectiveRatePercent: number;
  expensesByCategory: ExpenseSummary[];
}

// Lightweight dashboard snapshot of tax position. Free for all users -
// purpose-built to be the "this app keeps me out of trouble in January" hook.
// Distinct from TaxEstimate (premium, full Self Assessment wizard data).
export interface TaxSnapshot {
  taxYear: string;                          // e.g. "2025-26"
  taxYearEndDate: string;                   // ISO date, 5 April
  filingDeadline: string;                   // ISO date, 31 January after year end
  daysToFilingDeadline: number;             // negative = overdue

  ytd: {
    grossEarningsPence: number;             // gig earnings + invoice income (basis-aware)
    /** Gig earnings only (CSV / Open Banking / manual). Added 10 May 2026. */
    gigEarningsPence?: number;
    /** Sole-trader invoice income. Cash basis = paid invoices only; accruals
     *  = all sent invoices. Honours User.taxBasis. Added 10 May 2026. */
    invoiceIncomePence?: number;
    /** "cash" | "accruals" — the user's selected basis at the time of
     *  snapshot. Surface this on the UI so users know which mode they're
     *  in. Added 10 May 2026. */
    taxBasis?: "cash" | "accruals";

    mileageDeductionPence: number;
    /** Allowable (non-motor) expenses netted into the estimate, matching the
     *  Self Assessment wizard. Motor costs covered by AMAP are excluded. */
    allowableExpensesPence?: number;
    taxableProfitPence: number;             // earnings - mileage - allowable expenses
    /** Gross income tax + NIC liability BEFORE PAYE offset. Useful for
     *  the "you owe £X total, your employer's already paid £Y" breakdown. */
    grossTaxLiabilityPence?: number;
    /** Tax the user's employer has already deducted via PAYE. Subtracted
     *  from gross liability to produce estimatedTaxPence. Added 10 May 2026. */
    payeAlreadyPaidPence?: number;
    estimatedTaxPence: number;              // gross liability - PAYE already paid (floored at 0)
    effectiveRatePercent: number;           // estimatedTaxPence / grossEarningsPence × 100

    // Provenance for the mileage deduction figure. Powers the "why this
    // number?" panel — tap the deduction on the dashboard to see how it
    // was derived. Audit item #5 (external_audit_may_2.md).
    mileageDeductionDerivation: NumberDerivation;

    // Cross-window comparison for the mileage deduction. Long-press the
    // figure to see the same metric in last 7 days / this month / this
    // tax year / last tax year. Layer 3 polish (premium_app_feel.md).
    mileageDeductionAcrossWindows: NumberAcrossWindows;

    /** Provenance for the gross-earnings figure. Same "why this number?"
     *  pattern as the mileage deduction. Shows the gig-earnings + invoice
     *  breakdown plus any rows that were de-duplicated against linked
     *  earnings. Added 21 May 2026 (Laura Joyce double-count fix). */
    earningsDerivation?: NumberDerivation;
    /** Number of earning rows that were excluded because a paid invoice
     *  is linked to them (and the invoice was counted instead). Zero for
     *  most users — surfaced for the "we de-duplicated N entries" hint
     *  on the breakdown card. */
    dedupedEarningCount?: number;
  };

  setAsideThisWeek: {
    earningsLast7DaysPence: number;
    suggestedSetAsidePence: number;
    rateUsedPercent: number;                // for transparency in the UI
    /** Set-aside split — tax portion. Equal to suggestedSetAside when
     *  the user has no accountant fee on file. Added 11 May 2026. */
    taxComponentPence?: number;
    /** Accountant fee component, prorated weekly. Annual fee / 52.
     *  Zero when the user hasn't entered an accountant. */
    accountantWeeklyFeePence?: number;
  };

  readiness: {
    percentComplete: number;                // 0-100
    items: ReadinessItem[];
  };

  // Surfacing-friendly flags so the dashboard can decide what to nudge.
  // Each flag is true only when the corresponding nudge should be shown.
  nudges: {
    // User has classified business trips in the last 14 days but logged
    // zero earnings in the last 30 days. Drives the "log your earnings"
    // banner in the TaxReadinessCard.
    earnings: boolean;
  };
}

export interface ReadinessItem {
  id: string;                               // stable key for UI
  label: string;
  done: boolean;
  hint?: string;                            // shown when not done
}

// "Ready for 31 January?" Self Assessment checklist (GET
// /self-assessment/checklist). Built for the tax year the next 31 January
// deadline is for (saReturnTaxYear). Money is pence, distances miles.
export type SaChecklistStatus = "done" | "attention" | "optional";

/** Where an item's button goes. Each client maps these to its own screens. */
export type SaChecklistAction =
  | "unclassified_trips"
  | "add_trip"
  | "earnings"
  | "expenses"
  | "vehicles"
  | "profile_name"
  | "self_assessment"
  | "sa_pdf";

export type SaChecklistItemId =
  | "trips_sorted"
  | "mileage_claim"
  | "earnings"
  | "expenses"
  | "vehicles"
  | "full_name"
  | "walkthrough"
  | "pdf";

export interface SaChecklistItem {
  id: SaChecklistItemId;
  status: SaChecklistStatus;
  title: string;
  /** One plain-English line about where they stand. */
  detail: string;
  action: SaChecklistAction | null;
  actionLabel: string | null;
}

export interface SaChecklist {
  /** The tax year the return is for, e.g. "2025-26". */
  taxYear: string;
  /** "6 April 2025 to 5 April 2026" */
  taxYearLabel: string;
  /** ISO instant, 23:59:59 on 31 January. */
  deadline: string;
  /** Whole UK calendar days to 31 January. 0 on the day, negative after. */
  daysToDeadline: number;
  /** 1 December to 31 January (or forced on for an admin preview). */
  inSeason: boolean;
  /** False for drivers the countdown is not for (personal-only, employees). */
  eligible: boolean;
  ineligibleReason: "personal_only" | "employee" | null;
  businessMiles: number;
  businessTrips: number;
  /** Mileage claim at HMRC's rates for that tax year (45p/25p car for 2025-26). */
  mileageClaimPence: number;
  unclassifiedTrips: number;
  unclassifiedMiles: number;
  earningsPence: number;
  earningsCount: number;
  /** Expenses claimable alongside the mileage rate (parking, tolls, phone...). */
  allowableExpensesPence: number;
  expenseCount: number;
  items: SaChecklistItem[];
  /** Items with status "attention". The PDF step is never counted. */
  attentionCount: number;
  headline: string;
}

// Cross-window comparison for a computed figure. Powers the "long-press a
// number to see how it compares across time windows" pattern. Different
// shape from NumberDerivation: derivation is "how was this calculated",
// this is "how does this compare to the same metric in other windows".
//
// Layer 3 polish (premium_app_feel.md). Pilot on the YTD mileage
// deduction; same shape extends to gross earnings, estimated tax, etc.
export interface NumberAcrossWindows {
  // What the figure represents — appears at top of the panel.
  label: string;

  // Each row is a different window of the same metric. Rendered in the
  // order the server sends them (most recent / smallest scope first).
  windows: Array<{
    /** Stable key for UI: "last7d", "thisMonth", "thisTaxYear", "lastTaxYear". */
    key: string;
    /** Display label, e.g. "Last 7 days" or "This tax year". */
    label: string;
    /** Pre-formatted value with units (£, mi, %). */
    value: string;
    /** Raw numeric in pence/miles for sorting/comparison. Undefined for empty windows. */
    raw?: number;
    /** Optional sub-label, e.g. the date range backing this window. */
    range?: string;
    /** Mark a row as the "current" or anchor figure. UI emphasises it. */
    highlight?: boolean;
  }>;

  // Optional caveat — "excludes pending trips", etc.
  notes?: string[];
}

// Provenance / "why this number?" — the canonical shape for explaining
// any computed figure shown to the user. Powers the tap-to-see-derivation
// pattern. Used first on the YTD mileage-deduction figure; the same shape
// scales to any other computed value (gross earnings, tax estimate, etc.).
//
// Audit item #5 (external_audit_may_2.md). The audit's standout idea —
// massive trust differentiator vs MileIQ.
export interface NumberDerivation {
  // One-line plain-English description of what this figure represents
  // and where it came from. Shown at the top of the panel.
  summary: string;

  // The formula in human-readable form, e.g.
  // "(10,000 mi × 45p) + (2,438 mi × 25p) = £4,500.00 + £609.50 = £5,109.50"
  formula?: string;

  // Numeric components that build up to the figure. Each row renders as
  // "label: value" in the panel; rows marked highlight render bolder.
  components: Array<{
    label: string;
    value: string;                          // pre-formatted (£, mi, %)
    highlight?: boolean;                    // emphasise key totals
  }>;

  // Source rollups — "we used N trips between X and Y". Helps the user
  // verify the derivation against their own records.
  sources?: Array<{
    kind: string;                           // e.g. "trips", "earnings"
    count: number;
    description: string;                    // e.g. "Business trips in tax year 2025-26"
    dateRange?: { from: string; to: string };
  }>;

  // Free-text caveat shown beneath the components. Use for HMRC-rate
  // citations, "excludes XYZ", "applies to UK gig drivers only", etc.
  notes?: string[];
}

// Activity heatmap: 7 day-of-week × 24 hour-of-day cells. Powers the
// "best time to drive" dashboard view. Earnings figures are bucketed by
// the earning record's periodStart - accurate for users who log earnings
// per shift, less accurate for users who log monthly totals.
export interface HeatmapCell {
  dayOfWeek: number;                        // 0 = Sunday, 6 = Saturday
  hour: number;                             // 0-23
  tripCount: number;
  totalMiles: number;
  totalEarningsPence: number;
}

export interface HeatmapPlatformOption {
  platform: string;                         // PlatformTag value
  label: string;                            // e.g. "Uber / Uber Eats"
  tripCount: number;                        // trips for this platform in window
}

export interface ActivityHeatmap {
  weeksAnalyzed: number;
  filteredPlatform: string | null;          // platform filter applied, null = all
  availablePlatforms: HeatmapPlatformOption[];
  totalTrips: number;
  totalEarningsPence: number;
  cells: HeatmapCell[];                     // sparse - only non-zero cells
}

// Anonymous benchmarking. Aggregated across all UK active drivers in the
// last 30 days. Privacy floor: any bucket with fewer than MIN_CONTRIBUTORS
// drivers is suppressed (marked as `available: false`) - never exposed.
//
// Designed to scale gracefully: as the user base grows, more buckets light
// up automatically without any code changes. National-level always works
// once we have 5+ active drivers; per-platform lights up as each platform
// crosses 5+ contributors; regional buckets are deferred until 200+ active.
export interface BenchmarkComparison {
  available: boolean;                       // false when N<5 contributors
  contributors: number;                     // drivers in this bucket
  yourValue: number | null;                 // null if you have no data here
  median: number;
  p25: number;
  p75: number;
  yourPercentile: number | null;            // 0-100, null if no data
  unit: "miles" | "trips" | "pence";
}

export interface PlatformBenchmark {
  platform: string;
  label: string;
  trips: BenchmarkComparison;
  miles: BenchmarkComparison;
}

export interface BenchmarkSnapshot {
  windowDays: number;                       // 30 by default
  totalActiveDrivers: number;               // overall context
  // National-level activity benchmarks across all platforms.
  national: {
    weeklyMiles: BenchmarkComparison;
    weeklyTrips: BenchmarkComparison;
  };
  // Per-platform breakdowns - only platforms with >=5 contributors are emitted.
  platforms: PlatformBenchmark[];
  // Friendly explanation if some buckets are limited.
  limitedDataNote: string | null;
}

// "Drivers near you": the same anonymous benchmarking idea, scoped to the
// driver's home postcode AREA (LS, B, GL...). Peers are drivers whose home
// area matches and who drove in at least 2 of the last 4 complete weeks.
// Privacy: a group under 5 drivers is never used (falls back to region, then
// the whole UK, and `level` says which); the middle-half range is only sent
// for 10+ drivers; no individual value, minimum or maximum is ever returned,
// and group figures are rounded.
export type LocalBenchmarkLevel = "area" | "region" | "national";
export type LocalBenchmarkMode = "work" | "personal";

export interface LocalBenchmarkStat {
  /** Group median, rounded. */
  median: number;
  /** Middle half of the group (25th to 75th percentile), null under 10 drivers. */
  low: number | null;
  high: number | null;
  /** The requesting driver's own value (null when they have no trips in the window). */
  you: number | null;
  /**
   * How many in 10 of the other drivers in the group are below you (0-10),
   * null when you have not driven in at least 2 of the 4 weeks.
   */
  youAheadOfPerTen: number | null;
}

export interface LocalBenchmark {
  available: boolean;
  /** Why it is unavailable: too few drivers anywhere, or no data at all. */
  reason: "ok" | "not_enough_drivers";
  /** Which peer group is used: your area, your region, or the whole UK. Null when unavailable. */
  level: LocalBenchmarkLevel | null;
  /** Your home postcode area, when known (shown even when the group is too small). */
  area: { code: string; name: string; region: string } | null;
  /** Your region, when known. */
  region: string | null;
  /** Human label for the group used: "Leeds (LS)", "Yorkshire and the Humber", "the UK". */
  scopeLabel: string | null;
  /** Drivers in the group used, always 5 or more when available, else null. */
  peerCount: number | null;
  /** work compares business miles; personal compares all miles. */
  mode: LocalBenchmarkMode;
  /** The 4 complete weeks (Monday to Monday) the figures cover. */
  window: { start: string; end: string; weeks: number };
  /** Weeks (0-4) in which you drove; under 2 means you are not ranked yet. */
  youWeeksActive: number;
  /** Miles per week: business miles in work mode, all miles in personal mode. */
  weeklyMiles: LocalBenchmarkStat | null;
  /** Mileage claim value per week in pence at the HMRC rate for each trip's tax year. */
  weeklyClaimPence: LocalBenchmarkStat | null;
  weeklyTrips: LocalBenchmarkStat | null;
  /** Share of trips marked business or personal, 0-100. */
  classifiedPct: LocalBenchmarkStat | null;
  generatedAt: string;
}

// Vehicle types
export type FuelType = "petrol" | "diesel" | "electric" | "hybrid";
export type VehicleType = "car" | "motorbike" | "van";

export interface Vehicle {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number | null;
  fuelType: FuelType;
  vehicleType: VehicleType;
  registrationPlate: string | null;
  bluetoothName: string | null;
  estimatedMpg: number | null;
  actualMpg: number | null;
  /** EV energy efficiency, miles per kWh — the electric analogue of MPG, used
   *  for cost-per-mile on electric vehicles. */
  milesPerKwh: number | null;
  isPrimary: boolean;
  /** Set when the DVLA cannot answer for the plate, so MOT and tax reminders
   *  are off: "not_found" (no record) or "invalid" (not a plate it accepts).
   *  Optional because older API responses do not carry it. */
  dvlaPlateProblem?: "not_found" | "invalid" | null;
  /** A look-alike correction the DVLA confirmed it knows, e.g. "DL74ONT". */
  dvlaPlateSuggestion?: string | null;
}

export interface VehicleLookupResult {
  registrationNumber: string;
  make: string;
  yearOfManufacture: number | null;
  fuelType: FuelType;
  colour: string | null;
  engineCapacity: number | null;
  co2Emissions: number | null;
  taxStatus: string | null;
  motStatus: string | null;
  // ISO date strings from DVLA. Used by the vehicle-reminders cron to push
  // expiry warnings 14 days before MOT or tax runs out.
  motExpiryDate: string | null;
  taxDueDate: string | null;
  // Emissions data for Clean Air Zone / ULEZ compliance (assessCleanAirZones).
  euroStatus: string | null;
  firstRegistration: string | null; // "YYYY-MM"
}

// MOT history from the DVSA MOT History API. Each test includes advisories
// and defects so drivers can see what was flagged at last inspection.
export type MotDefectType =
  | "ADVISORY"
  | "FAIL"
  | "MAJOR"
  | "MINOR"
  | "DANGEROUS"
  | "PRS"
  | "USER ENTERED";

export interface MotDefect {
  text: string;
  type: MotDefectType;
  dangerous: boolean;
}

export interface MotTestRecord {
  completedDate: string;        // ISO datetime
  testResult: string;           // PASSED / FAILED / etc
  expiryDate: string | null;    // ISO date - present on PASSED tests only
  odometerValue: number | null;
  odometerUnit: string | null;  // "mi" or "km"
  motTestNumber: string;
  defects: MotDefect[];
}

export interface MotHistoryResult {
  registrationNumber: string;
  make: string | null;
  model: string | null;
  firstUsedDate: string | null;
  fuelType: string | null;
  primaryColour: string | null;
  motTests: MotTestRecord[];
}

// HMRC Digital Platform Reporting reconciliation. Each row pairs the user's
// own tracked earnings on a platform with the figure HMRC will see (the
// platform reports it under the OECD Model Reporting Rules, mandatory since
// January 2024). The diff lets drivers spot under- or over-reporting before
// HMRC does.
export interface ReconciliationRow {
  platform: string;                       // platform tag value
  label: string;                          // human-readable label
  hmrcReportedPence: number | null;       // null if user hasn't entered yet
  mileclearTrackedPence: number;          // sum of earnings logged in the year
  diffPence: number | null;               // hmrc - mileclear (positive = under-reported)
  notes: string | null;
  updatedAt: string | null;               // ISO, when user last entered the figure
}

export interface ReconciliationSummary {
  taxYear: string;
  rows: ReconciliationRow[];
  totals: {
    hmrcReportedPence: number;            // sum of non-null hmrc figures
    mileclearTrackedPence: number;        // sum of all tracked
    diffPence: number;                    // hmrc - mileclear
    completedPlatforms: number;           // how many user has entered
    totalPlatforms: number;
  };
}

// Pickup-point wait time. Drivers tap "Wait" when they arrive at a
// restaurant / depot, then "Picked up" when the order's ready.
export interface PickupWait {
  id: string;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  platform: string | null;
  startedAt: string;                       // ISO
  endedAt: string | null;
  durationSeconds: number | null;
}

// Community-aggregated wait insights at a pickup location. Pro feature.
// Privacy-floored at 5 contributors. Returned as `available: false` if
// either the user is not Pro (gated upstream) or the floor isn't met.
export interface PickupWaitInsight {
  available: boolean;
  contributors: number;                    // distinct users contributing
  sampleCount: number;                     // total waits sampled
  medianSeconds: number;
  p25Seconds: number;
  p75Seconds: number;
  longestSeconds: number;
  shortestSeconds: number;
  // Per-platform breakdowns where each platform has 5+ contributors.
  platforms: {
    platform: string;
    label: string;
    contributors: number;
    medianSeconds: number;
  }[];
  locationName: string | null;             // most-common name in the cluster
}

// Shift types
export type ShiftStatus = "active" | "completed";

export interface Shift {
  id: string;
  userId: string;
  vehicleId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: ShiftStatus;
}

// Trip types
export type TripClassification = "business" | "personal" | "unclassified";
export type TripCategory =
  | "commute"
  | "school_run"
  | "road_trip"
  | "shopping"
  | "social"
  | "errands"
  | "leisure"
  | "medical"
  | "airport"
  | "other";
export type PlatformTag =
  | "uber"
  | "deliveroo"
  | "just_eat"
  | "amazon_flex"
  | "stuart"
  | "gophr"
  | "dpd"
  | "yodel"
  | "evri"
  | "freelance"
  | "other";

export type BusinessPurpose =
  | "client_meeting"
  | "site_visit"
  | "office_travel"
  | "training"
  | "conference"
  | "sales_call"
  | "field_service"
  | "delivery"
  | "airport_pickup"
  | "other";

export interface Trip {
  id: string;
  userId: string;
  shiftId: string | null;
  vehicleId: string | null;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  startedAt: string;
  endedAt: string | null;
  isManualEntry: boolean;
  classification: TripClassification;
  platformTag: PlatformTag | null;
  businessPurpose: BusinessPurpose | null;
  category: TripCategory | null;
  notes: string | null;
  /** Odometer readings (miles) corroborating the GPS distance. */
  odometerStart: number | null;
  odometerEnd: number | null;
  /** Edit audit trail — bumped whenever the trip is changed. */
  updatedAt?: string;
  createdAt?: string;
  syncedAt: string | null;
  /** How the current classification was decided: "pattern_learning" (quiet,
   *  server, same A->B pair, undoable), "place_pair" (quiet, server, the same
   *  two places in either direction, undoable), "user", or "user_undo".
   *  Absent on older rows. */
  classificationSource?: string | null;
  /** Present only while a quiet classification is still undoable. */
  autoClassifiedAt?: string | null;
  preAutoClassification?: string | null;
  /** Inline classification hint for unclassified rows on the list response. */
  suggestion?: {
    classification: string;
    platformTag: string | null;
    businessPurpose: string | null;
    category: string | null;
    confidence: number;
    matchCount: number;
  } | null;
}

export interface TripCoordinate {
  id: string;
  tripId: string;
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
}

export interface TripAnomaly {
  id: string;
  tripId: string;
  userId: string;
  type: string;
  question: string;
  response: string;
  customNote: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

export interface TripInsights {
  topSpeedMph: number;
  avgSpeedMph: number;
  avgMovingSpeedMph: number;
  timeMovingSecs: number;
  timeStoppedSecs: number;
  routeEfficiency: number;
  longestNonStopMiles: number;
  numberOfStops: number;
  coordCount: number;
  speedFunFact: string | null;
  distanceFunFact: string | null;
  routeDirectnessNote: string | null;
}

// Fuel types
export interface FuelLog {
  id: string;
  userId: string;
  vehicleId: string | null;
  litres: number;
  costPence: number;
  stationName: string | null;
  odometerReading: number | null;
  latitude: number | null;
  longitude: number | null;
  loggedAt: string;
}

export interface FuelStation {
  siteId: string;
  brand: string;
  stationName: string;
  address: string;
  postcode: string;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  prices: {
    E10?: number;   // unleaded (pence/litre)
    E5?: number;    // super unleaded
    B7?: number;    // diesel
    SDV?: number;   // super diesel
  };
  /** When each price was last reported (ISO). From the Fuel Finder API per
   *  price; from the retailer feed's own timestamp otherwise. Optional so
   *  older cached shapes stay valid. */
  pricesUpdatedAt?: {
    E10?: string;
    E5?: string;
    B7?: string;
    SDV?: string;
  };
}

/** @deprecated Use FuelStation instead */
export type CommunityFuelStation = FuelStation;

export interface NationalAveragePrices {
  petrolPencePerLitre: number;
  dieselPencePerLitre: number;
  date: string;
}

// ── EV charging (mirrors the fuel feature for electric drivers) ──────────────

/** A public EV charge point, from Open Charge Map. */
export interface ChargePoint {
  id: string;
  name: string;
  operator: string | null;
  address: string;
  postcode: string | null;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  /** "public" | "membership" | "pay_at_location" | "restricted" | "unknown". */
  access: string;
  /** Distinct connector summaries, e.g. "CCS 50kW", "Type 2 22kW". */
  connectors: { type: string; powerKw: number | null; count: number }[];
  /** Max power across connectors (kW), for sorting/labelling. */
  maxPowerKw: number | null;
  /** Free-text cost note from OCM (no structured per-kWh price exists). */
  costNote: string | null;
}

export interface NearbyChargersResponse {
  chargers: ChargePoint[];
  attribution: string; // OCM requires visible attribution
  lastUpdated: string;
}

/** Current home-electricity reference rate, optionally Octopus-sourced. */
export interface ElectricityRate {
  pencePerKwh: number;
  source: "octopus_agile" | "default" | "user";
  region: string | null;
  asOf: string;
}

/** GET /fuel/cheapest-today: the line at the top of the fuel tab, built by
 *  the same rule as the morning "cheapest fuel near you" push. */
export interface CheapestFuelToday {
  kind: "fuel";
  /** "petrol" (E10) or "diesel" (B7). Hybrids use petrol. */
  fuel: "petrol" | "diesel";
  stationName: string;
  pencePerLitre: number;
  distanceMiles: number;
  latitude: number;
  longitude: number;
  /** Median of the fresh prices within the search radius. */
  localAveragePence: number;
  nationalAveragePence: number | null;
  /** Pence per litre under the local average (0 or more). */
  underLocalPence: number;
  radiusMiles: number;
  stationCount: number;
  /** Where the search centred: their usual trip start, or their saved home. */
  startSource: "trip_starts" | "saved_home";
  /** One plain sentence, the same one the push would use. */
  line: string;
  /** Whether the push rule would send this today (at least 3p under). */
  worthAlerting: boolean;
}

export interface EvRunningCostToday {
  kind: "ev";
  milesPerKwh: number;
  milesPerKwhIsDefault: boolean;
  homePencePerKwh: number;
  homeRateSource: "user" | "octopus_agile" | "default";
  publicPencePerKwh: number;
  publicRateIsDefault: boolean;
  homePencePerMile: number;
  publicPencePerMile: number;
  line: string;
}

export interface CheapestTodayResponse {
  /** null when there is nothing honest to say (no vehicle, no location, too
   *  few stations with fresh prices). */
  data: CheapestFuelToday | EvRunningCostToday | null;
  reason?: string;
}

/** One event on the Road alerts screen (road alerts trial, Oct 2026). */
export interface RoadAlertItem {
  id: string;
  source: "tomtom" | "street_manager";
  severity: "closure" | "major" | "minor";
  category:
    | "road_closed"
    | "lane_closed"
    | "accident"
    | "broken_down_vehicle"
    | "roadworks"
    | "flooding"
    | "hazard"
    | "event"
    | "other";
  /** "now": in effect at the moment. "upcoming": starts in the next 7 days. */
  when: "now" | "upcoming";
  /** "M6 southbound closed" */
  headline: string;
  /** "M6 southbound is closed from J14 to J13 until about 10:00." */
  sentence: string;
  road: string | null;
  direction: string | null;
  from: string | null;
  to: string | null;
  town: string | null;
  delayMinutes: number | null;
  startAt: string | null;
  endAt: string | null;
  /** Days in the last 6 weeks the driver used this stretch. */
  daysOnRoute: number;
  // One item is one closure: both carriageways, every night of a repeating
  // closure, and every street of one road plan are merged (Oct 2026).
  // Optional so older APIs still type-check.
  /** In place for more than 3 days: listed apart, never on the dashboard. */
  ongoing?: boolean;
  /** Named roads involved, road numbers first. */
  roads?: string[];
  bothDirections?: boolean;
  /** Distinct time windows merged (nights of an overnight closure). */
  occurrences?: number;
  recurring?: boolean;
  /** Source event ids merged into this item. */
  memberIds?: string[];
  centre?: { lat: number; lng: number } | null;
  /** The closed stretch for the card's small map (a single point when the
   *  source gave no line). */
  line?: { lat: number; lng: number }[];
  /** Works company, short form ("BT"), on week-ahead items only. */
  promoter?: string | null;
}

/** GET /road-alerts */
export interface RoadAlertsResponse {
  data: {
    /** The driver turned road alerts on (off by default). */
    enabled: boolean;
    /** At least one data source is configured on the server. */
    available: boolean;
    /** Planned works coverage (Street Manager is England only), or null. */
    plannedWorksCoverage: "england" | null;
    /** Show the one-time offer card: not on yet, and enough recent driving. */
    offerEligible: boolean;
    /** The driver has enough repeat driving for "usual roads" to exist. */
    hasUsualRoads: boolean;
    current: RoadAlertItem[];
    upcoming: RoadAlertItem[];
    /** Closures in place for more than 3 days (absent from older APIs). */
    ongoing?: RoadAlertItem[];
    /** Planned works starting in the week in view (the rest of this week, or
     *  on a Sunday the Monday to Sunday ahead), most disruptive first, at
     *  most 5. Absent from older APIs. */
    weekAhead?: RoadAlertItem[];
    /** How many more week-ahead items there were past the 5. */
    weekAheadMore?: number;
    /** Credit lines the data licences require; show them under the list. */
    attribution: string[];
    updatedAt: string;
  };
}

export interface NearbyPricesResponse {
  stations: FuelStation[];
  nationalAverage: NationalAveragePrices | null;
  lastUpdated: string;
}

export interface FuelLogWithVehicle extends FuelLog {
  vehicle: { id: string; make: string; model: string; fuelType: FuelType } | null;
}

// Earnings types
export type EarningSource = "manual" | "csv" | "open_banking" | "ocr";

export interface Earning {
  id: string;
  userId: string;
  platform: string;
  amountPence: number;
  periodStart: string;
  periodEnd: string;
  source: EarningSource;
  externalId: string | null;
  notes: string | null;
}

// Plaid Open Banking
export type PlaidConnectionStatus = "active" | "disconnected" | "error";

export interface PlaidConnection {
  id: string;
  userId: string;
  institutionId: string | null;
  institutionName: string | null;
  lastSynced: string | null;
  status: PlaidConnectionStatus;
  createdAt: string;
}

// CSV Import
export interface CsvEarningRow {
  platform: string;
  amountPence: number;
  periodStart: string;
  periodEnd: string;
  externalId: string;
  isDuplicate: boolean;
}

export interface CsvParsePreview {
  platform: string;
  rows: CsvEarningRow[];
  totalAmountPence: number;
  duplicateCount: number;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
}

// ── Trip CSV import (bringing history over from another app) ───────
//
// Deliberately format-agnostic. Rather than templating each rival's
// export (which breaks the moment they change a column), the parser
// maps columns by header synonyms and, where a header is ambiguous,
// by sniffing the values. "Start" means a time in one app and a place
// in another, so the data decides.

/** Which CSV column was matched to each field, for the preview UI. */
export interface TripCsvColumnMap {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  from: string | null;
  to: string | null;
  distance: string | null;
  classification: string | null;
  purpose: string | null;
}

export interface CsvTripRow {
  /** ISO date (yyyy-mm-dd) of the journey. */
  date: string;
  startTime: string | null;
  endTime: string | null;
  from: string | null;
  to: string | null;
  distanceMiles: number;
  classification: TripClassification;
  purpose: string | null;
  /** Already on the account: same day, same distance. Skipped on import. */
  isDuplicate: boolean;
}

/** A row we could not use, kept so the user sees what was left behind. */
export interface CsvTripRowError {
  /** 1-based line number in the uploaded file. */
  line: number;
  reason: string;
}

export interface CsvTripParsePreview {
  /** Best guess at the source app, purely for the confirmation copy. */
  detectedSource: string | null;
  columns: TripCsvColumnMap;
  /** True when distances were converted from kilometres. */
  convertedFromKm: boolean;
  rows: CsvTripRow[];
  totalRows: number;
  totalMiles: number;
  duplicateCount: number;
  errors: CsvTripRowError[];
}

export interface CsvTripImportResult {
  imported: number;
  skippedDuplicates: number;
  skippedErrors: number;
  totalMiles: number;
}

// Achievement types
export interface Achievement {
  id: string;
  userId: string;
  type: string;
  achievedAt: string;
}

// Mileage summary
export interface MileageSummary {
  id: string;
  userId: string;
  taxYear: string;
  totalMiles: number;
  businessMiles: number;
  deductionPence: number;
}

// Sync types
export type SyncStatus = "pending" | "synced" | "failed";

export interface SyncQueueItem {
  id: string;
  entityType: "trip" | "shift" | "fuel_log" | "earning";
  entityId: string;
  action: "create" | "update" | "delete";
  status: SyncStatus;
  createdAt: string;
}

// API response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Export types
export interface ExportTripRow {
  date: string;
  startTime: string;
  endTime: string | null;
  startAddress: string | null;
  endAddress: string | null;
  /** Filled for the CSV export only (services/postcodeLookup.ts); null when
   *  the point has no UK postcode or the lookup failed. */
  startPostcode?: string | null;
  endPostcode?: string | null;
  distanceMiles: number;
  classification: TripClassification;
  platform: string | null;
  businessPurpose: string | null;
  /** The driver's Project / client label, if they gave one. */
  projectLabel: string | null;
  vehicleType: VehicleType | null;
  vehicleName: string | null;
  hmrcRatePence: number;
  deductionPence: number;
}

export interface ExportVehicleBreakdown {
  vehicleName: string;
  vehicleType: VehicleType;
  totalMiles: number;
  businessMiles: number;
  deductionPence: number;
}

export interface ExportEarningsByPlatform {
  platform: string;
  totalPence: number;
}

export interface ExportMonthlyBreakdown {
  month: string;
  trips: number;
  miles: number;
  businessMiles: number;
  deductionPence: number;
}

export interface ExportSummary {
  taxYear: string;
  totalTrips: number;
  totalMiles: number;
  businessMiles: number;
  personalMiles: number;
  vehicleBreakdown: ExportVehicleBreakdown[];
  monthlyBreakdown: ExportMonthlyBreakdown[];
  totalDeductionPence: number;
  totalEarningsPence: number;
  earningsByPlatform: ExportEarningsByPlatform[];
  generatedAt: string;
  userName: string;
}

// Waitlist
export interface WaitlistEntry {
  id: string;
  email: string;
  driverType: string | null;
  signedUpAt: string;
}

// Saved Location types
export type LocationType = "home" | "work" | "depot" | "custom";

export interface SavedLocation {
  id: string;
  userId: string;
  name: string;
  locationType: LocationType;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  geofenceEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Billing types
export interface BillingStatus {
  isPremium: boolean;
  premiumExpiresAt: string | null;
  subscriptionStatus: "active" | "canceled" | "past_due" | "none";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  subscriptionPlatform: "apple" | "google" | "stripe" | "none";
  // Whether the active Pro comes from a paid subscription, banked referral
  // credit or a team ("team": no subscription to manage). referralProUntil is the referral-credit expiry (null if none).
  premiumSource?: "subscription" | "referral" | "team" | "none";
  referralProUntil?: string | null;
}

// Referral program
export interface ReferralSummary {
  code: string;
  shareUrl: string;
  maxRewards: number;
  earnedMonths: number;
  pendingCount: number;
  referralProUntil: string | null;
  referrals: Array<{ status: string; createdAt: string; rewardGrantedAt: string | null }>;
}

// Gamification types
export interface PersonalRecords {
  mostMilesInDay: number;
  mostMilesInDayDate: string | null;
  mostTripsInShift: number;
  mostTripsInShiftDate: string | null;
  longestSingleTrip: number;
  longestSingleTripDate: string | null;
  longestStreakDays: number;
}

export interface DrivingPatterns {
  /** Trips per day of week: index 0 = Monday, 6 = Sunday */
  dayOfWeek: number[];
  /** Trips per 4-hour block: 0=00-04, 1=04-08, 2=08-12, 3=12-16, 4=16-20, 5=20-24 */
  timeOfDay: number[];
  /** Average trips per week (based on weeks with at least one trip) */
  avgTripsPerWeek: number;
  /** Top visited destinations (end addresses) */
  topPlaces: { name: string; count: number }[];
}

export interface GamificationStats {
  taxYear: string;
  totalMiles: number;
  businessMiles: number;
  deductionPence: number;
  currentStreakDays: number;
  longestStreakDays: number;
  totalTrips: number;
  totalShifts: number;
  todayMiles: number;
  todayTrips: number;
  weekMiles: number;
  personalRecords: PersonalRecords;
  region?: string;
  drivingPatterns?: DrivingPatterns;
  /**
   * Unclassified trips for the current tax year. Drives the dashboard's
   * "review your classifications" nudge when the user has many trips
   * tracked but few classified as business — otherwise £1.67 next to 100+
   * tracked trips looks like the calc is broken when it's actually
   * classification that's the gap.
   */
  unclassifiedTrips?: number;
}

export interface AchievementWithMeta {
  id: string;
  type: string;
  achievedAt: string;
  label: string;
  description: string;
  emoji: string;
}

export interface ShiftScorecard {
  shiftId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  tripsCompleted: number;
  totalMiles: number;
  businessMiles: number;
  deductionPence: number;
  isPersonalBestMiles: boolean;
  isPersonalBestTrips: boolean;
  newAchievements: AchievementWithMeta[];
}

export interface PeriodRecap {
  period: "daily" | "weekly" | "monthly";
  label: string;
  totalMiles: number;
  businessMiles: number;
  deductionPence: number;
  totalTrips: number;
  busiestDayLabel: string | null;
  busiestDayMiles: number;
  longestTripMiles: number;
  longestTripDate: string | null;
  shareText: string;
}

// Business Insights types
export interface PlatformPerformance {
  platform: string;
  totalEarningsPence: number;
  tripCount: number;
  totalMiles: number;
  earningsPerMilePence: number;   // £/mile
  earningsPerTripPence: number;   // £/trip
  avgTripMiles: number;
}

export interface ShiftPerformance {
  shiftId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  tripsCompleted: number;
  totalMiles: number;
  businessMiles: number;
  earningsPence: number;          // earnings during this shift window
  earningsPerMilePence: number;
  earningsPerHourPence: number;
  utilisationPercent: number;     // % of shift time moving
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface BusinessInsights {
  // Overall efficiency (current tax year)
  totalEarningsPence: number;
  totalBusinessMiles: number;
  totalShiftHours: number;
  earningsPerMilePence: number;
  earningsPerHourPence: number;
  avgTripsPerShift: number;
  deductionPence: number;

  // Platform comparison
  platformPerformance: PlatformPerformance[];
  bestPlatform: string | null;

  // Peak performance
  goldenHours: GoldenHour[];       // top 3 most profitable hours
  busiestDay: string | null;       // day of week
  avgShiftGrade: string | null;

  // Fuel economy
  fuelCostPerMilePence: number | null;
  actualMpg: number | null;
  estimatedFuelCostPence: number | null;  // estimated total fuel spend

  // Recent shift grades
  recentShifts: ShiftPerformance[];

  // Week-on-week trends
  earningsTrendPercent: number | null;    // vs previous period
  mileTrendPercent: number | null;
}

export interface GoldenHour {
  dayOfWeek: string;              // "Monday", "Tuesday", etc.
  hour: number;                   // 0-23
  label: string;                  // "Friday 6–7 PM"
  avgEarningsPence: number;       // average earnings in this slot
  tripCount: number;
}

export interface WeeklyPnL {
  periodLabel: string;
  grossEarningsPence: number;
  estimatedFuelCostPence: number;
  estimatedWearCostPence: number; // industry standard ~8p/mile
  netProfitPence: number;
  hmrcDeductionPence: number;
  businessMiles: number;
  totalTrips: number;
}

// ── Driving Analytics ────────────────────────────────────────────────

export interface WeeklyReport {
  weekLabel: string;               // "24 Feb – 2 Mar 2026"
  // Business stats
  business: {
    miles: number;
    trips: number;
    deductionPence: number;
    earningsPence: number;
    shifts: number;
    avgShiftHours: number;
    bestShiftGrade: string | null;
    fuelCostPence: number | null;
    topPlatform: string | null;
  };
  // Personal stats
  personal: {
    miles: number;
    trips: number;
    avgTripMiles: number;
    longestTripMiles: number;
  };
  // Combined
  totalMiles: number;
  totalTrips: number;
  streakDays: number;
  newAchievements: string[];       // achievement type labels earned this week
  // Comparison to previous week
  milesDelta: number | null;       // percentage change vs prev week
  tripsDelta: number | null;
  earningsDelta: number | null;
}

export interface FrequentRoute {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress: string;
  endAddress: string;
  tripCount: number;
  avgDurationMinutes: number;
  fastestDurationMinutes: number;
  avgDistanceMiles: number;
  classification: string;          // most common classification
  platformTag: string | null;      // most common platform
  dayBreakdown: number[];          // trips per day: 0=Mon..6=Sun
  timeBreakdown: number[];         // trips per 4-hour block: 0=00-04..5=20-24
}

export interface ShiftSweetSpot {
  durationBucket: string;          // "4-6 hrs", "6-8 hrs", etc.
  shiftCount: number;
  avgEarningsPerHourPence: number;
  avgTrips: number;
  avgMiles: number;
  totalEarningsPence: number;
}

export interface FuelCostBreakdown {
  actualMpg: number | null;
  estimatedMpg: number | null;
  fuelCostPerMilePence: number | null;
  totalFuelCostPence: number;
  totalMilesDriven: number;
  perVehicle: {
    vehicleId: string;
    make: string;
    model: string;
    fuelType: string;
    mpg: number | null;
    costPerMilePence: number | null;
    totalCostPence: number;
    milesDriven: number;
  }[];
  recentFillUps: {
    date: string;
    litres: number;
    costPence: number;
    costPerLitrePence: number;
    stationName: string | null;
  }[];
}

export interface EarningsDayPattern {
  day: string;                     // "Monday", "Tuesday", etc.
  dayIndex: number;                // 0=Mon..6=Sun
  totalEarningsPence: number;
  avgEarningsPence: number;
  tripCount: number;
  entryCount: number;              // earning entries (not trips)
}

export interface CommuteTiming {
  routeLabel: string;              // "Home → Work"
  locationFrom: string;
  locationTo: string;
  avgDurationMinutes: number;
  bestDurationMinutes: number;
  worstDurationMinutes: number;
  bestDepartureHour: number;       // hour (0-23) with shortest avg duration
  bestDepartureLabel: string;      // "Leave by 7am"
  byHour: {
    hour: number;
    avgMinutes: number;
    tripCount: number;
  }[];
}

export interface DrivingAnalytics {
  weeklyReport: WeeklyReport;
  frequentRoutes: FrequentRoute[];
  shiftSweetSpots: ShiftSweetSpot[];       // business only
  fuelCost: FuelCostBreakdown;
  earningsByDay: EarningsDayPattern[];     // business only
  commuteTiming: CommuteTiming[];
}

// Feedback types
export type FeedbackCategory = "feature_request" | "bug_report" | "improvement" | "other";
export type FeedbackStatus = "new" | "planned" | "in_progress" | "done" | "declined";
export type KnownIssueStatus = "investigating" | "fix_in_progress" | "fixed";

export interface FeedbackReply {
  id: string;
  body: string;
  adminName: string;
  createdAt: string;
}

export interface FeedbackItem {
  id: string;
  displayName: string | null;
  title: string;
  body: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  upvoteCount: number;
  replyCount: number;
  isKnownIssue: boolean;
  knownIssueStatus: KnownIssueStatus | null;
  createdAt: string;
  isOwner: boolean;
  replies: FeedbackReply[];
}

export interface FeedbackWithVoted extends FeedbackItem {
  hasVoted: boolean;
}

// Admin types
/** Why a user has Pro. Paying = Stripe or a production Apple subscription. */
export type AdminProSource = "paying" | "comp" | "referral" | "sandbox" | "team";

export interface AdminAnalytics {
  totalUsers: number;
  activeUsers30d: number;
  /** Every isPremium row, including comp grants and sandbox. Kept for
   *  compatibility; the card shows payingSubscribers. */
  premiumUsers: number;
  payingSubscribers: number;
  compPro: number;
  referralPro: number;
  sandboxPro: number;
  totalTrips: number;
  totalMiles: number;
  totalEarningsPence: number;
  usersThisMonth: number;
  tripsThisMonth: number;
  /** Accounts by platform seen. "both" = iOS and Android on one account. */
  platformCounts?: { ios: number; android: number; both: number; web: number; unknown: number };
}

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  isPremium: boolean;
  /** Why they have Pro; null when they do not. */
  proSource?: AdminProSource | null;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  lastTripAt?: string | null;
  /** Platforms this account has been seen on: "ios" | "android" | "web".
   *  Two or more means the same account on more than one platform. */
  platforms?: string[];
  signupPlatform?: string | null;
  /** City, region, country from the signup IP; never finer than that. */
  signupLocation?: string | null;
  _count: { trips: number; vehicles: number; earnings: number };
  diagnosticDump?: {
    verdict: string;
    capturedAt: string;
  } | null;
  healthScore?: number;
  healthBand?: "good" | "warning" | "critical" | "unknown";
  buildNumber?: string | null;
  appVersion?: string | null;
  trialUsedAt?: string | null;
  referralProUntil?: string | null;
  marketingEmailsEnabled?: boolean;
  /** True when the user has a registered Expo push token. */
  hasPushToken?: boolean;
  /** Placeholder Apple Sign-In email + no push token: no channel can reach them. */
  unreachable?: boolean;
}

export type AdminUsersPlanFilter = "free" | "premium" | "paying" | "comp" | "trial" | "referral";
export type AdminUsersProviderFilter = "email" | "apple" | "google";
export type AdminUsersLifecycleFilter =
  | "active"
  | "dormant14"
  | "dormant90"
  | "dormant2y"
  | "never";

export interface AdminUserDetail extends AdminUserSummary {
  _count: {
    trips: number;
    vehicles: number;
    earnings: number;
    shifts: number;
    fuelLogs: number;
    expenses: number;
    invoices: number;
    savedLocations: number;
    achievements: number;
    feedback: number;
    plaidConnections: number;
    accountantAccess: number;
    referralsMade: number;
  };
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  premiumExpiresAt: string | null;
  appleId: string | null;
  googleId: string | null;
  notes: string | null;
  trips: Array<{
    id: string;
    distanceMiles: number;
    classification: string;
    startedAt: string;
    platformTag: string | null;
  }>;
  vehicles: Array<{
    id: string;
    make: string;
    model: string;
    fuelType: string;
    vehicleType: string;
  }>;
  totalMiles: number;
  totalEarningsPence: number;
  // Monetisation
  subscriptionPlatform?: "apple" | "google" | "stripe" | "none";
  /** "sandbox" when the Apple transaction was seen on a sandbox webhook. */
  subscriptionEnvironment?: "production" | "sandbox" | null;
  subscriptionPeriod?: "monthly" | "annual" | null;
  subscriptionPeriodInferred?: boolean;
  referralCode?: string | null;
  referredByCode?: string | null;
  // Reachability
  marketingEmailsDisabledAt?: string | null;
  marketingEmailsDisabledSource?: string | null;
  // Profile / segmentation
  fullName?: string | null;
  workType?: string;
  dashboardMode?: string;
  userIntent?: string | null;
  termsAcceptedAt?: string | null;
  // Feature adoption (presence booleans for one-to-one integrations)
  integrations?: {
    hmrc: boolean;
    quickbooks: boolean;
    discord: boolean;
    openBanking: boolean;
    accountantSharing: boolean;
  };
  lifecycle?: {
    firstTripAt: string | null;
    /** Trips per week for the last 8 weeks, oldest first. */
    weeklyTrips: number[];
    churnRisk: boolean;
  };
}

export interface AdminUserEvent {
  id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  buildNumber: string | null;
  createdAt: string;
}

export type AdminUserSortBy = "createdAt" | "lastTripAt" | "lastLoginAt";

// Community Intelligence types
export interface CommunityStats {
  totalDrivers: number;
  totalMilesTracked: number;
  totalTripsLogged: number;
  totalTaxSavedPence: number;
  driversNearby: number; // within ~20 mi radius
}

export interface AreaEarnings {
  platform: string;
  earningsPerMilePence: number;
  tripCount: number;
  driverCount: number;
}

export interface AreaPeakHour {
  dayOfWeek: string; // "Monday", etc.
  hour: number; // 0-23
  label: string; // "Friday 6-7 PM"
  tripCount: number;
  avgSpeedMph: number;
}

export interface NearbyAnomaly {
  type: string;
  response: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  reportedAt: string;
  reportCount: number;
  severity?: "low" | "medium" | "high";
  topReasons?: string[];
  placeName?: string | null;
}

export interface PreTripAlert {
  message: string;
  severity: "low" | "medium" | "high";
  icon: string;
  color: string;
  distanceMiles: number;
  reportCount: number;
}

export interface RouteSpeedInsight {
  areaName: string;
  avgSpeedMph: number;
  sampleSize: number;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
}

export interface CommunityInsights {
  stats: CommunityStats;
  areaEarnings: AreaEarnings[];
  peakHours: AreaPeakHour[];
  nearbyAnomalies: NearbyAnomaly[];
  routeSpeeds: RouteSpeedInsight[];
  bestPlatformNearby: string | null;
  bestTimeNearby: string | null; // e.g. "Friday 6-7 PM"
  fuelTipNearby: string | null; // e.g. "Asda Sunderland: 142.9p/L unleaded"
}

export interface AdminHealthStatus {
  api: "ok" | "error";
  database: "ok" | "error";
  databaseLatencyMs: number;
  recordCounts: {
    users: number;
    trips: number;
    shifts: number;
    vehicles: number;
    fuelLogs: number;
    earnings: number;
    achievements: number;
  };
  uptime: number;
  memoryUsageMb: number;
  nodeVersion: string;
}

// Revenue Dashboard
export interface AdminRevenue {
  /** Sum of monthly-equivalent prices across paying subscribers only. */
  mrrPence: number;
  payingSubscribers: number;
  /** Every active Pro user, whatever the reason. */
  proTotal: number;
  breakdown: {
    stripeMonthly: number;
    stripeAnnual: number;
    appleMonthly: number;
    appleAnnual: number;
    googleMonthly: number;
    googleAnnual: number;
    appleSandbox: number;
    comp: number;
    referral: number;
    /** Active Milesheet drivers (pilot orgs pay nothing). */
    team: number;
    expiredFlag: number;
  };
  /** Paying rows whose period was inferred from expiry, not a stamped product id. */
  inferredPeriods: number;
  churnedLast30d: number;
  churnRatePercent: number;
  /** MRR / all registered users. */
  arpuPence: number;
  /** MRR / paying subscribers. */
  arppuPence: number;
  /** First month the production webhook trail exists; rows before it are omitted. */
  trailStartMonth: string | null;
  monthlyTrend: Array<{
    month: string;
    payingAtMonthEnd: number;
    newPaid: number;
    churned: number;
    /** @deprecated alias of payingAtMonthEnd for mobile builds <= 84. */
    premiumCount: number;
    /** @deprecated alias of newPaid for mobile builds <= 84. */
    newPremium: number;
  }>;
  // Aliases kept so the admin revenue screen in mobile builds <= 84 (which
  // read the old shape) keeps rendering until build 85 ships. Remove once
  // the fleet is past 84.
  /** @deprecated use payingSubscribers */
  currentPremiumCount: number;
  /** @deprecated use breakdown.stripeMonthly + stripeAnnual */
  stripeSubscribers: number;
  /** @deprecated use breakdown.appleMonthly + appleAnnual (sandbox excluded) */
  appleSubscribers: number;
  googleSubscribers?: number;
  /** @deprecated use breakdown.comp */
  adminGranted: number;
}

// User Engagement
export interface AdminEngagement {
  dau: number;
  wau: number;
  mau: number;
  totalUsers: number;
  usersWithZeroTrips: number;
  retentionCurve: Array<{
    month: string;
    signups: number;
    retainedCount: number;
    retentionPercent: number;
  }>;
  recentlyActive: Array<{
    userId: string;
    email: string;
    displayName: string | null;
    lastTripAt: string;
    tripCount: number;
  }>;
}

// Auto-trip Health
export interface AdminAutoTripHealth {
  autoTripsTotal: number;
  autoTripsClassified: number;
  autoTripsUnclassified: number;
  manualTripsTotal: number;
  classificationRatePercent: number;
  usersWithAutoTrips7d: number;
  usersWithPushToken: number;
  detectionAdoptionPercent: number;
  avgTripDurationMinutes: number;
  avgAutoTripDistanceMiles: number;
  dailyAutoTrips: Array<{
    date: string;
    autoCount: number;
    manualCount: number;
  }>;
}

// Push Notification Sender
export type AdminPushAudience = "all" | "premium" | "inactive" | "specific";

export interface AdminPushRequest {
  audience: AdminPushAudience;
  userId?: string;
  inactiveDays?: number;
  title: string;
  body: string;
  dryRun?: boolean;
}

export interface AdminPushResult {
  sent: number;
  failed: number;
  totalTargeted: number;
  dryRun: boolean;
}

// Email Campaign
export interface AdminEmailResult {
  sent: number;
  skipped: number;
  errors: number;
  errorDetails: string[];
  dryRun: boolean;
  totalUsers: number;
}

// ─── Milesheet: approval + billing (phases 2 and 3) ────────────────

export type TeamApprovalStatus = "pending" | "approved" | "queried";

/** One driver's month as the manager sees it in the portal. */
export interface TeamMonthDriver {
  membershipId: string;
  userId: string;
  displayName: string | null;
  email: string;
  businessTrips: number;
  businessMiles: number;
  /** Reimbursable at the rate that applies to this driver, in pence. */
  amountPence: number;
  /** Pence per mile actually used, so the portal can show its working. */
  ratePence: number;
  /** True when the driver's own employer rate overrode the org default. */
  usesOwnRate: boolean;
  status: TeamApprovalStatus;
  note: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  /**
   * Set when a trip changed after approval, so the figure signed off no
   * longer matches the figure now. The portal surfaces it rather than
   * silently reapproving.
   */
  driftMiles: number | null;
  unclassifiedTrips: number;
}

export interface TeamMonthSummary {
  orgId: string;
  orgName: string;
  month: string;
  drivers: TeamMonthDriver[];
  totalMiles: number;
  totalAmountPence: number;
  approvedCount: number;
  pendingCount: number;
  queriedCount: number;
}

export interface TeamSeatBilling {
  pilotFree: boolean;
  activeSeats: number;
  /** Hard membership ceiling for this org, null = uncapped. Pilots get 20. */
  seatCap: number | null;
  seatsBilled: number | null;
  /**
   * Null when no price has been set. The market read was explicit that
   * Milesheet must not be priced on an inbound assumption, so an
   * undecided price is shown as undecided rather than invented.
   */
  pricePerSeatPence: number | null;
  /**
   * "trial": inside the free trial with no subscription yet. "trial_ended":
   * the trial is over and nothing else covers the team (data kept, team Pro
   * stopped). Both only appear for teams started while new teams are open.
   */
  status: "pilot" | "none" | "active" | "past_due" | "canceled" | "trial" | "trial_ended";
  currentPeriodEnd: string | null;
  billingEmail: string | null;
  /** ISO end of the free trial, null when the team never had one. */
  trialEndsAt?: string | null;
  /** Whole days left in the trial (rounded up), 0 once ended, null for no trial. */
  trialDaysLeft?: number | null;
}

// Admin Geography (GET /admin/geography). Where sign-ups are, by nation,
// UK region, postcode area and district. Mirrors apps/api/src/services/
// geography.ts (the API's own source of truth); keep the two in step.
export type AdminGeoRegion =
  | "North East"
  | "North West"
  | "Yorkshire and the Humber"
  | "East Midlands"
  | "West Midlands"
  | "East of England"
  | "London"
  | "South East"
  | "South West"
  | "Wales"
  | "Scotland"
  | "Northern Ireland"
  | "Crown Dependencies";
export type AdminGeoNation = "England" | "Scotland" | "Wales" | "Northern Ireland" | "Crown Dependencies" | "Outside UK";
/** How a user's home area was found, best first. signup_ip is low confidence. */
export type AdminGeoConfidence = "trip_postcode" | "saved_home" | "trip_location" | "signup_ip" | "unknown";
export type AdminGeoWindow = 7 | 30 | 90 | 365 | "all";
export type AdminGeoPlatform = "ios" | "android" | "both" | "web";

export interface AdminGeoMetrics {
  /** Sign-ups inside the window. */
  signups: number;
  /** Sign-ups in the equal-length window before; null for window=all. */
  prevSignups: number | null;
  /** % change vs prevSignups; null when prev is 0 or window=all. */
  growthPct: number | null;
  allTimeUsers: number;
  /** All-time users with an automatic trip in the last 7 days. */
  activeDrivers: number;
  /** Window sign-ups with at least one automatic trip. */
  activatedSignups: number;
  /** activatedSignups / signups, %, 1 dp; null when no sign-ups. */
  activationRatePct: number | null;
  /** All-time users paying today. */
  paying: number;
  /** All-time users with Pro from any source except App Review sandbox. */
  pro: number;
  /** Window sign-ups by platform. */
  platform: { ios: number; android: number; both: number; other: number };
  /** Top 3 "How did you hear" answers among window sign-ups. */
  topSources: Array<{ value: string; label: string; count: number }>;
  /** All-time users placed by saved home / trip location / signup IP rather than a trip postcode. */
  approximateUsers: number;
}

export interface AdminGeoNationRow extends AdminGeoMetrics {
  nation: AdminGeoNation | "Unknown";
}
export interface AdminGeoRegionRow extends AdminGeoMetrics {
  region: AdminGeoRegion | "Unknown";
  nation: AdminGeoNation | "Unknown";
}
export interface AdminGeoAreaRow extends AdminGeoMetrics {
  /** Postcode area: "LN", "B", "EC". */
  area: string;
  /** "Lincoln", "Birmingham", "London EC". */
  name: string;
  region: AdminGeoRegion;
  nation: AdminGeoNation;
  /** Approximate static centroid. */
  lat: number;
  lng: number;
  /** The area's first-ever user signed up inside the window. */
  newInWindow: boolean;
}
export interface AdminGeoDistrictRow extends AdminGeoMetrics {
  /** "LN1", "DN21", "SW1" (sub-district letters dropped). */
  district: string;
  area: string;
  areaName: string;
  region: AdminGeoRegion;
  nation: AdminGeoNation;
  /** Mean of the district's users' home points, 2 dp; null under 3 points. */
  lat: number | null;
  lng: number | null;
}
export interface AdminGeoMapPoint {
  level: "area" | "district";
  code: string;
  label: string;
  region: AdminGeoRegion;
  lat: number;
  lng: number;
  signups: number;
  allTimeUsers: number;
  activeDrivers: number;
}
export interface AdminGeoTimelineBucket {
  /** Bucket start YYYY-MM-DD (UTC); weeks start Monday. */
  date: string;
  total: number;
  /** Region name (or "Unknown") -> sign-ups. Missing key = 0. */
  byRegion: Record<string, number>;
  byNation: Record<string, number>;
}
export interface AdminGeoNewestSignup {
  hoursAgo: number;
  area: string | null;
  areaName: string | null;
  /** Only when the district has 3+ users. */
  district: string | null;
  region: AdminGeoRegion | null;
  nation: AdminGeoNation | null;
  platform: AdminGeoPlatform | null;
  source: string | null;
  confidence: AdminGeoConfidence;
  hasAutoTrip: boolean;
}
export interface AdminGeoIpAgreement {
  /** Users with a trip-postcode home AND a usable signup-IP nation. */
  compared: number;
  sameArea: number;
  /** Same region, different or unmappable area. */
  sameRegion: number;
  /** Same nation, different or unknown region. */
  sameNation: number;
  differentNation: number;
  /** Trip-postcode users whose signup IP said nothing usable. */
  ipUnknown: number;
  /** Of compared, IP cities that mapped to an area at all. */
  ipCityMapped: number;
  sameAreaPct: number | null;
  sameRegionOrBetterPct: number | null;
  topMismatches: Array<{ ipCity: string; tripArea: string; tripAreaName: string; count: number }>;
}

export interface AdminGeography {
  params: { window: AdminGeoWindow; platform: string; source: string; includeIp: boolean };
  summary: {
    signups: number;
    prevSignups: number | null;
    growthPct: number | null;
    withArea: number;
    withAreaPct: number | null;
    withRegionPct: number | null;
    byConfidence: Record<AdminGeoConfidence, number>;
    allTimeUsers: number;
    allTimeByConfidence: Record<AdminGeoConfidence, number>;
    areasReached: number;
    regionsReached: number;
    newAreas: Array<{ area: string; name: string; region: AdminGeoRegion; signups: number }>;
  };
  byNation: AdminGeoNationRow[];
  byRegion: AdminGeoRegionRow[];
  byArea: AdminGeoAreaRow[];
  /** Top 50 districts with 3+ users. */
  topDistricts: AdminGeoDistrictRow[];
  suppressedDistricts: { districts: number; users: number };
  mapPoints: AdminGeoMapPoint[];
  timeline: { bucket: "day" | "week"; regions: string[]; nations: string[]; series: AdminGeoTimelineBucket[] };
  newestSignups: AdminGeoNewestSignup[];
  signupIpVsTrip: AdminGeoIpAgreement;
  /** Values accepted by ?source= (plus "all"). */
  sources: Array<{ value: string; label: string }>;
  privacyFloor: number;
  generatedAt: string;
  meta: { baseLoadedAt: string; tripsScanned: number; tripsPerUserCap: number; cacheSeconds: number };
}

// ── Community numbers (monthly snapshot of the whole fleet) ──────────────
//
// GET /community/monthly (public) and GET /admin/community/monthly (adds
// social post drafts). Aggregates only. A figure is null when fewer than
// `privacyFloor` drivers stand behind it, and `published` is false (every
// figure null) when the month itself had fewer active drivers than that.

export interface CommunityMonthlyRegion {
  /** A UK region or nation ("North East", "Scotland"). Never a town. */
  region: string;
  drivers: number;
}

export interface CommunityMonthly {
  /** "YYYY-MM", a complete UK calendar month. */
  month: string;
  /** "September 2026". */
  label: string;
  published: boolean;
  privacyFloor: number;
  /** Drivers with at least one real (non-phantom) trip in the month. */
  activeDrivers: number | null;
  trips: number | null;
  totalMiles: number | null;
  businessMiles: number | null;
  /** Estimated value of the month's business miles at the HMRC mileage rates, pence. */
  claimValuePence: number | null;
  /** Accounts created in the month. */
  newDrivers: number | null;
  busiestDay: { date: string; weekday: string; trips: number; miles: number } | null;
  /** Up to five regions, each with at least `privacyFloor` active drivers. */
  topRegions: CommunityMonthlyRegion[];
  /** Share of trips recorded automatically (not typed in), 0-100, whole number. */
  autoRecordedPct: number | null;
  topPlatform: { platform: string; label: string; drivers: number; trips: number } | null;
  /** Every month that can be asked for, newest first. */
  months: string[];
  generatedAt: string;
}

/** GET /community/totals: fleet-wide figures for the public website.
 *  Every number is already rounded DOWN by the API, so the site can quote it
 *  with a "+" and never overstate. */
export interface CommunityTotals {
  /** Miles in real (non-phantom, not double-counted) trips, all time, rounded down. */
  milesAllTime: number;
  /** Drivers with at least one real trip started in the last 30 days, rounded down. */
  activeDrivers30d: number;
  generatedAt: string;
}

export interface CommunityPostVariant {
  key: string;
  label: string;
  text: string;
}

export interface AdminCommunityMonthly extends CommunityMonthly {
  posts: CommunityPostVariant[];
}

// ── Tax bill planner (4 Oct 2026) ────────────────────────────────────
// GET /tax-planner: "how much will I have to pay HMRC, and when?" for a
// self-employed driver. Built by apps/api/src/services/taxPlanner.ts; the
// rules (with their GOV.UK sources) are in services/taxPlannerMath.ts.

export type TaxPlannerBillSource =
  | "entered"
  | "estimate"
  | "projection"
  | "not_self_employed"
  | "assumed_same"
  | "unknown";

export type TaxPlannerNoPoaReason = "under_threshold" | "mostly_deducted_at_source" | "no_bill";

export interface TaxPlannerPart {
  kind: "balancing" | "poa1" | "poa2";
  /** The tax year the money goes towards. */
  taxYear: string;
  /** null = can't be worked out from what's recorded. */
  amountPence: number | null;
  noPoaReason?: TaxPlannerNoPoaReason;
  /** Balancing only: payments on account came to more than the bill. */
  overpaidPence?: number;
}

export interface TaxPlannerPayment {
  /** "2027-01-31" */
  dueDate: string;
  daysAway: number;
  /** null when any part is unknown. */
  amountPence: number | null;
  parts: TaxPlannerPart[];
  /** Whole bill for last year plus half again towards this one (~150%). */
  firstPaymentOnAccount: boolean;
}

export interface TaxPlannerYear {
  taxYear: string;
  billPence: number | null;
  source: TaxPlannerBillSource;
  /** Earnings counted for the year (so far, for the current year). */
  recordedEarningsPence: number;
  /** Joined MileClear after this tax year began, so the estimate only
   *  counts part of it. */
  partialYear: boolean;
}

export interface TaxPlannerSettings {
  /** "2026-27", "earlier", or null when the driver hasn't said. */
  firstSelfEmployedTaxYear: string | null;
  /** Bills the driver typed in, by tax year, in pence. */
  bills: Record<string, number>;
}

export interface TaxPlan {
  currentTaxYear: string;
  /** Year before last, last year, this year. */
  years: TaxPlannerYear[];
  payments: TaxPlannerPayment[];
  /** Put this by each week from today to cover the payments listed (up to
   *  coversTo). null when the next payment can't be worked out. */
  weeklySetAsidePence: number | null;
  coversTo: string | null;
  /** No earnings recorded for the current tax year. */
  missingCurrentEarnings: boolean;
  /** The driver hasn't said when they started working for themselves. */
  startAssumed: boolean;
  settings: TaxPlannerSettings;
  /** Tax deadline reminders are on (push preference). */
  remindersOn: boolean;
  /** Has said they drive as an employee, or is in Personal mode. */
  mayNotApply: boolean;
}
