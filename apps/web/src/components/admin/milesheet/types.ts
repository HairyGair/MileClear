// Response shapes for the admin Milesheet endpoints
// (apps/api/src/routes/admin/milesheet.ts). Kept beside the pages rather than
// in @mileclear/shared: only the admin area reads them.

export type TeamSource = "nomination" | "self_serve" | "admin" | "unknown";
export type JourneyStep = "started" | "managerAccepted" | "firstDriverActive" | "firstApproval" | "firstExport" | "paying";
export type TeamFlag = "no_active_manager" | "duplicate" | "stale_invites";
export type InviteState = "pending" | "expired" | "waiting_on_manager" | "none";

export interface InviteCounts {
  sent: number;
  accepted: number;
  acceptanceRate: number | null;
}

export interface MilesheetOverview {
  generatedAt: string;
  teams: { total: number; pilot: number; paying: number; neither: number };
  activeDrivers: number;
  activeManagers: number;
  seatsBilled: number;
  pricePerSeatPence: number | null;
  monthlyRevenuePence: number | null;
  invites: { last30d: InviteCounts; allTime: InviteCounts; pending: number; expired: number; waitingOnManager: number };
  proThroughTeams: number;
  proThroughTeamsOnly: number;
}

export interface FunnelStep {
  step: JourneyStep;
  label: string;
  reached: number;
  stalledHere: number;
  medianDaysFromPrevious: number | null;
  medianSample: number;
}

export interface JourneyTeam {
  orgId: string;
  name: string;
  source: TeamSource;
  lastStep: JourneyStep;
  reached: Record<JourneyStep, boolean>;
  dates: Record<JourneyStep, string | null>;
}

export interface MilesheetJourney {
  generatedAt: string;
  steps: FunnelStep[];
  teams: JourneyTeam[];
}

export interface TeamListRow {
  orgId: string;
  name: string;
  createdAt: string;
  source: TeamSource;
  managers: Array<{ email: string; status: string }>;
  counts: { active: number; invited: number; disabled: number };
  lastTripAt: string | null;
  monthMiles: number;
  monthAmountPence: number;
  lastMonth: { month: string; drivers: number; approved: number; queried: number };
  billing: { status: "pilot" | "paying" | "none"; seatsBilled: number | null; seatCap: number | null; occupied: number };
  flags: TeamFlag[];
}

export interface MilesheetTeams {
  generatedAt: string;
  month: string;
  rows: TeamListRow[];
}

export type AttentionKind = "stale_invite" | "no_active_manager" | "duplicate" | "month_not_approved" | "driver_no_trips" | "payment_failed";

export interface AttentionItem {
  kind: AttentionKind;
  orgId: string;
  orgName: string;
  otherOrgIds?: string[];
  detail: string;
  since: string | null;
  severity: "bad" | "warn";
}

export interface MilesheetAttention {
  generatedAt: string;
  items: AttentionItem[];
}

export interface TeamMember {
  id: string;
  userId: string | null;
  role: string;
  status: string;
  email: string;
  invitedEmail: string;
  displayName: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  disabledAt: string | null;
  inviteExpiresAt: string | null;
  inviteState: InviteState;
  lastTripAt: string | null;
}

export interface TeamApprovalMonth {
  month: string;
  approved: number;
  queried: number;
  pending: number;
  miles: number;
  amountPence: number;
  rows: Array<{ userId: string; email: string | null; status: string; approvedAt: string | null; miles: number | null; amountPence: number | null; note: string | null }>;
}

export interface TeamEvent {
  type: string;
  at: string;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TeamDetail {
  generatedAt: string;
  org: {
    id: string;
    name: string;
    createdAt: string;
    createdByUserId: string;
    pilotFree: boolean;
    seatCap: number | null;
    seatsBilled: number | null;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
    billingEmail: string | null;
    defaultRatePence: number | null;
    source: TeamSource;
  };
  billing: {
    pilotFree: boolean;
    activeSeats: number;
    seatCap: number | null;
    seatsBilled: number | null;
    pricePerSeatPence: number | null;
    status: "pilot" | "none" | "active" | "past_due" | "canceled";
    currentPeriodEnd: string | null;
    billingEmail: string | null;
  };
  flags: TeamFlag[];
  duplicates: Array<{ orgIds: string[]; reason: string; detail: string; others: Array<{ id: string; name: string }> }>;
  journey: { lastStep: JourneyStep; reached: Record<JourneyStep, boolean>; dates: Record<JourneyStep, string | null> };
  members: TeamMember[];
  month: { month: string; totalMiles: number; totalAmountPence: number; approved: number; pending: number; queried: number } | null;
  approvals: TeamApprovalMonth[];
  events: TeamEvent[];
}

export interface MovePlan {
  blockers: string[];
  warnings: string[];
  target: {
    orgId: string;
    action: "create" | "update" | "none";
    membershipId: string | null;
    from: { status: string; role: string } | null;
    to: { status: "active"; role: "admin" | "driver" };
  };
  deactivate: Array<{ membershipId: string; orgId: string; orgName: string; role: string }>;
  cancelInvites: Array<{ membershipId: string; orgId: string; orgName: string }>;
  emptiedTeams: Array<{
    orgId: string;
    orgName: string;
    deletable: boolean;
    notDeletableReason: string | null;
    willDelete: boolean;
    otherMemberships: number;
    approvalsMoved: number;
    approvalsLost: number;
  }>;
}

export interface MovePreview {
  person: { userId: string; email: string; displayName: string | null };
  plan: MovePlan;
  planKey: string;
}

export interface MergePlan {
  blockers: string[];
  warnings: string[];
  move: Array<{ membershipId: string; email: string; role: string; status: string }>;
  conflicts: Array<{
    email: string;
    sourceMembershipId: string;
    targetMembershipId: string;
    source: { status: string; role: string };
    target: { status: string; role: string };
    keep: "source" | "target";
    resultRole: string;
    resultStatus: string;
  }>;
  approvalsMove: string[];
  approvalsReplace: Array<{ sourceId: string; targetId: string; userId: string; month: string }>;
  approvalsDrop: Array<{ sourceId: string; userId: string; month: string }>;
  occupiedAfter: number;
}

export interface MergePreview {
  target: { id: string; name: string };
  source: { id: string; name: string };
  plan: MergePlan;
  planKey: string;
}
