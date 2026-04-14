import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { sendAccountantInviteEmail } from "../../services/email.js";
import { fetchExportSummary, fetchExpenseSummary } from "../../services/export-data.js";
import { generateTripsCsv, generateTripsPdf } from "../../services/export.js";
import { getTaxYear } from "@mileclear/shared";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const inviteBodySchema = z.object({
  email: z.string().email("Must be a valid email address"),
});

const tokenParamSchema = z.object({
  token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function accountantRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // User-side routes — require auth + premium
  // -------------------------------------------------------------------------

  // POST /accountant/invite
  app.post(
    "/invite",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = inviteBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      const userId = request.userId!;
      const { email } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();

      // Check for existing active invite or granted access for this email
      const [existingInvite, existingAccess] = await Promise.all([
        prisma.accountantInvite.findFirst({
          where: {
            userId,
            email: normalizedEmail,
            status: "pending",
            expiresAt: { gt: new Date() },
          },
        }),
        prisma.accountantAccess.findFirst({
          where: { userId, accountantEmail: normalizedEmail },
        }),
      ]);

      if (existingInvite) {
        return reply.status(400).send({ error: "An active invite already exists for this email" });
      }
      if (existingAccess) {
        return reply.status(400).send({ error: "This accountant already has access to your data" });
      }

      const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      const invite = await prisma.accountantInvite.create({
        data: {
          userId,
          email: normalizedEmail,
          token,
          status: "pending",
          expiresAt,
        },
      });

      // Fetch inviter display name for the email
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, fullName: true, email: true },
      });
      const inviterName = user?.displayName || user?.fullName || user?.email || "A MileClear user";

      try {
        await sendAccountantInviteEmail(normalizedEmail, inviterName, token);
      } catch (err) {
        // Log but don't fail the request - invite record was created
        request.log.error({ err }, "Failed to send accountant invite email");
      }

      return reply.status(201).send({ success: true, inviteId: invite.id });
    }
  );

  // GET /accountant/access
  app.get(
    "/access",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.userId!;

      const [invites, accesses] = await Promise.all([
        prisma.accountantInvite.findMany({
          where: { userId, status: { in: ["pending", "revoked", "expired"] } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.accountantAccess.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      // Shape invites that are still pending or have been revoked/expired
      const inviteItems = invites.map((inv) => ({
        id: inv.id,
        email: inv.email,
        status: inv.status,
        permissions: "read",
        lastAccessedAt: null,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
        source: "invite" as const,
      }));

      // Shape active access records
      const accessItems = accesses.map((acc) => ({
        id: acc.id,
        email: acc.accountantEmail,
        status: "accepted" as const,
        permissions: acc.permissions,
        lastAccessedAt: acc.lastAccessedAt,
        createdAt: acc.createdAt,
        expiresAt: null,
        source: "access" as const,
      }));

      return reply.send({ data: [...accessItems, ...inviteItems] });
    }
  );

  // DELETE /accountant/access/:id
  app.delete(
    "/access/:id",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const paramsParsed = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: "Invalid id" });
      }

      const userId = request.userId!;
      const { id } = paramsParsed.data;

      // Try AccountantAccess first
      const access = await prisma.accountantAccess.findFirst({
        where: { id, userId },
      });

      if (access) {
        await prisma.accountantAccess.delete({ where: { id } });
        // Also revoke the originating invite so the token can't be re-used
        await prisma.accountantInvite.updateMany({
          where: { userId, email: access.accountantEmail, status: "accepted" },
          data: { status: "revoked" },
        });
        return reply.send({ success: true });
      }

      // Fall back to revoking a pending invite
      const invite = await prisma.accountantInvite.findFirst({
        where: { id, userId, status: "pending" },
      });

      if (!invite) {
        return reply.status(404).send({ error: "Access record not found" });
      }

      await prisma.accountantInvite.update({
        where: { id },
        data: { status: "revoked" },
      });

      return reply.send({ success: true });
    }
  );

  // -------------------------------------------------------------------------
  // Token-based public routes - no auth middleware
  // -------------------------------------------------------------------------

  // GET /accountant/verify/:token - accept invite and create access
  app.get(
    "/verify/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const paramsParsed = tokenParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: "Invalid token" });
      }

      const { token } = paramsParsed.data;

      const invite = await prisma.accountantInvite.findFirst({
        where: {
          token,
          status: "pending",
          expiresAt: { gt: new Date() },
        },
      });

      if (!invite) {
        return reply.status(404).send({ error: "Invite not found, already used, or expired" });
      }

      // Create (or find) the access record - upsert handles re-verification edge case
      await prisma.$transaction([
        prisma.accountantAccess.upsert({
          where: { userId_accountantEmail: { userId: invite.userId, accountantEmail: invite.email } },
          create: {
            userId: invite.userId,
            accountantEmail: invite.email,
            token,
            permissions: "read",
          },
          update: {
            token,
            lastAccessedAt: new Date(),
          },
        }),
        prisma.accountantInvite.update({
          where: { id: invite.id },
          data: { status: "accepted" },
        }),
      ]);

      // Redirect to the web dashboard
      const webBase = process.env.API_BASE_URL || "https://mileclear.com";
      return reply.redirect(`${webBase}/accountant/${token}`);
    }
  );

  // GET /accountant/dashboard/:token - return dashboard data
  app.get(
    "/dashboard/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const paramsParsed = tokenParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: "Invalid token" });
      }

      const { token } = paramsParsed.data;

      const access = await prisma.accountantAccess.findUnique({
        where: { token },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              fullName: true,
              email: true,
            },
          },
        },
      });

      if (!access) {
        return reply.status(404).send({ error: "Access not found or revoked" });
      }

      // Verify the originating invite hasn't been revoked since access was granted
      const invite = await prisma.accountantInvite.findFirst({
        where: { token, status: "accepted" },
      });

      if (!invite) {
        return reply.status(403).send({ error: "Access has been revoked" });
      }

      // Update lastAccessedAt
      await prisma.accountantAccess.update({
        where: { token },
        data: { lastAccessedAt: new Date() },
      });

      const userId = access.userId;
      const currentTaxYear = getTaxYear(new Date());

      // Fetch available tax years from mileage summaries
      const mileageSummaries = await prisma.mileageSummary.findMany({
        where: { userId },
        select: { taxYear: true },
        orderBy: { taxYear: "desc" },
      });
      const availableTaxYears = mileageSummaries.map((m) => m.taxYear);
      const taxYear = availableTaxYears[0] ?? currentTaxYear;

      // Fetch all dashboard data in parallel
      const [summary, expenseSummary, recentTrips] = await Promise.all([
        fetchExportSummary(userId, taxYear),
        fetchExpenseSummary(userId, taxYear),
        prisma.trip.findMany({
          where: { userId },
          orderBy: { startedAt: "desc" },
          take: 20,
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            distanceMiles: true,
            classification: true,
            platformTag: true,
            startAddress: true,
            endAddress: true,
          },
        }),
      ]);

      return reply.send({
        data: {
          user: {
            name: access.user.fullName || access.user.displayName || access.user.email,
            email: access.user.email,
          },
          taxYear,
          availableTaxYears,
          summary,
          expenseSummary,
          recentTrips,
          accessedAt: new Date().toISOString(),
        },
      });
    }
  );

  // GET /accountant/export/:token - download CSV or PDF
  app.get(
    "/export/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const paramsParsed = tokenParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: "Invalid token" });
      }

      const { token } = paramsParsed.data;
      const { format, taxYear } = request.query as { format?: string; taxYear?: string };

      if (!format || !["csv", "pdf"].includes(format)) {
        return reply.status(400).send({ error: "format must be 'csv' or 'pdf'" });
      }
      if (!taxYear) {
        return reply.status(400).send({ error: "taxYear is required" });
      }

      const access = await prisma.accountantAccess.findUnique({
        where: { token },
      });

      if (!access) {
        return reply.status(404).send({ error: "Access not found or revoked" });
      }

      // Verify the originating invite hasn't been revoked
      const invite = await prisma.accountantInvite.findFirst({
        where: { token, status: "accepted" },
      });

      if (!invite) {
        return reply.status(403).send({ error: "Access has been revoked" });
      }

      await prisma.accountantAccess.update({
        where: { token },
        data: { lastAccessedAt: new Date() },
      });

      const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");

      if (format === "csv") {
        const csv = await generateTripsCsv(access.userId, { taxYear });
        const filename = `mileclear-trips-${taxYear}-${dateTag}.csv`;
        return reply
          .header("Content-Type", "text/csv")
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(csv);
      }

      // PDF
      const pdf = await generateTripsPdf(access.userId, { taxYear });
      const filename = `mileclear-trips-${taxYear}-${dateTag}.pdf`;
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdf);
    }
  );
}
