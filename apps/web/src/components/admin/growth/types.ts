// Response shapes for the Growth pages (engagement, insights).

import type { EngagementData } from "@/components/admin/panels/types";

export interface RecentlyActiveUser {
  userId: string;
  email: string;
  displayName: string | null;
  lastTripAt: string;
  tripCount: number;
}

/** /admin/engagement, including the recently-active list the shared type
 *  leaves out. */
export interface EngagementWithActive extends EngagementData {
  recentlyActive?: RecentlyActiveUser[];
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  pctOfPrev: number;
  pctOfTotal: number;
}

export interface RetentionPoint {
  count: number;
  eligible: number;
  pct: number;
}

export interface RetentionData {
  cohortSize: number;
  cohortWindow: string;
  d1: RetentionPoint;
  d7: RetentionPoint;
  d30: RetentionPoint;
  note?: string;
}

export interface ActiveTrip {
  id: string;
  userId: string;
  userLabel: string;
  startedAt: string;
  minutesElapsed: number;
  startAddress: string | null;
  distanceMiles: number;
  classification: string;
  platformTag: string | null;
}

export interface ActiveShift {
  id: string;
  userId: string;
  userLabel: string;
  startedAt: string;
  minutesElapsed: number;
}

export interface ActiveRecordings {
  activeTrips: ActiveTrip[];
  activeShifts: ActiveShift[];
}

export interface DiagnosticPanels {
  windowDays: number;
  ratingFunnel: { type: string; count: number }[];
  classificationAccuracy: {
    accepted: number;
    rejected: number;
    accuracyPercent: number | null;
  };
  lowQualityTripCount: number;
  heartbeatAlerts: { type: string; count: number }[];
}

export interface OnboardingStep {
  label: string;
  count: number;
  pct: number;
  note?: string;
  dropFromPrev: number | null;
  dropPctOfPrev: number | null;
}

export interface OnboardingActivation {
  label: string;
  description: string;
  cohort: number;
  activated: number;
  pct: number;
}

export interface OnboardingData {
  total: number;
  steps: OnboardingStep[];
  activation: OnboardingActivation;
}

export interface AuditEvent {
  id: string;
  type: string;
  action: string;
  userId: string | null;
  userLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface EmailEvent {
  id: string;
  type: string;
  userId: string | null;
  userLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TopUsersData {
  byMiles: { id: string; label: string; totalMiles: number; tripCount: number }[];
  byProTenure: {
    id: string;
    label: string;
    accountAgeDays: number;
    premiumExpiresAt: string | null;
  }[];
  byEngagement: { id: string; label: string; tripsLast30d: number }[];
}

export interface BenchmarkObserver {
  category: string;
  windowDays: number;
  contributors: number;
  privacyFloorMet: boolean;
  p25: number | null;
  median: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
}
