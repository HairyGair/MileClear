import { describe, expect, it } from "vitest";
import {
  buildAttention,
  computeTeamJourney,
  countInvites,
  findDuplicateTeams,
  inferTeamSource,
  inviteState,
  invitesInEvent,
  isStaleInvite,
  normaliseTeamName,
  planKeyOf,
  planMerge,
  planMove,
  similarTeamNames,
  summariseFunnel,
  teamFlags,
  type ApprovalRow,
  type MembershipRow,
  type OrgRow,
  type TeamEventRow,
} from "../../services/milesheetAdmin.js";

const NOW = new Date("2026-10-04T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function org(id: string, over: Partial<OrgRow> = {}): OrgRow {
  return {
    id,
    name: id,
    createdAt: days(30),
    createdByUserId: "creator",
    pilotFree: false,
    seatCap: null,
    stripeSubscriptionId: null,
    seatsBilled: null,
    ...over,
  };
}

let seq = 0;
function mem(orgId: string, over: Partial<MembershipRow> = {}): MembershipRow {
  seq += 1;
  return {
    id: `m${seq}`,
    orgId,
    userId: null,
    role: "driver",
    status: "invited",
    invitedEmail: `p${seq}@x.co`,
    hasToken: true,
    inviteExpiresAt: new Date(NOW.getTime() + 86400000),
    invitedAt: days(1),
    acceptedAt: null,
    disabledAt: null,
    ...over,
  };
}

function ev(type: string, orgId: string | null, at: Date, metadata: Record<string, unknown> | null = null): TeamEventRow {
  return { type, userId: null, orgId, createdAt: at, metadata };
}

describe("invite state and counting", () => {
  it("tells a nominated driver waiting on their manager apart from an open invite", () => {
    expect(inviteState(mem("o", { userId: "u", hasToken: false }), NOW)).toBe("waiting_on_manager");
    expect(inviteState(mem("o"), NOW)).toBe("pending");
    expect(inviteState(mem("o", { inviteExpiresAt: days(1) }), NOW)).toBe("expired");
    expect(inviteState(mem("o", { status: "active" }), NOW)).toBe("none");
  });

  it("counts invites from each kind of event, and acceptances", () => {
    expect(invitesInEvent(ev("team.invites_sent", "o", NOW, { count: 4 }))).toBe(4);
    expect(invitesInEvent(ev("team.manager_nominated", "o", NOW))).toBe(1);
    expect(invitesInEvent(ev("team.invites_bulk_resent", null, NOW, { emails: ["a", "b", "c"] }))).toBe(3);
    expect(invitesInEvent(ev("team.invites_bulk_resent", null, NOW, { count: 11 }))).toBe(11);
    expect(invitesInEvent(ev("team.export", "o", NOW))).toBe(0);
    const c = countInvites(
      [ev("team.invites_sent", "o", days(2), { count: 3 }), ev("team.invite_accepted", "o", days(1)), ev("team.invites_sent", "o", days(40), { count: 5 })],
      days(30)
    );
    expect(c).toEqual({ sent: 3, accepted: 1, acceptanceRate: 1 / 3 });
    expect(countInvites([], null).acceptanceRate).toBeNull();
  });

  it("only calls a real invite stale after 7 days", () => {
    expect(isStaleInvite(mem("o", { invitedAt: days(8) }), NOW)).toBe(true);
    expect(isStaleInvite(mem("o", { invitedAt: days(3) }), NOW)).toBe(false);
    expect(isStaleInvite(mem("o", { invitedAt: days(20), userId: "u", hasToken: false }), NOW)).toBe(false);
  });
});

describe("team source", () => {
  it("prefers what the events say, then whether an admin created it", () => {
    const admins = new Set(["admin1"]);
    expect(inferTeamSource(org("a"), [ev("team.manager_nominated", "a", NOW)], admins)).toBe("nomination");
    expect(inferTeamSource(org("a"), [ev("team.self_serve_org_created", "a", NOW)], admins)).toBe("self_serve");
    expect(inferTeamSource(org("a", { createdByUserId: "admin1" }), [], admins)).toBe("admin");
    expect(inferTeamSource(org("a"), [], admins)).toBe("unknown");
  });
});

