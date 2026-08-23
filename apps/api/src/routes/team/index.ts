import crypto from "node:crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";
import { logEvent } from "../../services/appEvents.js";
import { sendTeamInviteEmail } from "../../services/email.js";

// MileClear Teams Phase 1 (23 Aug 2026, TPS360 design-partner pilot).
//
// Shape: an Organisation owns memberships. An org admin invites drivers by
// email; accepting binds the logged-in user; disabling removes org
// visibility AND the team Pro entitlement (middleware/premium.ts) without
// touching the person's own account. Org creation is MileClear-admin-only
// for the pilot - self-serve is Phase 3. Invite tokens follow the
// accountant-share discipline: 128 hex chars of CSPRNG, sha256 at rest,
// seven-day expiry, the raw token exists only in the email.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function requireOrgAdmin(userId: string) {
  return prisma.orgMembership.findFirst({
    where: { userId, role: "admin", status: "active" },
    select: { orgId: true, id: true },
  });
}

export async function teamRoutes(app: FastifyInstance) {
  // ── MileClear admin: create an org + its first admin invite ────────────
  app.post(
    "/orgs",
    { preHandler: [authMiddleware, adminMiddleware] },
    async (request, reply) => {
      const parsed = z
        .object({
          name: z.string().trim().min(2).max(160),
          adminEmail: z.string().trim().email().max(255),
          pilotFree: z.boolean().optional().default(true),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const { name, adminEmail, pilotFree } = parsed.data;

      const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
      const org = await prisma.organisation.create({
        data: {
          name,
          pilotFree,
          createdByUserId: request.userId!,
          memberships: {
            create: {
              role: "admin",
              status: "invited",
              invitedEmail: adminEmail.toLowerCase(),
              inviteTokenHash: hashToken(token),
              inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
            },
          },
        },
        select: { id: true, name: true },
      });

      try {
        await sendTeamInviteEmail(adminEmail.toLowerCase(), name, token, "admin");
      } catch (err) {
        request.log.error({ err }, "team admin invite email failed (org created)");
      }
      logEvent("team.org_created", request.userId!, { orgId: org.id, name, pilotFree });
      return reply.status(201).send({ data: org });
    }
  );

  // ── Org admin: invite drivers ──────────────────────────────────────────
  app.post(
    "/invites",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const admin = await requireOrgAdmin(request.userId!);
      if (!admin) return reply.status(403).send({ error: "You are not a team admin." });

      const parsed = z
        .object({
          emails: z.array(z.string().trim().email().max(255)).min(1).max(50),
          role: z.enum(["driver", "admin"]).optional().default("driver"),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      const org = await prisma.organisation.findUnique({
        where: { id: admin.orgId },
        select: { name: true },
      });
      const results: Array<{ email: string; status: string }> = [];
      for (const raw of parsed.data.emails) {
        const email = raw.toLowerCase();
        const existing = await prisma.orgMembership.findUnique({
          where: { orgId_invitedEmail: { orgId: admin.orgId, invitedEmail: email } },
          select: { id: true, status: true },
        });
        if (existing && existing.status !== "disabled") {
          results.push({ email, status: `already ${existing.status}` });
          continue;
        }
        const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
        const data = {
          role: parsed.data.role,
          status: "invited",
          invitedEmail: email,
          inviteTokenHash: hashToken(token),
          inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
          userId: null,
          acceptedAt: null,
          disabledAt: null,
        };
        if (existing) {
          // Re-inviting someone who was disabled starts a fresh invite.
          await prisma.orgMembership.update({ where: { id: existing.id }, data });
        } else {
          await prisma.orgMembership.create({ data: { orgId: admin.orgId, ...data } });
        }
        try {
          await sendTeamInviteEmail(email, org?.name ?? "your team", token, parsed.data.role);
          results.push({ email, status: "invited" });
        } catch (err) {
          request.log.error({ err, email }, "team invite email failed (membership created)");
          results.push({ email, status: "invited (email failed - resend later)" });
        }
      }
      logEvent("team.invites_sent", request.userId!, {
        orgId: admin.orgId,
        count: results.filter((r) => r.status.startsWith("invited")).length,
      });
      return reply.send({ data: results });
    }
  );

  // ── Invitee: accept (logged in; web or app) ────────────────────────────
  app.post(
    "/invites/accept",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const parsed = z.object({ token: z.string().min(32).max(128) }).safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "token required" });

      const membership = await prisma.orgMembership.findUnique({
        where: { inviteTokenHash: hashToken(parsed.data.token) },
        select: { id: true, orgId: true, status: true, inviteExpiresAt: true, org: { select: { name: true } } },
      });
      if (!membership || membership.status !== "invited") {
        return reply.status(404).send({ error: "Invite not found or already used." });
      }
      if (membership.inviteExpiresAt && membership.inviteExpiresAt < new Date()) {
        return reply.status(410).send({ error: "This invite has expired - ask your admin to resend it." });
      }
      // One org per user for P1: joining while active elsewhere is refused
      // rather than silently moved.
      const elsewhere = await prisma.orgMembership.findFirst({
        where: { userId: request.userId!, status: "active" },
        select: { id: true },
      });
      if (elsewhere) {
        return reply.status(409).send({ error: "You are already in a team. Ask us to move you." });
      }

      await prisma.orgMembership.update({
        where: { id: membership.id },
        data: { userId: request.userId!, status: "active", acceptedAt: new Date(), inviteTokenHash: null },
      });
      logEvent("team.invite_accepted", request.userId!, { orgId: membership.orgId });
      return reply.send({ data: { orgId: membership.orgId, orgName: membership.org.name } });
    }
  );

  // ── Anyone: my team status (drives app badge + portal access) ──────────
  app.get("/me", { preHandler: [authMiddleware] }, async (request, reply) => {
    const m = await prisma.orgMembership.findFirst({
      where: { userId: request.userId!, status: "active" },
      select: { role: true, org: { select: { id: true, name: true } } },
    });
    return reply.send({ data: m ? { orgId: m.org.id, orgName: m.org.name, role: m.role } : null });
  });

  // ── Org admin: members list with month-to-date stats ───────────────────
  app.get("/members", { preHandler: [authMiddleware] }, async (request, reply) => {
    const admin = await requireOrgAdmin(request.userId!);
    if (!admin) return reply.status(403).send({ error: "You are not a team admin." });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const members = await prisma.orgMembership.findMany({
      where: { orgId: admin.orgId },
      orderBy: [{ status: "asc" }, { invitedAt: "asc" }],
      select: {
        id: true,
        role: true,
        status: true,
        invitedEmail: true,
        invitedAt: true,
        acceptedAt: true,
        userId: true,
        user: { select: { displayName: true, email: true, lastTripAt: true } },
      },
    });
    const activeUserIds = members.filter((m) => m.userId && m.status === "active").map((m) => m.userId!);
    const stats = activeUserIds.length
      ? await prisma.trip.groupBy({
          by: ["userId"],
          where: { userId: { in: activeUserIds }, startedAt: { gte: monthStart }, classification: "business" },
          _count: { _all: true },
          _sum: { distanceMiles: true },
        })
      : [];
    const statBy = new Map(stats.map((s) => [s.userId, s]));

    return reply.send({
      data: members.map((m) => ({
        id: m.id,
        role: m.role,
        status: m.status,
        email: m.user?.email ?? m.invitedEmail,
        displayName: m.user?.displayName ?? null,
        invitedAt: m.invitedAt.toISOString(),
        acceptedAt: m.acceptedAt?.toISOString() ?? null,
        lastTripAt: m.user?.lastTripAt?.toISOString() ?? null,
        monthBusinessTrips: m.userId ? (statBy.get(m.userId)?._count._all ?? 0) : 0,
        monthBusinessMiles:
          Math.round(((m.userId ? (statBy.get(m.userId)?._sum.distanceMiles ?? 0) : 0) as number) * 10) / 10,
      })),
    });
  });

  // ── Org admin: disable / re-enable a member ────────────────────────────
  app.patch("/members/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    const admin = await requireOrgAdmin(request.userId!);
    if (!admin) return reply.status(403).send({ error: "You are not a team admin." });
    const parsed = z.object({ status: z.enum(["active", "disabled"]) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "status must be active or disabled" });

    const { id } = request.params as { id: string };
    const m = await prisma.orgMembership.findFirst({
      where: { id, orgId: admin.orgId },
      select: { id: true, status: true, userId: true },
    });
    if (!m) return reply.status(404).send({ error: "Member not found" });
    if (m.id === admin.id) return reply.status(400).send({ error: "You cannot disable yourself." });
    if (m.status === "invited") return reply.status(400).send({ error: "Pending invites expire on their own; re-invite to refresh." });

    await prisma.orgMembership.update({
      where: { id: m.id },
      data:
        parsed.data.status === "disabled"
          ? { status: "disabled", disabledAt: new Date() }
          : { status: "active", disabledAt: null },
    });
    logEvent("team.member_status_changed", request.userId!, {
      orgId: admin.orgId,
      membershipId: m.id,
      memberUserId: m.userId,
      to: parsed.data.status,
    });
    return reply.send({ data: { ok: true } });
  });
}
