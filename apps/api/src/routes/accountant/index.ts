import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { sendAccountantInviteEmail } from "../../services/email.js";
import { fetchExportSummary, fetchExpenseSummary } from "../../services/export-data.js";
import { generateTripsCsv, generateTripsPdf } from "../../services/export.js";
import { getTaxYear, parseTaxYear } from "@mileclear/shared";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// How long granted access lasts before the accountant needs re-inviting.
// Until 14 Aug 2026 it lasted forever: a link handed over for one tax
// year still opened the user's whole account years later, after the
// engagement had ended. Twelve months covers a full tax year plus the
// 31 January filing deadline, which is the real unit of the relationship.
const ACCESS_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** How many of the tax year's business trips the accountant's page lists. */
const TRIPS_SHOWN = 50;

/**
 * Where an accountant link lands. The email links to the website page,
 * and that page calls POST /accountant/accept/:token itself. Same env var
 * as the email service, so the two cannot point at different hosts. (Until
 * Oct 2026 the verify route redirected to API_BASE_URL, the API host.)
 */
const WEB_BASE_URL = process.env.WEB_BASE_URL || "https://mileclear.com";

/**
 * Accountant links are bearer credentials that travel in a URL, so the
 * database stores only a hash. Same reasoning (and same primitive) as
 * refresh tokens in routes/auth. A dump of the table is then useless on
 * its own: an attacker gets hashes, not working links.
 *
 * sha256 with no salt is deliberate: the token is 128 hex characters of
 * CSPRNG output, so there is nothing to brute-force and lookups must be
 * exact-match on an indexed column.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Value written to the legacy plaintext `token` column on new rows. The
 * column is NOT NULL and unique until the migration that drops it, so it
 * needs something unique, but it must not be a usable credential: lookups
 * match on tokenHash. Until Oct 2026 new rows still wrote the real token
 * here, against the schema comment. The "retired:" prefix can never pass
 * tokenParamSchema (128 hex), so it cannot be presented as a link either.
 */