describe("team journey", () => {
  const o = org("t", { createdAt: days(20) });
  it("walks the steps in order and stops at the first gap", () => {
    const ms = [
      mem("t", { role: "admin", status: "active", userId: "boss", acceptedAt: days(18) }),
      mem("t", { role: "driver", status: "active", userId: "d1", acceptedAt: days(10) }),
    ];
    const approvals: ApprovalRow[] = [];
    const j = computeTeamJourney(o, ms, approvals, [ev("team.export", "t", days(2))]);
    expect(j.reached.managerAccepted).toBe(true);
    expect(j.reached.firstDriverActive).toBe(true);
    expect(j.reached.firstApproval).toBe(false);
    expect(j.reached.firstExport).toBe(true);
    // An export without an approval does not carry the team past the gap.
    expect(j.lastStep).toBe("firstDriverActive");
  });

  it("summarises counts, stalls and median days between steps", () => {
    const a = computeTeamJourney(org("a", { createdAt: days(10) }), [mem("a", { role: "admin", status: "active", userId: "x", acceptedAt: days(8) })], [], []);
    const b = computeTeamJourney(org("b", { createdAt: days(10) }), [mem("b", { role: "admin", status: "active", userId: "y", acceptedAt: days(6) })], [], []);
    const c = computeTeamJourney(org("c", { createdAt: days(10) }), [mem("c", { role: "admin" })], [], []);
    const steps = summariseFunnel([a, b, c]);
    const started = steps.find((s) => s.step === "started")!;
    const accepted = steps.find((s) => s.step === "managerAccepted")!;
    expect(started.reached).toBe(3);
    expect(started.stalledHere).toBe(1);
    expect(accepted.reached).toBe(2);
    expect(accepted.stalledHere).toBe(2);
    expect(accepted.medianDaysFromPrevious).toBe(3);
    expect(accepted.medianSample).toBe(2);
  });

  it("counts a team with a subscription as paying", () => {
    const j = computeTeamJourney(org("p", { stripeSubscriptionId: "sub_1" }), [], [], []);
    expect(j.reached.paying).toBe(true);
  });
});

describe("duplicates and flags", () => {
  it("normalises company noise and catches small typos", () => {
    expect(normaliseTeamName("The Maids of Glory Ltd.")).toBe("maidsofglory");
    expect(similarTeamNames("Maids Of Glory", "maids of glory limited")).toBe(true);
    expect(similarTeamNames("Ben Pegg Haulage", "Ben Peg Haulage")).toBe(true);
    expect(similarTeamNames("Acme", "Acne")).toBe(false);
    expect(similarTeamNames("North Logistics", "South Logistics")).toBe(false);
  });

  it("groups teams with the same manager or a similar name, once per pair", () => {
    const orgs = [org("a", { name: "Maids Of Glory" }), org("b", { name: "Maids of Glory" }), org("c", { name: "Other" })];
    const ms = [
      mem("a", { role: "admin", invitedEmail: "boss@x.co" }),
      mem("b", { role: "admin", invitedEmail: "boss@x.co" }),
      mem("c", { role: "admin", invitedEmail: "boss@x.co", status: "disabled" }),
    ];
    const groups = findDuplicateTeams(orgs, ms);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("same_manager");
    expect(groups[0].orgIds).toEqual(["a", "b"]);
    const flags = teamFlags("a", ms, groups, NOW);
    expect(flags).toContain("duplicate");
    expect(flags).toContain("no_active_manager");
  });
});

