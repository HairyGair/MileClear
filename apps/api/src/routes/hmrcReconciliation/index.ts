import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  GIG_PLATFORMS,
  parseTaxYear,
  type ReconciliationRow,
  type ReconciliationSummary,
} from "@mileclear/shared";

const taxYearSchema = z.string().regex(/^\d{4}-\d{2}$/);

const PLATFORM_LABEL = new Map<string, string>(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

async function buildSummary(
  userId: string,
  taxYear: string
): Promise<ReconciliationSummary> {
  const { start, end } = parseTaxYear(taxYear);

  const [reconciliations, earningsByPlatform] = await Promise.all([
    prisma.hmrcReconciliation.findMany({
      where: { userId, taxYear },
    }),
    prisma.earning.groupBy({
      by: ["platform"],
      where: {
        userId,
        periodStart: { gte: start, lte: end },
      },
      _sum: { amountPence: true },
    }),
  ]);

  const trackedByPlatform = new Map<string, number>();
  for (const e of earningsByPlatform) {
    trackedByPlatform.set(e.platform, e._sum.amountPence ?? 0);
  }

  const reconByPlatform = new Map(reconciliations.map((r) => [r.platform, r]));

  // Build the canonical platform list: every platform the user has either
  // tracked earnings for OR entered an HMRC figure for.
  const platformsTouched = new Set<string>([
    ...trackedByPlatform.keys(),
    ...reconByPlatform.keys(),
  ]);

  const rows: ReconciliationRow[] = Array.from(platformsTouched).map((platform) => {
    const tracked = trackedByPlatform.get(platform) ?? 0;
    const recon = reconByPlatform.get(platform);
    const hmrcReported = recon?.hmrcReportedPence ?? null;
    return {
      platform,
      label: PLATFORM_LABEL.get(platform) ?? platform,
      hmrcReportedPence: hmrcReported,
      mileclearTrackedPence: tracked,
      diffPence: hmrcReported !== null ? hmrcReported - tracked : null,
      notes: recon?.notes ?? null,
      updatedAt: recon?.updatedAt.toISOString() ?? null,
    };
  });

  // Sort by tracked-earnings desc so the platforms with most data come first.
  rows.sort((a, b) => b.mileclearTrackedPence - a.mileclearTrackedPence);

  const totals = rows.reduce(
    (acc, r) => {
      acc.mileclearTrackedPence += r.mileclearTrackedPence;
      if (r.hmrcReportedPence !== null) {
        acc.hmrcReportedPence += r.hmrcReportedPence;
        acc.completedPlatforms += 1;
      }
      acc.totalPlatforms += 1;
      return acc;
    },
    {
      hmrcReportedPence: 0,
      mileclearTrackedPence: 0,
      diffPence: 0,
      completedPlatforms: 0,
      totalPlatforms: 0,
    }
  );
  totals.diffPence = totals.hmrcReportedPence - totals.mileclearTrackedPence;

  return { taxYear, rows, totals };
}

export async function hmrcReconciliationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /hmrc-reconciliation?taxYear=2025-26
  app.get(
    "/",
    async (
      request: FastifyRequest<{ Querystring: { taxYear?: string } }>,
      reply
    ) => {
      const taxYear = taxYearSchema.parse(request.query.taxYear);
      const summary = await buildSummary(request.userId!, taxYear);
      return reply.send({ data: summary });
    }
  );

  // POST /hmrc-reconciliation - upsert one platform's HMRC figure
  app.post("/", async (request, reply) => {
    const body = z
      .object({
        taxYear: taxYearSchema,
        platform: z.string().min(1).max(40),
        hmrcReportedPence: z.number().int().min(0).max(100_000_000), // £1m cap
        notes: z.string().max(500).optional(),
      })
      .parse(request.body);

    await prisma.hmrcReconciliation.upsert({
      where: {
        userId_taxYear_platform: {
          userId: request.userId!,
          taxYear: body.taxYear,
          platform: body.platform,
        },
      },
      update: {
        hmrcReportedPence: body.hmrcReportedPence,
        notes: body.notes ?? null,
      },
      create: {
        userId: request.userId!,
        taxYear: body.taxYear,
        platform: body.platform,
        hmrcReportedPence: body.hmrcReportedPence,
        notes: body.notes ?? null,
      },
    });

    const summary = await buildSummary(request.userId!, body.taxYear);
    return reply.send({ data: summary });
  });

  // DELETE /hmrc-reconciliation/:platform?taxYear=...
  app.delete(
    "/:platform",
    async (
      request: FastifyRequest<{
        Params: { platform: string };
        Querystring: { taxYear?: string };
      }>,
      reply
    ) => {
      const taxYear = taxYearSchema.parse(request.query.taxYear);
      const platform = z.string().min(1).max(40).parse(request.params.platform);

      await prisma.hmrcReconciliation
        .delete({
          where: {
            userId_taxYear_platform: {
              userId: request.userId!,
              taxYear,
              platform,
            },
          },
        })
        .catch(() => {
          // Already gone - idempotent
        });

      const summary = await buildSummary(request.userId!, taxYear);
      return reply.send({ data: summary });
    }
  );
}