function legacyTokenPlaceholder(): string {
  return `retired:${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * Why a link does not open, as a stable code the accountant's page turns
 * into plain English. Status codes alone were not enough: revoked and
 * expired both came back as 403 and the page said "Something went wrong".
 */
export type AccountantLinkProblem = "not_found" | "revoked" | "expired" | "invite_expired";

type Problem = { ok: false; status: number; code: AccountantLinkProblem; error: string };

const PROBLEMS: Record<AccountantLinkProblem, Omit<Problem, "ok">> = {
  not_found: { status: 404, code: "not_found", error: "This link is not recognised." },
  revoked: { status: 403, code: "revoked", error: "Your client has removed your access." },
  expired: { status: 410, code: "expired", error: "Access through this link has ended." },
  invite_expired: {
    status: 410,
    code: "invite_expired",
    error: "This invite was not opened within 7 days, so it has run out.",
  },
};

function problem(code: AccountantLinkProblem): Problem {
  return { ok: false, ...PROBLEMS[code] };
}

function tokenWhere(token: string) {
  // `token` is still matched for rows issued before the hash column
  // existed; drop that half once the plaintext column is gone.
  return { OR: [{ tokenHash: hashToken(token) }, { token }] };
}

/**
 * Resolve a bearer token from an accountant URL to a live access record.
 *
 * Centralised because the dashboard and the export route each did their
 * own two-step check, and an expiry added to one and not the other is
 * exactly the kind of drift that produced the never-expiring link in the
 * first place.
 *
 * Returns a discriminated result rather than throwing so callers can map
 * "revoked" and "expired" to different messages for the accountant.
 */
async function resolveAccountantAccess(token: string) {
  const access = await prisma.accountantAccess.findFirst({
    where: tokenWhere(token),
    include: {
      user: { select: { id: true, displayName: true, fullName: true, email: true } },
    },
  });

  if (!access) {
    // No access row. Revoking deletes it, so the invite says why.
    const invite = await prisma.accountantInvite.findFirst({ where: tokenWhere(token) });
    if (!invite) return problem("not_found");
    if (invite.status === "revoked") return problem("revoked");
    // Accepted once, but the access row now carries a newer link (the
    // driver re-invited the same address after the 12 months ran out).
    if (invite.status === "accepted") return problem("expired");
    if (invite.status === "expired" || invite.expiresAt.getTime() <= Date.now()) {
      return problem("invite_expired");
    }
    // A pending invite nobody has accepted yet: acceptInvite handles it.
    return problem("not_found");
  }

  // Null expiresAt means a row predating the expiry column that the
  // backfill has not reached. Treat it as expired rather than eternal:
  // failing closed is the whole point of this change.
  if (!access.expiresAt || access.expiresAt.getTime() <= Date.now()) {
    return problem("expired");
  }

  // The originating invite must still be accepted. This is how a
  // revocation by the user takes effect on an already-issued link.
  const invite = await prisma.accountantInvite.findFirst({
    where: { ...tokenWhere(token), status: "accepted" },
  });
  if (!invite) return problem("revoked");

  return { ok: true as const, access };
}

/**
 * Turn an invite into access. Idempotent: opening the link again (or a
 * mail scanner opening it first) just confirms the access that exists.
 */
async function acceptInvite(
  token: string
): Promise<{ ok: true; expiresAt: Date } | Problem> {
  const existing = await resolveAccountantAccess(token);
  if (existing.ok) return { ok: true, expiresAt: existing.access.expiresAt! };
  // Only "not_found" can still be a pending invite waiting to be accepted.
  if (existing.code !== "not_found") return existing;

  const invite = await prisma.accountantInvite.findFirst({
    where: { ...tokenWhere(token), status: "pending", expiresAt: { gt: new Date() } },
  });
  if (!invite) return problem("not_found");

  const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  await prisma.$transaction([
    prisma.accountantAccess.upsert({
      where: { userId_accountantEmail: { userId: invite.userId, accountantEmail: invite.email } },
      create: {
        userId: invite.userId,
        accountantEmail: invite.email,
        token: legacyTokenPlaceholder(),
        tokenHash: hashToken(token),
        permissions: "read",
        expiresAt,
      },
      update: {
        token: legacyTokenPlaceholder(),
        tokenHash: hashToken(token),
        // Re-accepting a fresh invite renews the window rather than
        // extending the original one indefinitely.
        expiresAt,
      },
    }),
    prisma.accountantInvite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    }),
  ]);

  logEvent("accountant.invite_accepted", invite.userId, {
    inviteId: invite.id,
    accountantEmail: invite.email,
  });

  return { ok: true, expiresAt };
}

/** "2025-26" style, with the second half one year on from the first. */
function isValidTaxYear(taxYear: string): boolean {
  const m = taxYear.match(/^(\d{4})-(\d{2})$/);
  return !!m && m[2] === String(parseInt(m[1], 10) + 1).slice(2);
}

const inviteBodySchema = z.object({
  email: z.string().email("Must be a valid email address"),
});

// Every link ever issued is 128 hex characters (64 random bytes). Anything
// else is not one of ours, and refusing it here also means the "retired:"
// placeholder in the legacy column can never be presented as a link.
const tokenParamSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{128}$/i),
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
      // Access that has run out does not block a fresh invite: accepting
      // it renews the same access row for another 12 months.
      if (existingAccess && existingAccess.expiresAt && existingAccess.expiresAt.getTime() > Date.now()) {
        return reply.status(400).send({ error: "This accountant already has access to your data" });
      }

      const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      const invite = await prisma.accountantInvite.create({
        data: {
          userId,
          email: normalizedEmail,
          token: legacyTokenPlaceholder(),
          tokenHash: hashToken(token),
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
        expiresAt: acc.expiresAt,
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

  // POST /accountant/accept/:token - turn the emailed invite into access.
  // Called by the accountant's page on mileclear.com/accountant/{token}
  // before it loads anything. Safe to call on every visit.
  app.post(
    "/accept/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const paramsParsed = tokenParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        const p = problem("not_found");
        return reply.status(p.status).send({ error: p.error, code: p.code });
      }

      const result = await acceptInvite(paramsParsed.data.token);
      if (!result.ok) {
        return reply.status(result.status).send({ error: result.error, code: result.code });
      }
      return reply.send({ data: { accepted: true, expiresAt: result.expiresAt.toISOString() } });
    }
  );

  // GET /accountant/verify/:token - kept for any link that points at the
  // API. It used to accept the invite and redirect to the API host; now it
  // only sends the accountant to the website page, which does the accepting
  // and shows a clear message when the link no longer works.
  app.get(
    "/verify/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const paramsParsed = tokenParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: "Invalid token" });
      }
      return reply.redirect(`${WEB_BASE_URL}/accountant/${paramsParsed.data.token}`);
    }
  );

  // GET /accountant/dashboard/:token?taxYear=2025-26 - the accountant's page.
  // Business figures only: personal trips are never counted or listed, and
  // trips the driver has not sorted yet appear as a count, not as business.
  app.get(
    "/dashboard/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const paramsParsed = tokenParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        const p = problem("not_found");
        return reply.status(p.status).send({ error: p.error, code: p.code });
      }

      const { token } = paramsParsed.data;
      const requestedYear = (request.query as { taxYear?: string }).taxYear;
      if (requestedYear !== undefined && !isValidTaxYear(requestedYear)) {
        return reply.status(400).send({ error: "taxYear must look like 2025-26" });
      }

      const resolved = await resolveAccountantAccess(token);
      if (!resolved.ok) {
        return reply.status(resolved.status).send({ error: resolved.error, code: resolved.code });
      }
      const { access } = resolved;

      await prisma.accountantAccess.update({
        where: { id: access.id },
        data: { lastAccessedAt: new Date() },
      });

      const userId = access.userId;
      const currentTaxYear = getTaxYear(new Date());

      // Tax years with records, plus the current one, newest first.
      const mileageSummaries = await prisma.mileageSummary.findMany({
        where: { userId },
        select: { taxYear: true },
        orderBy: { taxYear: "desc" },
      });
      const availableTaxYears = [
        ...new Set([currentTaxYear, ...mileageSummaries.map((m) => m.taxYear)]),
      ]
        .filter(isValidTaxYear)
        .sort()
        .reverse();
      const taxYear = requestedYear ?? currentTaxYear;

      // Durable access record. lastAccessedAt is overwritten on each hit,
      // so on its own it cannot answer "how often has my accountant
      // looked, and did they look after I revoked them?". The user can
      // see these events; that is the point.
      logEvent("accountant.dashboard_viewed", access.userId, {
        accessId: access.id,
        accountantEmail: access.accountantEmail,
        taxYear,
      });

      const { start, end } = parseTaxYear(taxYear);
      const inYear = { userId, isPhantomTrip: false, startedAt: { gte: start, lte: end } };

      const [summary, expenseSummary, byClassification, trips] = await Promise.all([
        fetchExportSummary(userId, taxYear),
        fetchExpenseSummary(userId, taxYear),
        prisma.trip.groupBy({
          by: ["classification"],
          where: inYear,
          _count: { _all: true },
          _sum: { distanceMiles: true },
        }),
        // Business trips only. An accountant needs the deductible journeys,
        // not a list of where their client drove at the weekend.
        prisma.trip.findMany({
          where: { ...inYear, classification: "business" },
          orderBy: { startedAt: "desc" },
          take: TRIPS_SHOWN,
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            distanceMiles: true,
            platformTag: true,
            startAddress: true,
            endAddress: true,
          },
        }),
      ]);

      const group = (c: string) => byClassification.find((g) => g.classification === c);
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const business = group("business");
      const unsorted = group("unclassified");

      return reply.send({
        data: {
          client: {
            name: access.user.fullName || access.user.displayName || access.user.email,
            email: access.user.email,
          },
          taxYear,
          availableTaxYears,
          accessExpiresAt: access.expiresAt!.toISOString(),
          summary: {
            businessTrips: business?._count._all ?? 0,
            businessMiles: round2(business?._sum.distanceMiles ?? 0),
            unsortedTrips: unsorted?._count._all ?? 0,
            unsortedMiles: round2(unsorted?._sum.distanceMiles ?? 0),
            mileageDeductionPence: summary.totalDeductionPence,
            // Per vehicle, business miles only. The export summary's
            // totalMiles per vehicle includes personal driving.
            vehicles: summary.vehicleBreakdown
              .filter((v) => v.businessMiles > 0)
              .map((v) => ({
                name: v.vehicleName,
                vehicleType: v.vehicleType,
                businessMiles: v.businessMiles,
                deductionPence: v.deductionPence,
              })),
            earningsTotalPence: summary.totalEarningsPence,
            earningsByPlatform: summary.earningsByPlatform,
          },
          expenses: expenseSummary,
          trips,
          tripsShownLimit: TRIPS_SHOWN,
          generatedAt: new Date().toISOString(),
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
        const p = problem("not_found");
        return reply.status(p.status).send({ error: p.error, code: p.code });
      }

      const { token } = paramsParsed.data;
      const { format, taxYear } = request.query as { format?: string; taxYear?: string };

      if (!format || !["csv", "pdf"].includes(format)) {
        return reply.status(400).send({ error: "format must be 'csv' or 'pdf'" });
      }
      if (!taxYear || !isValidTaxYear(taxYear)) {
        return reply.status(400).send({ error: "taxYear must look like 2025-26" });
      }

      const resolved = await resolveAccountantAccess(token);
      if (!resolved.ok) {
        return reply.status(resolved.status).send({ error: resolved.error, code: resolved.code });
      }
      const { access } = resolved;

      await prisma.accountantAccess.update({
        where: { id: access.id },
        data: { lastAccessedAt: new Date() },
      });

      logEvent("accountant.export_downloaded", access.userId, {
        accessId: access.id,
        accountantEmail: access.accountantEmail,
        format,
        taxYear,
      });

      const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");

      if (format === "csv") {
        const csv = await generateTripsCsv(access.userId, { taxYear, classification: "business" });
        const filename = `mileclear-trips-${taxYear}-${dateTag}.csv`;
        return reply
          .header("Content-Type", "text/csv")
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(csv);
      }

      // PDF
      const pdf = await generateTripsPdf(access.userId, { taxYear, classification: "business" });
      const filename = `mileclear-trips-${taxYear}-${dateTag}.pdf`;
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdf);
    }
  );
}
