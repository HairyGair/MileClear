// Milesheet admin (4 Oct 2026): the pure rules behind the admin Milesheet
// section. No database, no clock reads (every function takes `now`), so the
// funnel, the flags, the move and merge plans can all be unit tested.
//
// The routes in routes/admin/milesheet.ts load the rows, call these, and for
// the two write actions (move a person, merge two teams) apply exactly the
// plan the admin previewed: the preview returns a planKey, and the apply
// refuses if the plan worked out again on the server no longer matches it.

import crypto from "node:crypto";

// ── Row shapes (the subset of the Prisma rows the rules need) ──────────────

export interface OrgRow {
  id: string;
  name: string;
  createdAt: Date;
  createdByUserId: string;
  pilotFree: boolean;
  seatCap: number | null;
  stripeSubscriptionId: string | null;
  seatsBilled: number | null;
}

export interface MembershipRow {
  id: string;
  orgId: string;
  userId: string | null;
  role: string; // admin | driver
  status: string; // invited | active | disabled
  invitedEmail: string;
  hasToken: boolean;
  inviteExpiresAt: Date | null;
  invitedAt: Date;
  acceptedAt: Date | null;
  disabledAt: Date | null;
}

export interface ApprovalRow {
  id: string;
  orgId: string;
  userId: string;
  month: string;
  status: string; // pending | approved | queried
  approvedAt: Date | null;
}

export interface TeamEventRow {
  type: string;
  userId: string | null;
  orgId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_INVITE_DAYS = 7;

// ── Invite state ───────────────────────────────────────────────────────────

export type InviteState = "pending" | "expired" | "waiting_on_manager" | "none";

/**
 * What an "invited" membership is waiting for. A driver who nominated their
 * manager has a membership with their userId and no token: there is nothing
 * for them to accept, it turns active when the manager accepts.
 */
export function inviteState(m: Pick<MembershipRow, "status" | "userId" | "hasToken" | "inviteExpiresAt">, now: Date): InviteState {
  if (m.status !== "invited") return "none";
  if (m.userId && !m.hasToken) return "waiting_on_manager";
  if (m.inviteExpiresAt && m.inviteExpiresAt.getTime() < now.getTime()) return "expired";
  return "pending";
}

/** How many invites one AppEvent stands for. */
export function invitesInEvent(e: Pick<TeamEventRow, "type" | "metadata">): number {
  const meta = e.metadata ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  switch (e.type) {
    case "team.invites_sent":
      return num(meta.count) ?? 0;
    case "team.org_created":
    case "team.manager_nominated":
    case "admin.milesheet.resend_invite":
      return 1;
    case "team.invites_bulk_resent": {
      const n = num(meta.count) ?? num(meta.sent);
      if (n !== null) return n;
      for (const k of ["emails", "orgIds", "memberships", "recipients"]) {
        if (Array.isArray(meta[k])) return (meta[k] as unknown[]).length;
      }
      return 1;
    }
    default:
      return 0;
  }
}

export interface InviteCounts {
  sent: number;
  accepted: number;
  /** accepted / sent, null when nothing was sent. */
  acceptanceRate: number | null;
}

export function countInvites(events: TeamEventRow[], since: Date | null): InviteCounts {
  let sent = 0;
  let accepted = 0;
  for (const e of events) {
    if (since && e.createdAt.getTime() < since.getTime()) continue;
    sent += invitesInEvent(e);
    if (e.type === "team.invite_accepted") accepted += 1;
  }
  return { sent, accepted, acceptanceRate: sent > 0 ? accepted / sent : null };
}

// ── Where a team came from ─────────────────────────────────────────────────

export type TeamSource = "nomination" | "self_serve" | "admin" | "unknown";

export function inferTeamSource(org: Pick<OrgRow, "id" | "createdByUserId">, orgEvents: TeamEventRow[], adminUserIds: ReadonlySet<string>): TeamSource {
  if (orgEvents.some((e) => e.type === "team.manager_nominated")) return "nomination";
  if (orgEvents.some((e) => e.type === "team.self_serve_org_created")) return "self_serve";
  if (orgEvents.some((e) => e.type === "team.org_created")) return "admin";
  if (adminUserIds.has(org.createdByUserId)) return "admin";
  return "unknown";
}

// ── Team journey (funnel) ──────────────────────────────────────────────────

export const JOURNEY_STEPS = ["started", "managerAccepted", "firstDriverActive", "firstApproval", "firstExport", "paying"] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

export const JOURNEY_STEP_LABELS: Record<JourneyStep, string> = {
  started: "Nominated or created",
  managerAccepted: "Manager accepted",
  firstDriverActive: "First driver active",
  firstApproval: "First month approved",
  firstExport: "First export",
  paying: "Paying",
};

export interface TeamJourney {
  orgId: string;
  /** Date each step was reached, null when not reached (or reached with no date). */
  dates: Record<JourneyStep, Date | null>;
  reached: Record<JourneyStep, boolean>;
  /** The furthest step reached in order (a later step without the earlier ones does not count). */
  lastStep: JourneyStep;
}

function minDate(dates: Array<Date | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const d of dates) if (d && (!best || d.getTime() < best.getTime())) best = d;
  return best;
}

