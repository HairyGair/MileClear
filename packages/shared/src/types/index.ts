// User types
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  isPremium: boolean;
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
  estimatedMpg: number | null;
  actualMpg: number | null;
  isPrimary: boolean;
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
export type TripClassification = "business" | "personal";
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

// Fuel types
export interface FuelLog {
  id: string;
  userId: string;
  vehicleId: string | null;
  litres: number;
  costPence: number;
  stationName: string | null;
  odometerReading: number | null;
  loggedAt: string;
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

export interface ExportSummary {
  taxYear: string;
  totalTrips: number;
  totalMiles: number;
  businessMiles: number;
  personalMiles: number;
  vehicleBreakdown: ExportVehicleBreakdown[];
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
  period: "weekly" | "monthly";
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