describe("planMove (the Maids Of Glory case)", () => {
  const oldTeam = org("a89eca41", { name: "Maids Of Glory" });
  const newTeam = org("e87cd7c2", { name: "Maids Of Glory" });
  const marie = { userId: "marie", email: "marie@maidsofglory.co.uk" };
  const marieOld = mem("a89eca41", { role: "admin", status: "active", userId: "marie", invitedEmail: marie.email, hasToken: false, acceptedAt: days(5) });
  const rob = mem("e87cd7c2", { role: "admin", status: "active", userId: "rob", invitedEmail: "rob@x.co", hasToken: false, acceptedAt: days(6) });
  const approvalOld: ApprovalRow = { id: "ap1", orgId: "a89eca41", userId: "marie", month: "2026-09", status: "approved", approvedAt: days(3) };

  const base = {
    target: newTeam,
    targetMemberships: [rob],
    person: marie,
    role: "admin" as const,
    personMemberships: [marieOld],
    otherOrgs: [{ org: oldTeam, memberships: [marieOld], approvals: [approvalOld] }],
    targetApprovals: [],
  };

  it("deactivates her old membership, creates the new one and offers to delete the emptied team", () => {
    const p = planMove({ ...base, deleteEmptiedTeams: false });
    expect(p.blockers).toEqual([]);
    expect(p.target.action).toBe("create");
    expect(p.deactivate.map((d) => d.membershipId)).toEqual([marieOld.id]);
    expect(p.emptiedTeams).toHaveLength(1);
    expect(p.emptiedTeams[0].deletable).toBe(true);
    expect(p.emptiedTeams[0].willDelete).toBe(false);
    expect(p.warnings.some((w) => w.includes("nobody active"))).toBe(true);
  });

  it("moves her approvals across when the emptied team is deleted", () => {
    const p = planMove({ ...base, deleteEmptiedTeams: true });
    expect(p.emptiedTeams[0].willDelete).toBe(true);
    expect(p.emptiedTeams[0].approvalsMoved).toBe(1);
    expect(p.emptiedTeams[0].approvalsLost).toBe(0);
    expect(planKeyOf(p)).not.toBe(planKeyOf(planMove({ ...base, deleteEmptiedTeams: false })));
  });

  it("never deletes a team with a subscription", () => {
    const p = planMove({ ...base, otherOrgs: [{ org: { ...oldTeam, stripeSubscriptionId: "sub" }, memberships: [marieOld], approvals: [] }], deleteEmptiedTeams: true });
    expect(p.emptiedTeams[0].deletable).toBe(false);
    expect(p.emptiedTeams[0].willDelete).toBe(false);
  });

  it("refuses when the target team is full, and when there is nothing to do", () => {
    const full = planMove({ ...base, target: { ...newTeam, seatCap: 1 }, deleteEmptiedTeams: false });
    expect(full.blockers[0]).toMatch(/member limit/);
    const already = mem("e87cd7c2", { role: "admin", status: "active", userId: "marie", invitedEmail: marie.email });
    const none = planMove({ ...base, targetMemberships: [rob, already], personMemberships: [already], otherOrgs: [], deleteEmptiedTeams: false });
    expect(none.target.action).toBe("none");
    expect(none.blockers[0]).toMatch(/Nothing to change/);
  });

  it("re-activates an existing invite in the target instead of creating a second row", () => {
    const invite = mem("e87cd7c2", { role: "driver", invitedEmail: marie.email });
    const p = planMove({ ...base, targetMemberships: [rob, invite], deleteEmptiedTeams: false });
    expect(p.target.action).toBe("update");
    expect(p.target.membershipId).toBe(invite.id);
    expect(p.target.from).toEqual({ status: "invited", role: "driver" });
  });

  it("leaves a team that still has someone active alone", () => {
    const colleague = mem("a89eca41", { status: "active", userId: "c" });
    const p = planMove({ ...base, otherOrgs: [{ org: oldTeam, memberships: [marieOld, colleague], approvals: [] }], deleteEmptiedTeams: true });
    expect(p.emptiedTeams).toEqual([]);
  });
});

