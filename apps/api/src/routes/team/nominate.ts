import crypto from "node:crypto";
import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { logEvent } from "../../services/appEvents.js";
import { sendManagerNominationEmail } from "../../services/email.js";

// Milesheet Phase 1.5 (25 Aug 2026) - the reverse of POST /orgs. A market
// study found almost no employer-side search volume (140 UK searches/mo
// across every employer-intent keyword) against driver-side (~1,490/mo), so
// the only realistic route into a company is a driver who already uses the
// app naming their manager. This plugin sits alongside routes/team/index.ts
// (admin-initiated invites) and routes/team/selfServe.ts under the same
// /team prefix; the path here (nominate-manager) doesn't collide with
// either.
//
// Same invite token discipline as index.ts: 128 hex chars CSPRNG, sha256 at
// rest, 7-day expiry, raw token only ever in the email.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const nominateSchema = z.object({
  managerEmail: z.string().trim().email().max(255),
  companyName: z.string().trim().min(2).max(160),
});

export async function nominateManagerRoutes(app: FastifyInstance) {
  // ── Driver: nominate their manager, who becomes the org's admin ────────
  app.post(
    "/nominate-manager",
    {
      preHandler: [authMiddleware],
      // This is the one endpoint where a logged-in user can make us email an
      // arbitrary address carrying someone else's name, so it stays tight.
      //
      // Keyed on the caller's token rather than their IP. Phones share
      // carrier-grade NAT at enormous scale, and colleagues at one company
      // share an office connection - and two drivers at the same firm both
      // naming their manager is exactly the behaviour this feature is FOR.
      // An IP-keyed cap would throttle the acquisition route it is meant to
      // protect. The rate limit hook runs before authMiddleware, so the
      // Authorization header is used directly rather than request.userId.
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 day",
          keyGenerator: (request: FastifyRequest) => {
            const auth = request.headers.authorization;
            return auth
              ? `nom:${crypto.createHash("sha256").update(auth).digest("hex")}`
              : `nom-ip:${request.ip}`;
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = nominateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const { companyName } = parsed.data;
      const managerEmail = parsed.data.managerEmail.toLowerCase();
      const userId = request.userId!;

      const caller = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });
      if (!caller) return reply.status(404).send({ error: "Account not found." });

      // Nominating yourself would create a company with no real second
      // party in it - and a driver who controls the manager address too
      // could flip themselves active for free the moment they "accept".
      if (managerEmail === caller.email.toLowerCase()) {
        return reply
          .status(400)
          .send({ error: "You cannot nominate your own email address as your manager." });
      }

      // Same one-org-per-user rule /team/me, /invites/accept and
      // /self-serve all assume.
      const activeElsewhere = await prisma.orgMembership.findFirst({
        where: { userId, status: "active" },
        select: { id: true },
      });
      if (activeElsewhere) {
        return reply.status(409).send({ error: "You are already set up with a company." });
      }

      // One outstanding nomination per driver - this is also the second
      // abuse limiter alongside the rate limit above. "Pending" means an
      // org this driver's own nomination created, still waiting on the
      // manager's accept.
      const pending = await prisma.orgMembership.findFirst({
        where: { userId, status: "invited", org: { createdByUserId: userId } },
        select: { id: true },
      });
      if (pending) {
        return reply.status(409).send({
          error: "You already have a nomination waiting on a reply. Wait for it or let it expire before sending another.",
        });
      }

      const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
      const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

      const org = await prisma.$transaction(async (tx) => {
        const created = await tx.organisation.create({
          data: {
            name: companyName,
            // MUST be false. pilotFree defaults to true in the schema and
            // grants every member Pro for nothing (premium.ts) - leaving
            // this unset would let a driver mint themselves free Pro by
            // nominating an inbox they control.
            pilotFree: false,
            createdByUserId: userId,
          },
          select: { id: true, name: true },
        });
        await tx.orgMembership.create({
          data: {
            orgId: created.id,
            role: "admin",
            status: "invited",
            invitedEmail: managerEmail,
            inviteTokenHash: hashToken(token),
            inviteExpiresAt,
          },
        });
        await tx.orgMembership.create({
          data: {
            orgId: created.id,
            userId,
            role: "driver",
            // Stays "invited", not "active": /team/me only surfaces active
            // memberships, and flipping this driver active now would put
            // them in "company mode" and tell the portal they're set up
            // before the manager has agreed to any of it. /invites/accept
            // activates this row once the manager accepts.
            status: "invited",
            invitedEmail: caller.email.toLowerCase(),
            inviteTokenHash: null,
            inviteExpiresAt: null,
          },
        });
        return created;
      });

      try {
        await sendManagerNominationEmail(
          managerEmail,
          caller.displayName ?? "A MileClear user",
          companyName,
          token
        );
      } catch (err) {
        // The nomination is worthless without the email, and leaving it behind
        // is worse than useless: the one-outstanding-nomination rule would
        // then refuse every retry, so the driver could never ask again and the
        // manager would never hear from us. Undo it and let them try. The
        // memberships go with the org via onDelete: Cascade.
        request.log.error({ err }, "manager nomination email failed, rolling the nomination back");
        try {
          await prisma.organisation.delete({ where: { id: org.id } });
        } catch (cleanupErr) {
          request.log.error({ err: cleanupErr }, "failed to roll back nomination org");
        }
        return reply
          .status(502)
          .send({ error: "We could not send that invitation just now. Please try again shortly." });
      }

      logEvent("team.manager_nominated", userId, { orgId: org.id, companyName });
      return reply.send({ data: { ok: true } });
    }
  );
}