export function computeTeamJourney(
  org: OrgRow,
  memberships: MembershipRow[],
  approvals: ApprovalRow[],
  orgEvents: TeamEventRow[]
): TeamJourney {
  const admins = memberships.filter((m) => m.role === "admin");
  const drivers = memberships.filter((m) => m.role === "driver");
  // An admin who accepted (or a self-serve creator, who is active from the
  // start). acceptedAt survives a later disable, so the step stays reached.
  const managerAccepted = minDate(admins.filter((m) => m.acceptedAt).map((m) => m.acceptedAt));
  const firstDriverActive = minDate(drivers.filter((m) => m.acceptedAt && m.userId).map((m) => m.acceptedAt));
  const firstApproval = minDate([
    ...approvals.filter((a) => a.status === "approved").map((a) => a.approvedAt),
    ...orgEvents.filter((e) => e.type === "team.month_approved").map((e) => e.createdAt),
  ]);
  const firstExport = minDate(orgEvents.filter((e) => e.type === "team.export").map((e) => e.createdAt));
  const payingEvent = minDate(orgEvents.filter((e) => e.type === "team.subscription_updated").map((e) => e.createdAt));
  const paying = !!org.stripeSubscriptionId || payingEvent !== null;

  const dates: Record<JourneyStep, Date | null> = {
    started: org.createdAt,
    managerAccepted,
    firstDriverActive,
    firstApproval,
    firstExport,
    paying: paying ? payingEvent : null,
  };
  const reached: Record<JourneyStep, boolean> = {
    started: true,
    managerAccepted: managerAccepted !== null,
    firstDriverActive: firstDriverActive !== null,
    firstApproval: firstApproval !== null,
    firstExport: firstExport !== null,
    paying,
  };
  let lastStep: JourneyStep = "started";
  for (const step of JOURNEY_STEPS) {
    if (!reached[step]) break;
    lastStep = step;
  }
  return { orgId: org.id, dates, reached, lastStep };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface FunnelStepSummary {
  step: JourneyStep;
  label: string;
  /** Teams that reached this step (whatever happened before it). */
  reached: number;
  /** Teams whose furthest in-order step is this one: they stalled here. */
  stalledHere: number;
  /** Median days from the previous step to this one, over teams with both dates. */
  medianDaysFromPrevious: number | null;
  /** How many teams that median is over. */
  medianSample: number;
}

export function summariseFunnel(journeys: TeamJourney[]): FunnelStepSummary[] {
  return JOURNEY_STEPS.map((step, i) => {
    const prev = i > 0 ? JOURNEY_STEPS[i - 1] : null;
    const gaps: number[] = [];
    if (prev) {
      for (const j of journeys) {
        const a = j.dates[prev];
        const b = j.dates[step];
        if (a && b) gaps.push(Math.max(0, (b.getTime() - a.getTime()) / DAY_MS));
      }
    }
    const med = median(gaps);
    return {
      step,
      label: JOURNEY_STEP_LABELS[step],
      reached: journeys.filter((j) => j.reached[step]).length,
      stalledHere: journeys.filter((j) => j.lastStep === step && step !== "paying").length,
      medianDaysFromPrevious: med === null ? null : Math.round(med * 10) / 10,
      medianSample: gaps.length,
    };
  });
}

// ── Duplicate detection and flags ──────────────────────────────────────────

const NAME_NOISE = new Set(["ltd", "limited", "plc", "llp", "the", "co", "company", "uk", "group", "services", "and"]);

/** "The Maids of Glory Ltd." and "maids of glory" both become "maidsofglory". */
export function normaliseTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NAME_NOISE.has(w))
    .join("");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Same name once the noise is gone, or one or two letters apart on a name long enough for that to mean a typo. */
