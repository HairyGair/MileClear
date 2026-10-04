import crypto from "node:crypto";
import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { sendManagerNominationEmail, sendTeamInviteEmail } from "../../services/email.js";
import { getSeatBilling, getSeatPricePence, syncSeats } from "../../services/teamBilling.js";
import { invalidatePremiumCache } from "../../middleware/premium.js";
import { resolvePremiumStatus } from "../../services/referral.js";
import { newTeamsMode } from "../../services/milesheetNewTeams.js";
import { recordWaitlistRequest } from "../../services/milesheetTeams.js";
import { TEAM_TRIAL_DAYS, TEAM_TRIAL_SEAT_CAP, isOrgEntitled } from "../../services/teamTrial.js";
import { TEAM_DRIVER_BANDS } from "../teamInterest/index.js";
import {
  computeTeamMonthSummary,
  currentLondonMonth,
  londonMonthBounds,
  previousMonth,
} from "../../services/teamExport.js";
import {
  JOURNEY_STEPS,
  buildAttention,
  computeTeamJourney,
  countInvites,
  findDuplicateTeams,
  inferTeamSource,
  inviteState,
  planKeyOf,
  planMerge,
  planMove,
  summariseFunnel,
  teamFlags,
  type ApprovalRow,
  type MembershipRow,
  type OrgRow,
  type TeamEventRow,
} from "../../services/milesheetAdmin.js";

// Milesheet admin (4 Oct 2026): the company side of MileClear, seen from the
// MileClear admin. Registered inside adminRoutes, so the auth + admin hooks
// already apply to every route here.
//
// Reads: overview, journey (funnel), teams list, needs attention, one team.
// Writes (each logs "admin.milesheet.<action>" with adminUserId and
// before/after): resend / cancel / extend an invite, move a person into a
// team, merge two teams, change the member limit, toggle the free pilot.
// Move and merge are preview-then-apply: the preview returns a planKey and
// the apply refuses (409) when the plan worked out again no longer matches,
// so the admin only ever applies what they were shown.
//
// The pure rules live in services/milesheetAdmin.ts (tested).

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TEAM_EVENT_CAP = 20000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function metaOf(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const MEMBERSHIP_SELECT = {
  id: true,
  orgId: true,
  userId: true,
  role: true,
  status: true,
  invitedEmail: true,
  inviteTokenHash: true,
  inviteExpiresAt: true,
  invitedAt: true,
  acceptedAt: true,
  disabledAt: true,
} as const;

type RawMembership = Prisma.OrgMembershipGetPayload<{ select: typeof MEMBERSHIP_SELECT }>;

function toMembershipRow(m: RawMembership): MembershipRow {
  return {
    id: m.id,
    orgId: m.orgId,
    userId: m.userId,
    role: m.role,
    status: m.status,
    invitedEmail: m.invitedEmail.toLowerCase(),
    hasToken: !!m.inviteTokenHash,
    inviteExpiresAt: m.inviteExpiresAt,
    invitedAt: m.invitedAt,
    acceptedAt: m.acceptedAt,
    disabledAt: m.disabledAt,
  };
}

const ORG_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  createdByUserId: true,
  pilotFree: true,
  seatCap: true,
  stripeSubscriptionId: true,
  seatsBilled: true,
  trialEndsAt: true,
} as const;

async function loadOrg(orgId: string): Promise<OrgRow | null> {
  return prisma.organisation.findUnique({ where: { id: orgId }, select: ORG_SELECT });
}

async function loadTeamEvents(): Promise<TeamEventRow[]> {
  const rows = await prisma.appEvent.findMany({
    where: { OR: [{ type: { startsWith: "team." } }, { type: { startsWith: "admin.milesheet." } }] },
    select: { type: true, userId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: TEAM_EVENT_CAP,
  });
  return rows.map((r) => {
    const meta = metaOf(r.metadata);
    return {
      type: r.type,
      userId: r.userId,
      orgId: typeof meta?.orgId === "string" ? meta.orgId : null,
      createdAt: r.createdAt,
      metadata: meta,
    };
  });
}

/** Everything the list views need, loaded once per request. Team volumes are small (tens of teams). */
async function loadAll() {
  const [orgs, rawMemberships, approvals, events, admins] = await Promise.all([
    prisma.organisation.findMany({ select: ORG_SELECT, orderBy: { createdAt: "asc" } }),
    prisma.orgMembership.findMany({
      select: {
        ...MEMBERSHIP_SELECT,
        user: {
          select: {
            email: true,
            displayName: true,
            lastTripAt: true,
            isPremium: true,
            premiumExpiresAt: true,
            referralProUntil: true,
          },
        },
      },
    }),
    prisma.teamApproval.findMany({
      select: { id: true, orgId: true, userId: true, month: true, status: true, approvedAt: true },
    }),
    loadTeamEvents(),
    prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } }),
  ]);
  const memberships = rawMemberships.map(toMembershipRow);
  const users = new Map(rawMemberships.filter((m) => m.userId && m.user).map((m) => [m.userId!, m.user!]));
  const eventsByOrg = new Map<string, TeamEventRow[]>();
  for (const e of events) {
    if (!e.orgId) continue;
    const list = eventsByOrg.get(e.orgId) ?? [];
    list.push(e);
    eventsByOrg.set(e.orgId, list);
  }
  return {
    orgs,
    memberships,
    users,
    approvals: approvals as ApprovalRow[],
    events,
    eventsByOrg,
    adminIds: new Set(admins.map((a) => a.id)),
  };
}

