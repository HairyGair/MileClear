import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  CERTIFICATE_MONTHLY_LIMIT,
  certificateVehicleLabel,
  checkCertificatePeriod,
  isCertificatePurpose,
  normaliseCertificateCode,
  toPublicCertificate,
  type MileageCertificateSnapshot,
  type MileageCertificateSummary,
} from "@mileclear/shared";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import {
  CertificateInputError,
  buildCertificateFigures,
  certificateVerifyUrl,
  generateCertificateCode,
  generateCertificatePdf,
  snapshotFromPreview,
} from "../../services/mileageCertificate.js";

/**
 * Mileage record certificates (Pro, 4 Oct 2026). See
 * services/mileageCertificate.ts for what goes on one.
 *
 *   POST /certificates/preview         auth (free too): the figures a certificate would carry now
 *   POST /certificates                 Pro: make one (20 a calendar month)
 *   GET  /certificates                 Pro: the driver's certificates
 *   POST /certificates/:id/revoke      Pro: withdraw one
 *   GET  /certificates/:id/pdf         Pro: the PDF, drawn from the frozen snapshot
 *   GET  /certificates/verify/:code    public, rate-limited: the snapshot as issued
 */

const bodySchema = z.object({
  periodStart: z.string().max(10),
  periodEnd: z.string().max(10),
  vehicleId: z.string().uuid().nullable().optional(),
  purpose: z.string().max(20).nullable().optional(),
});

const idParams = z.object({ id: z.string().uuid() });

function asSnapshot(v: Prisma.JsonValue): MileageCertificateSnapshot | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const s = v as unknown as MileageCertificateSnapshot;
  return s.version === 1 && typeof s.code === "string" ? s : null;
}