export function similarTeamNames(a: string, b: string): boolean {
  const na = normaliseTeamName(a);
  const nb = normaliseTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = Math.min(na.length, nb.length);
  if (shorter < 6) return false;
  return levenshtein(na, nb) <= (shorter >= 16 ? 2 : 1);
}

export interface DuplicateGroup {
  orgIds: string[];
  reason: "same_manager" | "similar_name";
  detail: string;
}

/** Teams that look like the same company twice. Manager emails come from admin memberships that are not disabled. */
export function findDuplicateTeams(orgs: Pick<OrgRow, "id" | "name">[], memberships: MembershipRow[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const byManager = new Map<string, Set<string>>();
  for (const m of memberships) {
    if (m.role !== "admin" || m.status === "disabled") continue;
    const set = byManager.get(m.invitedEmail) ?? new Set<string>();
    set.add(m.orgId);
    byManager.set(m.invitedEmail, set);
  }
  const seen = new Set<string>();
  for (const [email, ids] of byManager) {
    if (ids.size < 2) continue;
    const orgIds = [...ids].sort();
    seen.add(orgIds.join("|"));
    groups.push({ orgIds, reason: "same_manager", detail: `Same manager: ${email}` });
  }
  for (let i = 0; i < orgs.length; i++) {
    for (let j = i + 1; j < orgs.length; j++) {
      if (!similarTeamNames(orgs[i].name, orgs[j].name)) continue;
      const orgIds = [orgs[i].id, orgs[j].id].sort();
      if (seen.has(orgIds.join("|"))) continue;
      seen.add(orgIds.join("|"));
      groups.push({ orgIds, reason: "similar_name", detail: `Similar names: "${orgs[i].name}" and "${orgs[j].name}"` });
    }
  }
  return groups;
}

export type TeamFlag = "no_active_manager" | "duplicate" | "stale_invites";

export function teamFlags(orgId: string, memberships: MembershipRow[], duplicates: DuplicateGroup[], now: Date): TeamFlag[] {
  const mine = memberships.filter((m) => m.orgId === orgId);
  const flags: TeamFlag[] = [];
  if (!mine.some((m) => m.role === "admin" && m.status === "active")) flags.push("no_active_manager");
  if (duplicates.some((d) => d.orgIds.includes(orgId))) flags.push("duplicate");
  if (mine.some((m) => isStaleInvite(m, now))) flags.push("stale_invites");
  return flags;
}

/** A real invite (not a nominated driver waiting on their manager) sent more than a week ago and still not accepted. */
export function isStaleInvite(m: MembershipRow, now: Date): boolean {
  const state = inviteState(m, now);
  if (state !== "pending" && state !== "expired") return false;
  return now.getTime() - m.invitedAt.getTime() > STALE_INVITE_DAYS * DAY_MS;
}

// ── Plans for the two write actions ────────────────────────────────────────

const STATUS_RANK: Record<string, number> = { active: 3, invited: 2, disabled: 1 };

export function planKeyOf(plan: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
}

export interface MovePlanInput {
  target: OrgRow;
  targetMemberships: MembershipRow[];
  person: { userId: string; email: string };
  role: "admin" | "driver";
  /** Every membership row for this person (by userId or email) in any team. */
  personMemberships: MembershipRow[];
  /** All memberships of every other team the person is in, keyed by orgId. */
  otherOrgs: Array<{ org: OrgRow; memberships: MembershipRow[]; approvals: ApprovalRow[] }>;
  /** The person's approvals in other teams. */
  targetApprovals: ApprovalRow[];
  deleteEmptiedTeams: boolean;
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
  /** Active memberships elsewhere that become disabled. */
  deactivate: Array<{ membershipId: string; orgId: string; orgName: string; role: string }>;
  /** Pending invites elsewhere for this person: cancelled so they cannot join a second team later. */
  cancelInvites: Array<{ membershipId: string; orgId: string; orgName: string }>;
  /** Teams left with no active member after the move. */
  emptiedTeams: Array<{
    orgId: string;
    orgName: string;
    deletable: boolean;
    notDeletableReason: string | null;
    willDelete: boolean;
    /** Rows that go when the team is deleted. */
    otherMemberships: number;
    /** The person's approvals in that team that move with them. */
    approvalsMoved: number;
    /** Approvals that cannot move (the target already has that month) or belong to others: lost with the team. */
    approvalsLost: number;
  }>;
}

export function planMove(input: MovePlanInput): MovePlan {
  const { target, targetMemberships, person, role } = input;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const email = person.email.toLowerCase();

  const inTarget =
    targetMemberships.find((m) => m.userId === person.userId) ??
    targetMemberships.find((m) => m.invitedEmail === email) ??
    null;

  let action: MovePlan["target"]["action"] = "create";
  if (inTarget) {
    action = inTarget.status === "active" && inTarget.role === role && inTarget.userId === person.userId ? "none" : "update";
  }

  const elsewhere = input.personMemberships.filter((m) => m.orgId !== target.id);
  const orgName = (id: string) => input.otherOrgs.find((o) => o.org.id === id)?.org.name ?? id;
  const deactivate = elsewhere
    .filter((m) => m.status === "active")
    .map((m) => ({ membershipId: m.id, orgId: m.orgId, orgName: orgName(m.orgId), role: m.role }));
  const cancelInvites = elsewhere
    .filter((m) => m.status === "invited")
    .map((m) => ({ membershipId: m.id, orgId: m.orgId, orgName: orgName(m.orgId) }));

  if (action === "none" && deactivate.length === 0 && cancelInvites.length === 0) {
    blockers.push("They are already an active member of this team with that role. Nothing to change.");
  }

  // Seat cap: a new non-disabled membership in the target uses a place.
  const addsPlace = !inTarget || inTarget.status === "disabled";
  if (addsPlace && target.seatCap != null) {
    const occupied = targetMemberships.filter((m) => m.status !== "disabled").length;
    if (occupied >= target.seatCap) {
      blockers.push(`This team is at its ${target.seatCap} member limit. Raise the limit first.`);
    }
  }

  const touchedIds = new Set([...deactivate.map((d) => d.membershipId), ...cancelInvites.map((c) => c.membershipId)]);
  const targetMonths = new Set(input.targetApprovals.filter((a) => a.userId === person.userId).map((a) => a.month));
  const emptiedTeams: MovePlan["emptiedTeams"] = [];
  for (const other of input.otherOrgs) {
    if (!deactivate.some((d) => d.orgId === other.org.id)) continue;
    const stillActive = other.memberships.filter((m) => m.status === "active" && !touchedIds.has(m.id));
    if (stillActive.length > 0) continue;
    const deletable = !other.org.stripeSubscriptionId;
    const mineApprovals = other.approvals.filter((a) => a.userId === person.userId);
    const movable = mineApprovals.filter((a) => !targetMonths.has(a.month)).length;
    const willDelete = input.deleteEmptiedTeams && deletable;
    emptiedTeams.push({
      orgId: other.org.id,
      orgName: other.org.name,
      deletable,
      notDeletableReason: deletable ? null : "It has a Stripe subscription. Cancel that first.",
      willDelete,
      otherMemberships: other.memberships.filter((m) => !touchedIds.has(m.id)).length,
      approvalsMoved: willDelete ? movable : 0,
      approvalsLost: willDelete ? other.approvals.length - movable : 0,
    });
  }
  for (const e of emptiedTeams) {
    if (!e.willDelete) warnings.push(`"${e.orgName}" will have nobody active in it. It stays as an empty team${e.deletable ? " unless you choose to delete it" : ` (${e.notDeletableReason})`}.`);
  }
  if (deactivate.some((d) => d.role === "admin")) {
    warnings.push("They are a manager in the team they leave. That team loses this manager.");
  }

  return {
    blockers,
    warnings,
    target: {
      orgId: target.id,
      action,
      membershipId: inTarget?.id ?? null,
      from: inTarget ? { status: inTarget.status, role: inTarget.role } : null,
      to: { status: "active", role },
    },
    deactivate,
    cancelInvites,
    emptiedTeams,
  };
}

export interface MergePlanInput {
  target: OrgRow;
  targetMemberships: MembershipRow[];
  targetApprovals: ApprovalRow[];
  source: OrgRow;
  sourceMemberships: MembershipRow[];
  sourceApprovals: ApprovalRow[];
}

export interface MergePlan {
  blockers: string[];
  warnings: string[];
  /** Source rows that simply change team. */
  move: Array<{ membershipId: string; email: string; role: string; status: string }>;
  /** Same person in both teams: one row survives (in the target). */
  conflicts: Array<{
    email: string;
    sourceMembershipId: string;
    targetMembershipId: string;
    source: { status: string; role: string };
    target: { status: string; role: string };
    /** "source" copies the source row's state onto the target row; "target" keeps the target row as it is. */
    keep: "source" | "target";
    resultRole: string;
    resultStatus: string;
  }>;
  approvalsMove: string[];
  /** Same driver and month in both: the target's row is replaced by the source's. */
  approvalsReplace: Array<{ sourceId: string; targetId: string; userId: string; month: string }>;
  /** Same driver and month in both: the source's row is dropped. */
  approvalsDrop: Array<{ sourceId: string; userId: string; month: string }>;
  occupiedAfter: number;
}

export function planMerge(input: MergePlanInput): MergePlan {
  const { target, source } = input;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (target.id === source.id) blockers.push("Pick two different teams.");
  if (source.stripeSubscriptionId) {
    blockers.push(`"${source.name}" has a Stripe subscription. Cancel it (or merge the other way round) before merging.`);
  }

  const move: MergePlan["move"] = [];
  const conflicts: MergePlan["conflicts"] = [];
  for (const s of input.sourceMemberships) {
    const t =
      input.targetMemberships.find((m) => m.invitedEmail === s.invitedEmail) ??
      (s.userId ? input.targetMemberships.find((m) => m.userId === s.userId) : undefined);
    if (!t) {
      move.push({ membershipId: s.id, email: s.invitedEmail, role: s.role, status: s.status });
      continue;
    }
    const keep = (STATUS_RANK[s.status] ?? 0) > (STATUS_RANK[t.status] ?? 0) ? "source" : "target";
    const resultRole = s.role === "admin" || t.role === "admin" ? "admin" : "driver";
    conflicts.push({
      email: s.invitedEmail,
      sourceMembershipId: s.id,
      targetMembershipId: t.id,
      source: { status: s.status, role: s.role },
      target: { status: t.status, role: t.role },
      keep,
      resultRole,
      resultStatus: keep === "source" ? s.status : t.status,
    });
  }

  const targetByKey = new Map(input.targetApprovals.map((a) => [`${a.userId}|${a.month}`, a]));
  const approvalsMove: string[] = [];
  const approvalsReplace: MergePlan["approvalsReplace"] = [];
  const approvalsDrop: MergePlan["approvalsDrop"] = [];
  for (const a of input.sourceApprovals) {
    const t = targetByKey.get(`${a.userId}|${a.month}`);
    if (!t) {
      approvalsMove.push(a.id);
    } else if (t.status === "pending" && a.status !== "pending") {
      approvalsReplace.push({ sourceId: a.id, targetId: t.id, userId: a.userId, month: a.month });
    } else {
      approvalsDrop.push({ sourceId: a.id, userId: a.userId, month: a.month });
    }
  }

  const occupiedAfter =
    input.targetMemberships.filter((m) => m.status !== "disabled").length +
    move.filter((m) => m.status !== "disabled").length +
    conflicts.filter((c) => c.target.status === "disabled" && c.resultStatus !== "disabled").length;
  if (target.seatCap != null && occupiedAfter > target.seatCap) {
    warnings.push(`"${target.name}" will have ${occupiedAfter} members, over its limit of ${target.seatCap}. Nobody loses access, but new invites will be refused until the limit is raised.`);
  }
  if (source.pilotFree !== target.pilotFree) {
    warnings.push(
      target.pilotFree
        ? `"${source.name}" is not a free pilot, "${target.name}" is: everyone moved in gets team Pro for free.`
        : `"${source.name}" is a free pilot, "${target.name}" is not: the people moved in lose team Pro unless "${target.name}" pays.`
    );
  }
  if (approvalsDrop.length > 0) {
    warnings.push(`${approvalsDrop.length} monthly approval${approvalsDrop.length === 1 ? "" : "s"} from "${source.name}" clash with "${target.name}" and are dropped (the target's are kept).`);
  }

  return { blockers, warnings, move, conflicts, approvalsMove, approvalsReplace, approvalsDrop, occupiedAfter };
}

// ── Needs attention ────────────────────────────────────────────────────────

export type AttentionKind =
  | "stale_invite"
  | "no_active_manager"
  | "duplicate"
  | "month_not_approved"
  | "driver_no_trips"
  | "payment_failed";

export interface AttentionItem {
  kind: AttentionKind;
  orgId: string;
  orgName: string;
  /** Other team in a duplicate pair. */
  otherOrgIds?: string[];
  detail: string;
  since: string | null;
  severity: "bad" | "warn";
}

export interface AttentionInput {
  now: Date;
  orgs: OrgRow[];
  memberships: MembershipRow[];
  duplicates: DuplicateGroup[];
  /** Approvals for last month (YYYY-MM), all teams. */
  lastMonth: string;
  lastMonthApprovals: ApprovalRow[];
  /** Day of the month in UK terms (1-31). */
  londonDayOfMonth: number;
  /** userIds with at least one trip this month (only checked after the 7th, so it is not raised on the 1st). */
  usersWithTripsThisMonth: ReadonlySet<string>;
  /** Team seat-billing payment failures (team.payment_failed events) in the window the caller chose. */
  paymentFailures: Array<{ orgId: string; at: Date }>;
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const { now, orgs, memberships } = input;
  const items: AttentionItem[] = [];
  const nameOf = new Map(orgs.map((o) => [o.id, o.name]));

  for (const m of memberships) {
    if (!nameOf.has(m.orgId) || !isStaleInvite(m, now)) continue;
    const days = Math.floor((now.getTime() - m.invitedAt.getTime()) / DAY_MS);
    const expired = inviteState(m, now) === "expired";
    items.push({
      kind: "stale_invite",
      orgId: m.orgId,
      orgName: nameOf.get(m.orgId)!,
      detail: `${m.invitedEmail} (${m.role === "admin" ? "manager" : "driver"}) invited ${days} days ago, not accepted${expired ? ", link expired" : ""}`,
      since: m.invitedAt.toISOString(),
      severity: m.role === "admin" ? "bad" : "warn",
    });
  }

  for (const o of orgs) {
    const mine = memberships.filter((m) => m.orgId === o.id);
    if (!mine.some((m) => m.role === "admin" && m.status === "active")) {
      const pendingManager = mine.some((m) => m.role === "admin" && m.status === "invited");
      items.push({
        kind: "no_active_manager",
        orgId: o.id,
        orgName: o.name,
        detail: pendingManager ? "No active manager yet (the manager's invite is still open)" : "No active manager and no manager invite open",
        since: o.createdAt.toISOString(),
        severity: pendingManager ? "warn" : "bad",
      });
    }
  }

  for (const d of input.duplicates) {
    items.push({
      kind: "duplicate",
      orgId: d.orgIds[0],
      orgName: nameOf.get(d.orgIds[0]) ?? d.orgIds[0],
      otherOrgIds: d.orgIds.slice(1),
      detail: `${d.detail}. Possibly the same company twice: check and merge if so.`,
      since: null,
      severity: "warn",
    });
  }

  // Last month not approved by the 5th: only teams that had active drivers.
  if (input.londonDayOfMonth > 5) {
    for (const o of orgs) {
      const drivers = memberships.filter((m) => m.orgId === o.id && m.role === "driver" && m.status === "active" && m.userId);
      if (drivers.length === 0) continue;
      const approved = new Set(
        input.lastMonthApprovals.filter((a) => a.orgId === o.id && a.status === "approved").map((a) => a.userId)
      );
      const waiting = drivers.filter((d) => !approved.has(d.userId!)).length;
      if (waiting === 0) continue;
      items.push({
        kind: "month_not_approved",
        orgId: o.id,
        orgName: o.name,
        detail: `${input.lastMonth}: ${waiting} of ${drivers.length} driver${drivers.length === 1 ? "" : "s"} not approved, and it is past the 5th`,
        since: null,
        severity: "warn",
      });
    }
  }

  if (input.londonDayOfMonth > 7) {
    for (const o of orgs) {
      const quiet = memberships.filter(
        (m) => m.orgId === o.id && m.role === "driver" && m.status === "active" && m.userId && !input.usersWithTripsThisMonth.has(m.userId)
      );
      if (quiet.length === 0) continue;
      items.push({
        kind: "driver_no_trips",
        orgId: o.id,
        orgName: o.name,
        detail: `${quiet.length} active driver${quiet.length === 1 ? " has" : "s have"} no trips this month: ${quiet.map((q) => q.invitedEmail).slice(0, 4).join(", ")}${quiet.length > 4 ? ", ..." : ""}`,
        since: null,
        severity: "warn",
      });
    }
  }

  const failuresByOrg = new Map<string, Date>();
  for (const f of input.paymentFailures) {
    const prev = failuresByOrg.get(f.orgId);
    if (!prev || f.at > prev) failuresByOrg.set(f.orgId, f.at);
  }
  for (const [orgId, at] of failuresByOrg) {
    items.push({
      kind: "payment_failed",
      orgId,
      orgName: nameOf.get(orgId) ?? orgId,
      detail: "Seat billing payment failed. Stripe retries on its own; check the card is sorted.",
      since: at.toISOString(),
      severity: "bad",
    });
  }

  const rank = (i: AttentionItem) => (i.severity === "bad" ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b) || a.orgName.localeCompare(b.orgName));
}
