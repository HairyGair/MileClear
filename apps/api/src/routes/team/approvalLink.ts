import crypto from "node:crypto";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { TeamApprovalStatus } from "@mileclear/shared";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { sendTeamInviteEmail } from "../../services/email.js";
import { resolveApprovalLink, type ResolvedApprovalLink } from "../../services/teamApprovalLinks.js";
import { recordTeamApproval } from "../../services/teamApprovalWrite.js";
import { computeTeamMonthSummary, isMonthFinished, monthEndsLabel } from "../../services/teamExport.js";
import { priceResponseSchema, recordPriceResponse, shouldAskPrice } from "../../services/teamPriceQuestion.js";

// Milesheet (Oct 2026): the public side of the emailed approval link
// (services/teamApprovalLinks.ts). No auth: the token in the path is the
// credential, and it grants one org for one month only. Registered under
// /team; every path starts /approval-links so nothing here can collide
// with the signed-in team routes.
//
// What the page can do: read that month's figures (no driver emails),
// approve or query a driver, ask for a fresh account invite, answer the
// price question. It cannot see any other month or org, or change members
// or settings.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXPIRED = { error: "This link has expired.", code: "LINK_EXPIRED" } as const;

type Params = { token: string };

// Keyed on the token rather than the IP for the write routes, so one link
// cannot be hammered and an office sharing a connection is not throttled
// as one person.
function byToken(prefix: string) {
  return (request: FastifyRequest) => {
    const token = (request.params as Partial<Params> | undefined)?.token ?? "";
    return `${prefix}:${crypto.createHash("sha256").update(token).digest("hex")}`;
  };
}

function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function linkOr404(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ResolvedApprovalLink | null> {
  const { token } = request.params as Params;
  const resolved = await resolveApprovalLink(token);
  if (!resolved.ok) {
    // Unknown and expired look the same from outside.
    reply.status(404).send(EXPIRED);
    return null;
  }
  return resolved.link;
}

function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function teamApprovalLinkRoutes(app: FastifyInstance) {
  // ── Read: one org, one month ───────────────────────────────────────────
  app.get(
    "/approval-links/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const link = await linkOr404(request, reply);
      if (!link) return;

      // Same computation the portal shows and the approval snapshots, so the
      // email page and the portal never disagree.
      const summary = await computeTeamMonthSummary(
        link.orgId,
        link.month,
        link.includeNominatingDrivers ? { includeNominatingDrivers: true } : {}
      );
      const finished = isMonthFinished(link.month);

      return reply.send({
        data: {
          orgName: link.orgName,
          month: link.month,
          monthLabel: monthName(link.month),
          monthFinished: finished,
          approvableFrom: finished ? null : monthEndsLabel(link.month).reopens,
          hasAccount: link.recipientStatus === "active",
          askPrice: await shouldAskPrice(link.orgId),
          totalMiles: summary.totalMiles,
          totalAmountPence: summary.totalAmountPence,
          approvedCount: summary.approvedCount,
          pendingCount: summary.pendingCount,
          queriedCount: summary.queriedCount,
          // Deliberately NOT the portal's row: no email, no user id, no
          // approver name. The membership id is the handle the page sends
          // back, and it only resolves inside this link's org.
          drivers: summary.drivers.map((d) => ({
            id: d.membershipId,
            name: d.displayName?.trim() || "Unnamed driver",
            businessTrips: d.businessTrips,
            businessMiles: d.businessMiles,
            amountPence: d.amountPence,
            ratePence: d.ratePence,
            status: d.status as TeamApprovalStatus,
            note: d.note,
            approvedAt: d.approvedAt,
            driftMiles: d.driftMiles,
            unclassifiedTrips: d.unclassifiedTrips,
          })),
        },
      });
    }
  );

  // ── Write: approve or query one driver ─────────────────────────────────
  app.post(
    "/approval-links/:token/approvals",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute", keyGenerator: byToken("appr-link") } } },
    async (request, reply) => {
      const link = await linkOr404(request, reply);
      if (!link) return;

      const parsed = z
        .object({
          driverId: z.string().min(1).max(64),
          status: z.enum(["approved", "queried"]),
          note: z.string().trim().min(1).max(1000).optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
      const { driverId, status, note } = parsed.data;

      // The page sends a membership id; it only counts if it is a driver
      // membership in THIS link's org. The month always comes from the link,
      // never from the request.
      const membership = await prisma.orgMembership.findFirst({
        where: { id: driverId, orgId: link.orgId, role: "driver", userId: { not: null } },
        select: { userId: true },
      });
      if (!membership?.userId) return reply.status(404).send({ error: "Driver not found in this team." });

      const result = await recordTeamApproval({
        orgId: link.orgId,
        month: link.month,
        driverUserId: membership.userId,
        status,
        note,
        actor: { kind: "email_link", email: link.recipientEmail },
        includeNominatingDrivers: link.includeNominatingDrivers,
      });
      if (!result.ok) return reply.status(result.statusCode).send({ error: result.error });
      return reply.status(201).send({ data: { status: result.approval.status } });
    }
  );

  // ── A fresh account invite for a manager who has none yet ──────────────
  // Their original invite has usually expired (7 days) long before the
  // monthly email arrives, so "Create your free account" mints a new one
  // and emails it to the same address. Only the address the link was sent
  // to, and only while that manager is still invited.
  app.post(
    "/approval-links/:token/invite",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour", keyGenerator: byToken("appr-link-inv") } } },
    async (request, reply) => {
      const link = await linkOr404(request, reply);
      if (!link) return;
      if (link.recipientStatus === "active") {
        return reply.status(409).send({ error: "You already have an account. Sign in to open the portal." });
      }

      const membership = await prisma.orgMembership.findFirst({
        where: { orgId: link.orgId, role: "admin", status: "invited", invitedEmail: link.recipientEmail },
        select: { id: true },
      });
      if (!membership) return reply.status(404).send(EXPIRED);

      const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
      await prisma.orgMembership.update({
        where: { id: membership.id },
        data: { inviteTokenHash: hashInviteToken(token), inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS) },
      });
      try {
        await sendTeamInviteEmail(link.recipientEmail, link.orgName, token, "admin");
      } catch (err) {
        request.log.error({ err }, "approval link: fresh manager invite email failed");
        return reply.status(502).send({ error: "We could not send that email just now. Please try again shortly." });
      }
      logEvent("team.invite_refreshed", null, { orgId: link.orgId, via: "email_link" });
      return reply.send({ data: { sent: true } });
    }
  );

  // ── The price question, after approving ───────────────────────────────
  app.post(
    "/approval-links/:token/price-answer",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour", keyGenerator: byToken("appr-link-price") } } },
    async (request, reply) => {
      const link = await linkOr404(request, reply);
      if (!link) return;
      const parsed = priceResponseSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
      const outcome = await recordPriceResponse({
        orgId: link.orgId,
        userId: null,
        via: "email_link",
        ...parsed.data,
      });
      return reply.send({ data: { outcome } });
    }
  );
}