function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function certificateRoutes(app: FastifyInstance) {
  const pro = { preHandler: [authMiddleware, premiumMiddleware] };

  // ── Public verification ───────────────────────────────────────────────
  app.get<{ Params: { code: string } }>(
    "/verify/:code",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("X-Robots-Tag", "noindex, nofollow");
      const code = normaliseCertificateCode(request.params.code);
      if (!code) return reply.status(404).send({ error: "Certificate not found" });
      const row = await prisma.mileageCertificate.findUnique({
        where: { code },
        select: { snapshot: true, revokedAt: true },
      });
      const snapshot = row ? asSnapshot(row.snapshot) : null;
      if (!row || !snapshot) return reply.status(404).send({ error: "Certificate not found" });
      return reply.send({ data: toPublicCertificate(snapshot, row.revokedAt) });
    }
  );

  // ── Preview (free users see their figures before upgrading) ──────────
  app.post(
    "/preview",
    { preHandler: [authMiddleware], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "Choose a period." });
      const period = checkCertificatePeriod(parsed.data.periodStart, parsed.data.periodEnd);
      if (!period.ok) return reply.status(400).send({ error: period.error });
      try {
        const data = await buildCertificateFigures(request.userId!, period, parsed.data.vehicleId ?? null);
        return reply.send({ data });
      } catch (err) {
        if (err instanceof CertificateInputError) return reply.status(400).send({ error: err.message });
        throw err;
      }
    }
  );

  // ── Create ────────────────────────────────────────────────────────────
  app.post(
    "/",
    { ...pro, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const userId = request.userId!;
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "Choose a period." });
      const purpose = parsed.data.purpose ?? null;
      if (purpose !== null && !isCertificatePurpose(purpose)) {
        return reply.status(400).send({ error: "Choose who the certificate is for." });
      }
      const period = checkCertificatePeriod(parsed.data.periodStart, parsed.data.periodEnd);
      if (!period.ok) return reply.status(400).send({ error: period.error });

      const now = new Date();
      const thisMonth = await prisma.mileageCertificate.count({
        where: { userId, createdAt: { gte: startOfMonth(now) } },
      });
      if (thisMonth >= CERTIFICATE_MONTHLY_LIMIT) {
        return reply.status(429).send({
          error: `You can make ${CERTIFICATE_MONTHLY_LIMIT} certificates a month. You can make more from the 1st.`,
        });
      }

      let preview;
      try {
        preview = await buildCertificateFigures(userId, period, parsed.data.vehicleId ?? null);
      } catch (err) {
        if (err instanceof CertificateInputError) return reply.status(400).send({ error: err.message });
        throw err;
      }
      if (preview.trips === 0) {
        return reply.status(400).send({ error: "There are no trips in this period, so there is nothing to certify." });
      }

      // 100 random bits: a clash is next to impossible, but retry rather than 500.
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = generateCertificateCode();
        const snapshot = snapshotFromPreview(preview, code, purpose, now);
        try {
          const row = await prisma.mileageCertificate.create({
            data: {
              userId,
              code,
              periodStart: period.start,
              periodEnd: period.end,
              vehicleId: parsed.data.vehicleId ?? null,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
              createdAt: now,
            },
            select: { id: true },
          });
          logEvent("certificate.created", userId, {
            purpose,
            taxYear: snapshot.taxYear,
            trips: snapshot.trips,
            singleVehicle: snapshot.singleVehicle,
          });
          return reply.status(201).send({ data: toSummary(row.id, snapshot, now, null) });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
          throw err;
        }
      }
      return reply.status(500).send({ error: "Couldn't make the certificate. Please try again." });
    }
  );

  // ── List ──────────────────────────────────────────────────────────────
  app.get("/", pro, async (request, reply) => {
    const rows = await prisma.mileageCertificate.findMany({
      where: { userId: request.userId! },
      orderBy: { createdAt: "desc" },
      select: { id: true, snapshot: true, createdAt: true, revokedAt: true },
      take: 200,
    });
    const data: MileageCertificateSummary[] = [];
    for (const r of rows) {
      const s = asSnapshot(r.snapshot);
      if (s) data.push(toSummary(r.id, s, r.createdAt, r.revokedAt));
    }
    return reply.send({ data });
  });

  // ── Withdraw ──────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>("/:id/revoke", pro, async (request, reply) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return reply.status(404).send({ error: "Certificate not found" });
    const userId = request.userId!;
    const row = await prisma.mileageCertificate.findFirst({
      where: { id: parsed.data.id, userId },
      select: { id: true, snapshot: true, createdAt: true, revokedAt: true },
    });
    const snapshot = row ? asSnapshot(row.snapshot) : null;
    if (!row || !snapshot) return reply.status(404).send({ error: "Certificate not found" });
    let revokedAt = row.revokedAt;
    if (!revokedAt) {
      revokedAt = new Date();
      await prisma.mileageCertificate.update({ where: { id: row.id }, data: { revokedAt } });
      logEvent("certificate.revoked", userId, {});
    }
    return reply.send({ data: toSummary(row.id, snapshot, row.createdAt, revokedAt) });
  });

  // ── PDF ───────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/pdf",
    { ...pro, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = idParams.safeParse(request.params);
      if (!parsed.success) return reply.status(404).send({ error: "Certificate not found" });
      const row = await prisma.mileageCertificate.findFirst({
        where: { id: parsed.data.id, userId: request.userId! },
        select: { snapshot: true, revokedAt: true },
      });
      const snapshot = row ? asSnapshot(row.snapshot) : null;
      if (!row || !snapshot) return reply.status(404).send({ error: "Certificate not found" });
      if (row.revokedAt) {
        return reply.status(410).send({ error: "This certificate was withdrawn, so it can't be shared." });
      }
      const pdf = await generateCertificatePdf(snapshot);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="mileclear-mileage-record-${snapshot.code.slice(0, 8)}.pdf"`)
        .send(pdf);
    }
  );
}

function toSummary(
  id: string,
  s: MileageCertificateSnapshot,
  createdAt: Date,
  revokedAt: Date | null
): MileageCertificateSummary {
  return {
    id,
    code: s.code,
    verifyUrl: certificateVerifyUrl(s.code),
    createdAt: createdAt.toISOString(),
    revokedAt: revokedAt ? revokedAt.toISOString() : null,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    taxYear: s.taxYear,
    purpose: s.purpose,
    vehicleLabel: certificateVehicleLabel(s.vehicles, s.singleVehicle),
    totalMiles: s.totalMiles,
    trips: s.trips,
  };
}
