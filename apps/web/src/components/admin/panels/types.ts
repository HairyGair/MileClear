// Response shapes for the admin endpoints the shared panels read.

export interface QrScans {
  total: number;
  byStore: { ios: number; android: number; other: number };
  last24h: number;
  /** Newest first. */
  byDay: Array<{ date: string; total: number; ios: number; android: number; other: number }>;
  firstAt: string | null;
  lastAt: string | null;
}

export interface AcquisitionData {
  answered: number;
  skipped: number;
  bySource: Array<{ value: string; label: string; count: number }>;
  otherDetails: Array<{ detail: string; at: string }>;
}

export interface SupportQueueData {
  items: Array<{
    kind: "feedback" | "missing_trip";
    id: string;
    email: string | null;
    displayName: string | null;
    at: string;
    ageHours: number;
    summary: string;
  }>;
  counts: { feedbackOpen: number; missingTripsOpen: number; total: number };
  generatedAt: string;
}

export interface TripQualityData {
  days: number;
  autoTrips: number;
  manualTrips: number;
  stubTrips: number;
  stubRate: number | null;
  phantomFlagged: number;
  avgCoords: number | null;
  events: { missingReports: number };
  generatedAt: string;
}

export interface RevenueData {
  mrrPence: number;
  payingSubscribers: number;
  proTotal: number;
  churnedLast30d: number;
  churnRatePercent: number;
}

export interface EngagementData {
  dau: number;
  wau: number;
  mau: number;
  totalUsers: number;
  usersWithZeroTrips: number;
  retentionCurve: Array<{ month: string; signups: number; retainedCount: number; retentionPercent: number }>;
}

export interface RatingDiagnostics {
  totalLoveItEvents: number;
  distinctUsers: number;
  usersWithSinglePrompt: number;
  usersWithRepeat: number;
  usersAt3Plus: number;
  byBuild: Array<{ buildNumber: string; appVersion: string | null; count: number }>;
  generatedAt: string;
}