describe("planMerge", () => {
  const target = org("t", { name: "Ben Pegg" });
  const source = org("s", { name: "Ben pegg" });

  it("moves new people, resolves the same email once, and keeps the better row", () => {
    const tBen = mem("t", { role: "admin", status: "invited", invitedEmail: "ben@x.co" });
    const sBen = mem("s", { role: "admin", status: "active", userId: "ben", invitedEmail: "ben@x.co" });
    const sDriver = mem("s", { status: "active", userId: "d", invitedEmail: "d@x.co" });
    const p = planMerge({ target, targetMemberships: [tBen], targetApprovals: [], source, sourceMemberships: [sBen, sDriver], sourceApprovals: [] });
    expect(p.blockers).toEqual([]);
    expect(p.move.map((m) => m.email)).toEqual(["d@x.co"]);
    expect(p.conflicts).toHaveLength(1);
    expect(p.conflicts[0].keep).toBe("source");
    expect(p.conflicts[0].resultStatus).toBe("active");
    expect(p.occupiedAfter).toBe(2);
  });

  it("moves approvals, replaces a pending one, drops a clash", () => {
    const a = (id: string, orgId: string, userId: string, month: string, status: string): ApprovalRow => ({ id, orgId, userId, month, status, approvedAt: null });
    const p = planMerge({
      target,
      targetMemberships: [],
      targetApprovals: [a("t1", "t", "u", "2026-08", "pending"), a("t2", "t", "u", "2026-09", "approved")],
      source,
      sourceMemberships: [],
      sourceApprovals: [a("s1", "s", "u", "2026-07", "approved"), a("s2", "s", "u", "2026-08", "approved"), a("s3", "s", "u", "2026-09", "approved")],
    });
    expect(p.approvalsMove).toEqual(["s1"]);
    expect(p.approvalsReplace).toEqual([{ sourceId: "s2", targetId: "t1", userId: "u", month: "2026-08" }]);
    expect(p.approvalsDrop.map((d) => d.sourceId)).toEqual(["s3"]);
  });

  it("refuses to merge away a team with a subscription or a team into itself", () => {
    expect(planMerge({ target, targetMemberships: [], targetApprovals: [], source: { ...source, stripeSubscriptionId: "sub" }, sourceMemberships: [], sourceApprovals: [] }).blockers).toHaveLength(1);
    expect(planMerge({ target, targetMemberships: [], targetApprovals: [], source: target, sourceMemberships: [], sourceApprovals: [] }).blockers[0]).toMatch(/two different/);
  });

  it("warns when the merge takes the target over its member limit", () => {
    const p = planMerge({
      target: { ...target, seatCap: 1 },
      targetMemberships: [mem("t", { status: "active", userId: "a" })],
      targetApprovals: [],
      source,
      sourceMemberships: [mem("s", { status: "active", userId: "b" })],
      sourceApprovals: [],
    });
    expect(p.warnings.some((w) => w.includes("over its limit"))).toBe(true);
  });
});

describe("buildAttention", () => {
  it("lists stale invites, missing managers, unapproved months, quiet drivers and payment failures", () => {
    const o = org("o", { name: "Acme" });
    const ms = [
      mem("o", { role: "admin", invitedAt: days(10) }),
      mem("o", { status: "active", userId: "d1", hasToken: false }),
      mem("o", { status: "active", userId: "d2", hasToken: false }),
    ];
    const items = buildAttention({
      now: NOW,
      orgs: [o],
      memberships: ms,
      duplicates: [],
      lastMonth: "2026-09",
      lastMonthApprovals: [{ id: "a", orgId: "o", userId: "d1", month: "2026-09", status: "approved", approvedAt: days(2) }],
      londonDayOfMonth: 8,
      usersWithTripsThisMonth: new Set(["d1"]),
      paymentFailures: [{ orgId: "o", at: days(1) }],
    });
    const kinds = items.map((i) => i.kind).sort();
    expect(kinds).toEqual(["driver_no_trips", "month_not_approved", "no_active_manager", "payment_failed", "stale_invite"]);
    expect(items[0].severity).toBe("bad");
  });

  it("does not chase approvals before the 6th", () => {
    const o = org("o");
    const items = buildAttention({
      now: NOW,
      orgs: [o],
      memberships: [mem("o", { role: "admin", status: "active", userId: "b" }), mem("o", { status: "active", userId: "d" })],
      duplicates: [],
      lastMonth: "2026-09",
      lastMonthApprovals: [],
      londonDayOfMonth: 4,
      usersWithTripsThisMonth: new Set(),
      paymentFailures: [],
    });
    expect(items).toEqual([]);
  });
});
