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
  dashboardMode: "both" | "work" | "personal";
  emailVerified: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  premiumExpiresAt: string | null;
  createdAt: string;
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
  isPrimary: boolean;
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
  syncedAt: string | null;
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
}

/** @deprecated Use FuelStation instead */
export type CommunityFuelStation = FuelStation;

export interface NationalAveragePrices {
  petrolPencePerLitre: number;
  dieselPencePerLitre: number;
  date: string;
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
  distanceMiles: number;
  classification: TripClassification;
  platform: string | null;
  businessPurpose: string | null;
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
  subscriptionPlatform: "apple" | "stripe" | "none";
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
  weekMiles: number;
  personalRecords: PersonalRecords;
  region?: string;
  drivingPatterns?: DrivingPatterns;
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
export interface AdminAnalytics {
  totalUsers: number;
  activeUsers30d: number;
  premiumUsers: number;
  totalTrips: number;
  totalMiles: number;
  totalEarningsPence: number;
  usersThisMonth: number;
  tripsThisMonth: number;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  createdAt: string;
  _count: { trips: number; vehicles: number; earnings: number };
}

export interface AdminUserDetail extends AdminUserSummary {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  premiumExpiresAt: string | null;
  appleId: string | null;
  googleId: string | null;
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
}

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
  currentPremiumCount: number;
  mrrPence: number;
  stripeSubscribers: number;
  appleSubscribers: number;
  adminGranted: number;
  churnedLast30d: number;
  churnRatePercent: number;
  arpuPence: number;
  monthlyTrend: Array<{
    month: string;
    premiumCount: number;
    newPremium: number;
    churned: number;
  }>;
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