function londonDayOfMonth(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric" }).format(now));
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function billingStatusOf(org: OrgRow): "pilot" | "paying" | "none" {
  if (org.pilotFree) return "pilot";
  if (org.stripeSubscriptionId) return "paying";
  return "none";
}

function bad(reply: FastifyReply, status: number, error: string) {
  return reply.status(status).send({ error });
}

async function actorEmails(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, email: true } });
  return new Map(rows.map((r) => [r.id, r.email]));
}

export async function adminMilesheetRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /admin/milesheet/overview ──────────────────────────────────────
  app.get("/milesheet/overview", async (_request, reply) => {
    const now = new Date();
    const { orgs, memberships, users, events } = await loadAll();
    const pricePerSeatPence = await getSeatPricePence();

    const entitled = new Set(orgs.filter((o) => isOrgEntitled({ ...o, trialEndsAt: o.trialEndsAt ?? null }, now)).map((o) => o.id));
    const activeMembers = memberships.filter((m) => m.status === "active" && m.userId);
    const teamProUsers = new Set(activeMembers.filter((m) => entitled.has(m.orgId)).map((m) => m.userId!));
    let teamProOnly = 0;
    for (const uid of teamProUsers) {
      const u = users.get(uid);
      if (!u || !resolvePremiumStatus(u).active) teamProOnly += 1;
    }

    const paying = orgs.filter((o) => !o.pilotFree && o.stripeSubscriptionId);
    const seatsBilled = paying.reduce((s, o) => s + (o.seatsBilled ?? 0), 0);
    const states = memberships.map((m) => inviteState(m, now));
    const since30 = new Date(now.getTime() - 30 * DAY_MS);

    return reply.send({
      data: {
        generatedAt: now.toISOString(),
        teams: {
          total: orgs.length,
          pilot: orgs.filter((o) => o.pilotFree).length,
          paying: paying.length,
          neither: orgs.filter((o) => !o.pilotFree && !o.stripeSubscriptionId).length,
        },
        activeDrivers: activeMembers.filter((m) => m.role === "driver").length,
        activeManagers: activeMembers.filter((m) => m.role === "admin").length,
        seatsBilled,
        pricePerSeatPence,
        monthlyRevenuePence: pricePerSeatPence == null ? null : seatsBilled * pricePerSeatPence,
        invites: {
          last30d: countInvites(events, since30),
          allTime: countInvites(events, null),
          pending: states.filter((s) => s === "pending").length,
          expired: states.filter((s) => s === "expired").length,
          waitingOnManager: states.filter((s) => s === "waiting_on_manager").length,
        },
        proThroughTeams: teamProUsers.size,
        proThroughTeamsOnly: teamProOnly,
      },
    });
  });

  // ── GET /admin/milesheet/journey ───────────────────────────────────────
  app.get("/milesheet/journey", async (_request, reply) => {
    const { orgs, memberships, approvals, eventsByOrg, adminIds } = await loadAll();
    const journeys = orgs.map((o) =>
      computeTeamJourney(
        o,
        memberships.filter((m) => m.orgId === o.id),
        approvals.filter((a) => a.orgId === o.id),
        eventsByOrg.get(o.id) ?? []
      )
    );
    return reply.send({
      data: {
        generatedAt: new Date().toISOString(),
        steps: summariseFunnel(journeys),
        teams: journeys.map((j) => {
          const org = orgs.find((o) => o.id === j.orgId)!;
          return {
            orgId: j.orgId,
            name: org.name,
            source: inferTeamSource(org, eventsByOrg.get(org.id) ?? [], adminIds),
            lastStep: j.lastStep,
            reached: j.reached,
            dates: Object.fromEntries(JOURNEY_STEPS.map((s) => [s, iso(j.dates[s])])),
          };
        }),
      },
    });
  });

  // ── GET /admin/milesheet/teams ─────────────────────────────────────────
  app.get("/milesheet/teams", async (_request, reply) => {
    const now = new Date();
    const { orgs, memberships, users, approvals, eventsByOrg, adminIds } = await loadAll();
    const duplicates = findDuplicateTeams(orgs, memberships);
    const thisMonth = currentLondonMonth();
    const lastMonth = previousMonth(thisMonth);

    // This month's miles and claim: the same computation the manager's
    // portal shows (per-driver rate, tax-year aware, one 10,000-mile
    // threshold across cars and vans). A handful of teams at a time.
    const monthByOrg = new Map<string, { miles: number; amountPence: number }>();
    for (let i = 0; i < orgs.length; i += 5) {
      const chunk = orgs.slice(i, i + 5);
      const sums = await Promise.all(
        chunk.map((o) =>
          computeTeamMonthSummary(o.id, thisMonth)
            .then((s) => ({ id: o.id, miles: s.totalMiles, amountPence: s.totalAmountPence }))
            .catch(() => ({ id: o.id, miles: 0, amountPence: 0 }))
        )
      );
      for (const s of sums) monthByOrg.set(s.id, { miles: s.miles, amountPence: s.amountPence });
    }

    const rows = orgs.map((o) => {
      const mine = memberships.filter((m) => m.orgId === o.id);
      const managers = mine
        .filter((m) => m.role === "admin" && m.status !== "disabled")
        .map((m) => ({ email: m.userId ? (users.get(m.userId)?.email ?? m.invitedEmail) : m.invitedEmail, status: m.status }));
      const lastTrips = mine
        .map((m) => (m.userId ? users.get(m.userId)?.lastTripAt ?? null : null))
        .filter((d): d is Date => !!d);
      const lastTripAt = lastTrips.length ? new Date(Math.max(...lastTrips.map((d) => d.getTime()))) : null;
      const drivers = mine.filter((m) => m.role === "driver" && m.status === "active" && m.userId);
      const lmApprovals = approvals.filter((a) => a.orgId === o.id && a.month === lastMonth);
      return {
        orgId: o.id,
        name: o.name,
        createdAt: o.createdAt.toISOString(),
        source: inferTeamSource(o, eventsByOrg.get(o.id) ?? [], adminIds),
        managers,
        counts: {
          active: mine.filter((m) => m.status === "active").length,
          invited: mine.filter((m) => m.status === "invited").length,
          disabled: mine.filter((m) => m.status === "disabled").length,
        },
        lastTripAt: iso(lastTripAt),
        monthMiles: monthByOrg.get(o.id)?.miles ?? 0,
        monthAmountPence: monthByOrg.get(o.id)?.amountPence ?? 0,
        lastMonth: {
          month: lastMonth,
          drivers: drivers.length,
          approved: lmApprovals.filter((a) => a.status === "approved").length,
          queried: lmApprovals.filter((a) => a.status === "queried").length,
        },
        billing: {
          status: billingStatusOf(o),
          seatsBilled: o.seatsBilled,
          seatCap: o.seatCap,
          occupied: mine.filter((m) => m.status !== "disabled").length,
        },
        flags: teamFlags(o.id, memberships, duplicates, now),
      };
    });

    return reply.send({ data: { generatedAt: now.toISOString(), month: thisMonth, rows } });
  });

  // ── GET /admin/milesheet/attention ─────────────────────────────────────
  app.get("/milesheet/attention", async (_request, reply) => {
    const now = new Date();
    const { orgs, memberships, approvals, events } = await loadAll();
    const thisMonth = currentLondonMonth();
    const lastMonth = previousMonth(thisMonth);
    const { start } = londonMonthBounds(thisMonth);
    const driverIds = [
      ...new Set(memberships.filter((m) => m.role === "driver" && m.status === "active" && m.userId).map((m) => m.userId!)),
    ];
    const withTrips = driverIds.length
      ? await prisma.trip.groupBy({ by: ["userId"], where: { userId: { in: driverIds }, startedAt: { gte: start } } })
      : [];
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const items = buildAttention({
      now,
      orgs,
      memberships,
      duplicates: findDuplicateTeams(orgs, memberships),
      lastMonth,
      lastMonthApprovals: approvals.filter((a) => a.month === lastMonth),
      londonDayOfMonth: londonDayOfMonth(now),
      usersWithTripsThisMonth: new Set(withTrips.map((t) => t.userId)),
      paymentFailures: events
        .filter((e) => e.type === "team.payment_failed" && e.orgId && e.createdAt >= since30)
        .map((e) => ({ orgId: e.orgId!, at: e.createdAt })),
    });
    return reply.send({ data: { generatedAt: now.toISOString(), items } });
  });

  // ── GET /admin/milesheet/teams/:orgId ──────────────────────────────────
  app.get("/milesheet/teams/:orgId", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const now = new Date();
    const org = await prisma.organisation.findUnique({
      where: { id: orgId },
      select: { ...ORG_SELECT, defaultRatePence: true, billingEmail: true, stripeCustomerId: true },
    });
    if (!org) return bad(reply, 404, "Team not found");

    const [rawMemberships, approvals, allEvents, adminRows, allOrgs, allMemberships] = await Promise.all([
      prisma.orgMembership.findMany({
        where: { orgId },
        select: { ...MEMBERSHIP_SELECT, user: { select: { email: true, displayName: true, lastTripAt: true } } },
        orderBy: [{ status: "asc" }, { invitedAt: "asc" }],
      }),
      prisma.teamApproval.findMany({
        where: { orgId },
        select: { id: true, orgId: true, userId: true, month: true, status: true, approvedAt: true, milesAtApproval: true, amountPenceAtApproval: true, note: true },
        orderBy: { month: "desc" },
      }),
      loadTeamEvents(),
      prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } }),
      prisma.organisation.findMany({ select: { id: true, name: true } }),
      prisma.orgMembership.findMany({ select: MEMBERSHIP_SELECT }),
    ]);
    const memberships = rawMemberships.map(toMembershipRow);
    const orgEvents = allEvents.filter(
      (e) => e.orgId === orgId || e.metadata?.sourceOrgId === orgId || e.metadata?.fromOrgId === orgId
    );
    const actors = await actorEmails([...orgEvents.map((e) => e.userId ?? ""), ...approvals.map((a) => a.userId)]);
    const adminIds = new Set(adminRows.map((a) => a.id));
    const duplicates = findDuplicateTeams(allOrgs, allMemberships.map(toMembershipRow)).filter((d) => d.orgIds.includes(orgId));
    const [billing, month] = await Promise.all([
      getSeatBilling(orgId),
      computeTeamMonthSummary(orgId, currentLondonMonth()).catch(() => null),
    ]);

    // Approvals by month, newest first.
    const byMonth = new Map<string, { month: string; approved: number; queried: number; pending: number; miles: number; amountPence: number; rows: unknown[] }>();
    for (const a of approvals) {
      const m = byMonth.get(a.month) ?? { month: a.month, approved: 0, queried: 0, pending: 0, miles: 0, amountPence: 0, rows: [] };
      if (a.status === "approved") {
        m.approved += 1;
        m.miles += a.milesAtApproval ?? 0;
        m.amountPence += a.amountPenceAtApproval ?? 0;
      } else if (a.status === "queried") m.queried += 1;
      else m.pending += 1;
      m.rows.push({
        userId: a.userId,
        email: actors.get(a.userId) ?? null,
        status: a.status,
        approvedAt: iso(a.approvedAt),
        miles: a.milesAtApproval,
        amountPence: a.amountPenceAtApproval,
        note: a.note,
      });
      byMonth.set(a.month, m);
    }

    return reply.send({
      data: {
        generatedAt: now.toISOString(),
        org: {
          id: org.id,
          name: org.name,
          createdAt: org.createdAt.toISOString(),
          createdByUserId: org.createdByUserId,
          pilotFree: org.pilotFree,
          seatCap: org.seatCap,
          seatsBilled: org.seatsBilled,
          stripeSubscriptionId: org.stripeSubscriptionId,
          stripeCustomerId: org.stripeCustomerId,
          billingEmail: org.billingEmail,
          defaultRatePence: org.defaultRatePence,
          source: inferTeamSource(org, orgEvents, adminIds),
        },
        billing,
        flags: teamFlags(orgId, memberships, duplicates, now),
        duplicates: duplicates.map((d) => ({
          ...d,
          others: d.orgIds.filter((id) => id !== orgId).map((id) => ({ id, name: allOrgs.find((o) => o.id === id)?.name ?? id })),
        })),
        journey: (() => {
          const j = computeTeamJourney(org, memberships, approvals, orgEvents);
          return { lastStep: j.lastStep, reached: j.reached, dates: Object.fromEntries(JOURNEY_STEPS.map((s) => [s, iso(j.dates[s])])) };
        })(),
        members: rawMemberships.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          status: m.status,
          email: m.user?.email ?? m.invitedEmail,
          invitedEmail: m.invitedEmail,
          displayName: m.user?.displayName ?? null,
          invitedAt: m.invitedAt.toISOString(),
          acceptedAt: iso(m.acceptedAt),
          disabledAt: iso(m.disabledAt),
          inviteExpiresAt: iso(m.inviteExpiresAt),
          inviteState: inviteState(toMembershipRow(m), now),
          lastTripAt: iso(m.user?.lastTripAt),
        })),
        month: month
          ? { month: month.month, totalMiles: month.totalMiles, totalAmountPence: month.totalAmountPence, approved: month.approvedCount, pending: month.pendingCount, queried: month.queriedCount }
          : null,
        approvals: [...byMonth.values()],
        events: orgEvents.slice(0, 200).map((e) => ({
          type: e.type,
          at: e.createdAt.toISOString(),
          actorEmail: e.userId ? (actors.get(e.userId) ?? null) : null,
          metadata: e.metadata,
        })),
      },
    });
  });

  // ── Invite actions ─────────────────────────────────────────────────────

  async function loadInvite(id: string) {
    return prisma.orgMembership.findUnique({
      where: { id },
      select: { ...MEMBERSHIP_SELECT, org: { select: { id: true, name: true, createdByUserId: true } } },
    });
  }

  // POST /admin/milesheet/memberships/:id/resend
  app.post("/milesheet/memberships/:id/resend", async (request, reply) => {
    const { id } = request.params as { id: string };
    const m = await loadInvite(id);
    if (!m) return bad(reply, 404, "Invite not found");
    if (m.status !== "invited") return bad(reply, 400, "Only an open invite can be resent.");
    if (m.userId && !m.inviteTokenHash) {
      return bad(reply, 400, "This driver is waiting on their manager. Resend the manager's invite instead.");
    }

    const orgEvents = (await loadTeamEvents()).filter((e) => e.orgId === m.orgId);
    const nominated = m.role === "admin" && orgEvents.some((e) => e.type === "team.manager_nominated");
    const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await prisma.orgMembership.update({
      where: { id },
      data: { inviteTokenHash: hashToken(token), inviteExpiresAt: expiresAt, invitedAt: new Date() },
    });

    let emailSent = true;
    let wording: "manager_nomination" | "team_invite" = "team_invite";
    try {
      if (nominated) {
        wording = "manager_nomination";
        const nominator = await prisma.user.findUnique({ where: { id: m.org.createdByUserId }, select: { displayName: true } });
        await sendManagerNominationEmail(m.invitedEmail, nominator?.displayName ?? "A MileClear user", m.org.name, token);
      } else {
        await sendTeamInviteEmail(m.invitedEmail, m.org.name, token, m.role === "admin" ? "admin" : "driver");
      }
    } catch (err) {
      emailSent = false;
      request.log.error({ err, membershipId: id }, "admin milesheet resend: email failed (invite renewed)");
    }

    logEvent("admin.milesheet.resend_invite", request.userId!, {
      adminUserId: request.userId,
      orgId: m.orgId,
      membershipId: id,
      email: m.invitedEmail,
      wording,
      emailSent,
      before: { inviteExpiresAt: iso(m.inviteExpiresAt), invitedAt: iso(m.invitedAt) },
      after: { inviteExpiresAt: expiresAt.toISOString() },
    });
    return reply.send({ data: { ok: true, emailSent, wording, inviteExpiresAt: expiresAt.toISOString() } });
  });

  // POST /admin/milesheet/memberships/:id/cancel
  app.post("/milesheet/memberships/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const m = await loadInvite(id);
    if (!m) return bad(reply, 404, "Invite not found");
    if (m.status !== "invited") return bad(reply, 400, "Only an open invite can be cancelled.");
    await prisma.orgMembership.update({
      where: { id },
      data: { status: "disabled", disabledAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null },
    });
    logEvent("admin.milesheet.cancel_invite", request.userId!, {
      adminUserId: request.userId,
      orgId: m.orgId,
      membershipId: id,
      email: m.invitedEmail,
      before: { status: m.status, inviteExpiresAt: iso(m.inviteExpiresAt) },
      after: { status: "disabled" },
    });
    return reply.send({ data: { ok: true } });
  });

  // POST /admin/milesheet/memberships/:id/extend { days: 7 | 14 }
  app.post("/milesheet/memberships/:id/extend", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ days: z.union([z.literal(7), z.literal(14)]) }).safeParse(request.body);
    if (!parsed.success) return bad(reply, 400, "days must be 7 or 14");
    const m = await loadInvite(id);
    if (!m) return bad(reply, 404, "Invite not found");
    if (m.status !== "invited" || !m.inviteTokenHash) {
      return bad(reply, 400, "Only an open invite with a link can be extended.");
    }
    // From the current expiry, or from now if it has already run out (the
    // old link then works again, with no new email).
    const base = Math.max(Date.now(), m.inviteExpiresAt?.getTime() ?? 0);
    const expiresAt = new Date(base + parsed.data.days * DAY_MS);
    await prisma.orgMembership.update({ where: { id }, data: { inviteExpiresAt: expiresAt } });
    logEvent("admin.milesheet.extend_invite", request.userId!, {
      adminUserId: request.userId,
      orgId: m.orgId,
      membershipId: id,
      email: m.invitedEmail,
      days: parsed.data.days,
      before: { inviteExpiresAt: iso(m.inviteExpiresAt) },
      after: { inviteExpiresAt: expiresAt.toISOString() },
    });
    return reply.send({ data: { ok: true, inviteExpiresAt: expiresAt.toISOString() } });
  });

  // ── Move a person into this team ───────────────────────────────────────

  const moveSchema = z
    .object({
      email: z.string().trim().email().max(255).optional(),
      userId: z.string().min(1).max(64).optional(),
      role: z.enum(["admin", "driver"]),
      deleteEmptiedTeams: z.boolean().optional().default(false),
      planKey: z.string().max(64).optional(),
    })
    .refine((v) => !!v.email || !!v.userId, "Give an email address or a user id");

  async function buildMove(orgId: string, body: z.infer<typeof moveSchema>) {
    const target = await loadOrg(orgId);
    if (!target) return { error: "Team not found", status: 404 } as const;
    const user = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, email: true, displayName: true } })
      : await prisma.user.findFirst({ where: { email: body.email!.toLowerCase() }, select: { id: true, email: true, displayName: true } });
    if (!user) {
      return { error: "No MileClear account with that email or id. Invite them from the team's portal instead.", status: 404 } as const;
    }
    const email = user.email.toLowerCase();
    const personRaw = await prisma.orgMembership.findMany({
      where: { OR: [{ userId: user.id }, { invitedEmail: email }] },
      select: MEMBERSHIP_SELECT,
    });
    const otherOrgIds = [...new Set(personRaw.map((m) => m.orgId).filter((id) => id !== orgId))];
    const [targetRaw, targetApprovals, otherOrgs] = await Promise.all([
      prisma.orgMembership.findMany({ where: { orgId }, select: MEMBERSHIP_SELECT }),
      prisma.teamApproval.findMany({ where: { orgId }, select: { id: true, orgId: true, userId: true, month: true, status: true, approvedAt: true } }),
      Promise.all(
        otherOrgIds.map(async (id) => ({
          org: (await loadOrg(id))!,
          memberships: (await prisma.orgMembership.findMany({ where: { orgId: id }, select: MEMBERSHIP_SELECT })).map(toMembershipRow),
          approvals: (await prisma.teamApproval.findMany({
            where: { orgId: id },
            select: { id: true, orgId: true, userId: true, month: true, status: true, approvedAt: true },
          })) as ApprovalRow[],
        }))
      ),
    ]);
    const plan = planMove({
      target,
      targetMemberships: targetRaw.map(toMembershipRow),
      person: { userId: user.id, email },
      role: body.role,
      personMemberships: personRaw.map(toMembershipRow),
      otherOrgs: otherOrgs.filter((o) => o.org),
      targetApprovals: targetApprovals as ApprovalRow[],
      deleteEmptiedTeams: body.deleteEmptiedTeams,
    });
    return { target, user, plan, planKey: planKeyOf(plan), targetApprovals: targetApprovals as ApprovalRow[] } as const;
  }

  // POST /admin/milesheet/teams/:orgId/move/preview
  app.post("/milesheet/teams/:orgId/move/preview", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const parsed = moveSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, 400, parsed.error.issues[0].message);
    const built = await buildMove(orgId, parsed.data);
    if ("error" in built) return bad(reply, built.status!, built.error!);
    return reply.send({
      data: {
        person: { userId: built.user.id, email: built.user.email, displayName: built.user.displayName },
        plan: built.plan,
        planKey: built.planKey,
      },
    });
  });

  // POST /admin/milesheet/teams/:orgId/move  (body as preview + planKey)
  app.post("/milesheet/teams/:orgId/move", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const parsed = moveSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, 400, parsed.error.issues[0].message);
    const built = await buildMove(orgId, parsed.data);
    if ("error" in built) return bad(reply, built.status!, built.error!);
    const { plan, user, target } = built;
    if (!parsed.data.planKey || parsed.data.planKey !== built.planKey) {
      return bad(reply, 409, "Something changed since the preview. Preview again before applying.");
    }
    if (plan.blockers.length > 0) return bad(reply, 400, plan.blockers[0]);

    const now = new Date();
    const email = user.email.toLowerCase();
    const targetMonths = built.targetApprovals.filter((a) => a.userId === user.id).map((a) => a.month);
    const before = await prisma.orgMembership.findMany({
      where: { OR: [{ userId: user.id }, { invitedEmail: email }] },
      select: { id: true, orgId: true, role: true, status: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const d of plan.deactivate) {
        await tx.orgMembership.update({ where: { id: d.membershipId }, data: { status: "disabled", disabledAt: now } });
      }
      for (const c of plan.cancelInvites) {
        await tx.orgMembership.update({
          where: { id: c.membershipId },
          data: { status: "disabled", disabledAt: now, inviteTokenHash: null, inviteExpiresAt: null },
        });
      }
      if (plan.target.action === "create") {
        await tx.orgMembership.create({
          data: { orgId: target.id, userId: user.id, role: plan.target.to.role, status: "active", invitedEmail: email, acceptedAt: now },
        });
      } else if (plan.target.action === "update" && plan.target.membershipId) {
        const existing = await tx.orgMembership.findUnique({ where: { id: plan.target.membershipId }, select: { acceptedAt: true } });
        await tx.orgMembership.update({
          where: { id: plan.target.membershipId },
          data: {
            userId: user.id,
            role: plan.target.to.role,
            status: "active",
            acceptedAt: existing?.acceptedAt ?? now,
            disabledAt: null,
            inviteTokenHash: null,
            inviteExpiresAt: null,
          },
        });
      }
      for (const e of plan.emptiedTeams) {
        if (!e.willDelete) continue;
        await tx.teamApproval.updateMany({
          where: { orgId: e.orgId, userId: user.id, month: { notIn: targetMonths } },
          data: { orgId: target.id },
        });
        await tx.organisation.delete({ where: { id: e.orgId } });
      }
    });

    const deleted = new Set(plan.emptiedTeams.filter((e) => e.willDelete).map((e) => e.orgId));
    void syncSeats(target.id);
    for (const d of plan.deactivate) if (!deleted.has(d.orgId)) void syncSeats(d.orgId);
    await invalidatePremiumCache(user.id).catch(() => {});

    const after = await prisma.orgMembership.findMany({
      where: { OR: [{ userId: user.id }, { invitedEmail: email }] },
      select: { id: true, orgId: true, role: true, status: true },
    });
    logEvent("admin.milesheet.move_person", request.userId!, {
      adminUserId: request.userId,
      orgId: target.id,
      personUserId: user.id,
      email,
      role: plan.target.to.role,
      fromOrgIds: plan.deactivate.map((d) => d.orgId),
      deletedOrgIds: [...deleted],
      plan,
      before,
      after,
    });
    return reply.send({ data: { ok: true, deletedOrgIds: [...deleted] } });
  });

  // ── Merge another team into this one ───────────────────────────────────

  const mergeSchema = z.object({ sourceOrgId: z.string().min(1).max(64), planKey: z.string().max(64).optional() });

  async function buildMerge(targetId: string, sourceId: string) {
    const [target, source] = await Promise.all([loadOrg(targetId), loadOrg(sourceId)]);
    if (!target) return { error: "Team not found", status: 404 } as const;
    if (!source) return { error: "The team to merge in was not found", status: 404 } as const;
    const approvalSelect = { id: true, orgId: true, userId: true, month: true, status: true, approvedAt: true } as const;
    const [tM, sM, tA, sA, sourceCustomer] = await Promise.all([
      prisma.orgMembership.findMany({ where: { orgId: targetId }, select: MEMBERSHIP_SELECT }),
      prisma.orgMembership.findMany({ where: { orgId: sourceId }, select: MEMBERSHIP_SELECT }),
      prisma.teamApproval.findMany({ where: { orgId: targetId }, select: approvalSelect }),
      prisma.teamApproval.findMany({ where: { orgId: sourceId }, select: approvalSelect }),
      prisma.organisation.findUnique({ where: { id: sourceId }, select: { stripeCustomerId: true } }),
    ]);
    const plan = planMerge({
      target,
      targetMemberships: tM.map(toMembershipRow),
      targetApprovals: tA as ApprovalRow[],
      source,
      sourceMemberships: sM.map(toMembershipRow),
      sourceApprovals: sA as ApprovalRow[],
    });
    if (sourceCustomer?.stripeCustomerId && !source.stripeSubscriptionId) {
      plan.warnings.push(`"${source.name}" has a Stripe customer (no subscription). It stays in Stripe, unlinked.`);
    }
    return { target, source, plan, planKey: planKeyOf(plan), sourceRaw: sM, targetRaw: tM } as const;
  }

  // POST /admin/milesheet/teams/:orgId/merge/preview { sourceOrgId }
  app.post("/milesheet/teams/:orgId/merge/preview", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const parsed = mergeSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, 400, parsed.error.issues[0].message);
    const built = await buildMerge(orgId, parsed.data.sourceOrgId);
    if ("error" in built) return bad(reply, built.status!, built.error!);
    return reply.send({
      data: {
        target: { id: built.target.id, name: built.target.name },
        source: { id: built.source.id, name: built.source.name },
        plan: built.plan,
        planKey: built.planKey,
      },
    });
  });

  // POST /admin/milesheet/teams/:orgId/merge { sourceOrgId, planKey }
  app.post("/milesheet/teams/:orgId/merge", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const parsed = mergeSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, 400, parsed.error.issues[0].message);
    const built = await buildMerge(orgId, parsed.data.sourceOrgId);
    if ("error" in built) return bad(reply, built.status!, built.error!);
    const { plan, source, target, sourceRaw, targetRaw } = built;
    if (!parsed.data.planKey || parsed.data.planKey !== built.planKey) {
      return bad(reply, 409, "Something changed since the preview. Preview again before applying.");
    }
    if (plan.blockers.length > 0) return bad(reply, 400, plan.blockers[0]);

    const srcById = new Map(sourceRaw.map((m) => [m.id, m]));
    const tgtById = new Map(targetRaw.map((m) => [m.id, m]));
    await prisma.$transaction(async (tx) => {
      for (const c of plan.conflicts) {
        const s = srcById.get(c.sourceMembershipId)!;
        const t = tgtById.get(c.targetMembershipId)!;
        // Delete the source row first: it may hold the invite token the
        // surviving row takes over (the token column is unique).
        await tx.orgMembership.delete({ where: { id: s.id } });
        if (c.keep === "source") {
          await tx.orgMembership.update({
            where: { id: t.id },
            data: {
              role: c.resultRole,
              status: s.status,
              userId: s.userId ?? t.userId,
              acceptedAt: s.acceptedAt ?? t.acceptedAt,
              disabledAt: s.disabledAt,
              inviteTokenHash: s.inviteTokenHash,
              inviteExpiresAt: s.inviteExpiresAt,
            },
          });
        } else if (c.resultRole !== t.role) {
          await tx.orgMembership.update({ where: { id: t.id }, data: { role: c.resultRole } });
        }
      }
      if (plan.move.length > 0) {
        await tx.orgMembership.updateMany({ where: { id: { in: plan.move.map((m) => m.membershipId) } }, data: { orgId: target.id } });
      }
      for (const r of plan.approvalsReplace) {
        await tx.teamApproval.delete({ where: { id: r.targetId } });
        await tx.teamApproval.update({ where: { id: r.sourceId }, data: { orgId: target.id } });
      }
      if (plan.approvalsMove.length > 0) {
        await tx.teamApproval.updateMany({ where: { id: { in: plan.approvalsMove } }, data: { orgId: target.id } });
      }
      await tx.organisation.delete({ where: { id: source.id } });
    });

    void syncSeats(target.id);
    const affected = [...sourceRaw, ...targetRaw].map((m) => m.userId).filter((x): x is string => !!x);
    await Promise.all([...new Set(affected)].map((uid) => invalidatePremiumCache(uid).catch(() => {})));
    const afterCount = await prisma.orgMembership.groupBy({ by: ["status"], where: { orgId: target.id }, _count: { _all: true } });
    logEvent("admin.milesheet.merge", request.userId!, {
      adminUserId: request.userId,
      orgId: target.id,
      sourceOrgId: source.id,
      sourceName: source.name,
      targetName: target.name,
      plan,
      before: {
        source: { memberships: sourceRaw.map((m) => ({ id: m.id, email: m.invitedEmail, role: m.role, status: m.status })) },
        target: { memberships: targetRaw.map((m) => ({ id: m.id, email: m.invitedEmail, role: m.role, status: m.status })) },
      },
      after: { target: Object.fromEntries(afterCount.map((g) => [g.status, g._count._all])) },
    });
    return reply.send({ data: { ok: true } });
  });

  // ── Member limit and free pilot ────────────────────────────────────────

  // POST /admin/milesheet/teams/:orgId/seat-cap { seatCap: number | null }
  app.post("/milesheet/teams/:orgId/seat-cap", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const parsed = z.object({ seatCap: z.number().int().min(1).max(5000).nullable() }).safeParse(request.body);
    if (!parsed.success) return bad(reply, 400, "seatCap must be a whole number from 1 to 5000, or null for no limit");
    const org = await loadOrg(orgId);
    if (!org) return bad(reply, 404, "Team not found");
    const occupied = await prisma.orgMembership.count({ where: { orgId, status: { not: "disabled" } } });
    if (parsed.data.seatCap !== null && parsed.data.seatCap < occupied) {
      return bad(reply, 400, `The team already has ${occupied} members or open invites. Set the limit to at least ${occupied}, or disable someone first.`);
    }
    await prisma.organisation.update({ where: { id: orgId }, data: { seatCap: parsed.data.seatCap } });
    logEvent("admin.milesheet.seat_cap", request.userId!, {
      adminUserId: request.userId,
      orgId,
      before: { seatCap: org.seatCap },
      after: { seatCap: parsed.data.seatCap },
    });
    return reply.send({ data: { ok: true } });
  });

  // POST /admin/milesheet/teams/:orgId/pilot { pilotFree: boolean }
  app.post("/milesheet/teams/:orgId/pilot", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const parsed = z.object({ pilotFree: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return bad(reply, 400, "pilotFree must be true or false");
    const org = await loadOrg(orgId);
    if (!org) return bad(reply, 404, "Team not found");
    if (org.pilotFree === parsed.data.pilotFree) return bad(reply, 400, "Nothing to change.");
    await prisma.organisation.update({ where: { id: orgId }, data: { pilotFree: parsed.data.pilotFree } });
    // Team Pro follows pilotFree, so every active member's cached answer is stale.
    const members = await prisma.orgMembership.findMany({ where: { orgId, status: "active", userId: { not: null } }, select: { userId: true } });
    await Promise.all(members.map((m) => invalidatePremiumCache(m.userId!).catch(() => {})));
    // Turning the pilot off on a subscribed team starts seat syncing again.
    void syncSeats(orgId);
    logEvent("admin.milesheet.pilot", request.userId!, {
      adminUserId: request.userId,
      orgId,
      hadSubscription: !!org.stripeSubscriptionId,
      before: { pilotFree: org.pilotFree },
      after: { pilotFree: parsed.data.pilotFree },
    });
    return reply.send({ data: { ok: true } });
  });

  // ── Waiting list (4 Oct 2026) ──────────────────────────────────────────
  // While MILESHEET_NEW_TEAMS is "waitlist", requests to start a team land in
  // team_interest (GET /admin/team-interest?view=waitlist). These two let the
  // admin add one by hand (a phone call, an email) and let one in.

  // POST /admin/milesheet/waitlist { company, email, contactName?, drivers?, notes? }
  app.post("/milesheet/waitlist", async (request, reply) => {
    const parsed = z
      .object({
        company: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(254),
        contactName: z.string().trim().max(120).optional().or(z.literal("")),
        drivers: z.enum(TEAM_DRIVER_BANDS).optional(),
        notes: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .safeParse(request.body);
    if (!parsed.success) return bad(reply, 400, parsed.error.issues[0].message);
    const d = parsed.data;
    const { id, duplicate } = await recordWaitlistRequest({
      source: "admin_form",
      email: d.email,
      company: d.company,
      contactName: d.contactName || null,
      drivers: d.drivers ?? null,
      notes: d.notes || null,
      page: "admin",
    });
    logEvent("admin.milesheet.waitlist_add", request.userId!, { adminUserId: request.userId, interestId: id, duplicate });
    return reply.send({ data: { id, duplicate } });
  });

  // POST /admin/milesheet/waitlist/:id/create-team
  //   { name?, adminEmail?, plan: "pilot" | "trial" | "paid" }
  // "Create team from this request": creates the organisation, invites the
  // manager with the normal email (links to WEB_BASE_URL/milesheet/invite),
  // and marks the request as let in. Works in either MILESHEET_NEW_TEAMS
  // mode: an admin letting someone in IS the override. A request that came
  // from a driver naming their manager brings that driver along: they join
  // the team the moment the manager accepts, exactly as a nomination does.
  app.post("/milesheet/waitlist/:id/create-team", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z
      .object({
        name: z.string().trim().min(2).max(160).optional(),
        adminEmail: z.string().trim().email().max(255).optional(),
        plan: z.enum(["pilot", "trial", "paid"]).default("pilot"),
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) return bad(reply, 400, parsed.error.issues[0].message);

    const row = await prisma.teamInterest.findUnique({ where: { id } });
    if (!row) return bad(reply, 404, "Request not found");
    if (row.admittedAt) {
      return reply.status(409).send({ error: "This request was already let in.", orgId: row.admittedOrgId });
    }
    const name = parsed.data.name ?? row.company ?? "";
    if (name.trim().length < 2) return bad(reply, 400, "Give the team a name: this request has no company name.");
    const adminEmail = (parsed.data.adminEmail ?? row.email).toLowerCase();
    const plan = parsed.data.plan;
    const pilotFree = plan === "pilot";
    const trialEndsAt = plan === "trial" ? new Date(Date.now() + TEAM_TRIAL_DAYS * DAY_MS) : null;

    // The nominating driver comes along only if they are not already in a
    // team and are not the manager themselves.
    let nominator: { id: string; email: string; displayName: string | null } | null = null;
    if (row.nominatedByUserId) {
      const u = await prisma.user.findUnique({
        where: { id: row.nominatedByUserId },
        select: { id: true, email: true, displayName: true },
      });
      const busy = u
        ? await prisma.orgMembership.findFirst({ where: { userId: u.id, status: "active" }, select: { id: true } })
        : null;
      if (u && !busy && u.email.toLowerCase() !== adminEmail) nominator = u;
    }

    const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
    const org = await prisma.$transaction(async (tx) => {
      const created = await tx.organisation.create({
        data: {
          name: name.trim(),
          pilotFree,
          trialEndsAt,
          seatCap: pilotFree || trialEndsAt ? TEAM_TRIAL_SEAT_CAP : null,
          createdByUserId: request.userId!,
          memberships: {
            create: {
              role: "admin",
              status: "invited",
              invitedEmail: adminEmail,
              inviteTokenHash: hashToken(token),
              inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
            },
          },
        },
        select: { id: true, name: true },
      });
      if (nominator) {
        await tx.orgMembership.create({
          data: {
            orgId: created.id,
            userId: nominator.id,
            role: "driver",
            status: "invited",
            invitedEmail: nominator.email.toLowerCase(),
          },
        });
      }
      await tx.teamInterest.update({
        where: { id: row.id },
        data: { admittedAt: new Date(), admittedOrgId: created.id },
      });
      return created;
    });

    let emailSent = true;
    try {
      if (nominator) {
        await sendManagerNominationEmail(adminEmail, nominator.displayName ?? "A MileClear user", org.name, token);
      } else {
        await sendTeamInviteEmail(adminEmail, org.name, token, "admin");
      }
    } catch (err) {
      emailSent = false;
      request.log.error({ err }, "waitlist create-team invite email failed (team created; resend from the team page)");
    }

    // team.org_created keeps the team journey and the invites alarm counting
    // this team like any other admin-started one.
    logEvent("team.org_created", request.userId!, { orgId: org.id, name: org.name, pilotFree, fromWaitlist: row.id });
    logEvent("admin.milesheet.create_from_waitlist", request.userId!, {
      adminUserId: request.userId,
      orgId: org.id,
      interestId: row.id,
      waitlistSource: row.waitlistSource,
      plan,
      broughtNominator: !!nominator,
      newTeamsMode: newTeamsMode(),
      emailSent,
    });
    return reply.status(201).send({
      data: { orgId: org.id, name: org.name, adminEmail, emailSent, broughtNominator: !!nominator },
    });
  });
}
