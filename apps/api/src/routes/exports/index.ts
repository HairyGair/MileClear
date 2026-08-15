import { FastifyInstance, FastifyRequest } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import {
  generateTripsCsv,
  generateTripsPdf,
  generateSelfAssessmentPdf,
  formatXeroExpense,
  formatFreeAgentExpense,
  formatQuickBooksExpense,
} from "../../services/export.js";
import { logEvent } from "../../services/appEvents.js";
import { prisma } from "../../lib/prisma.js";
import { parseTaxYear } from "@mileclear/shared";

interface DateRangeQuery {
  taxYear?: string;
  from?: string;
  to?: string;
  classification?: "business" | "personal";
}

interface AccountingBody {
  taxYear: string;
}

function buildFilename(type: string, taxYear: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `mileclear-${type}-${taxYear}-${date}.${ext}`;
}

function parseQueryOpts(query: DateRangeQuery) {
  const { taxYear, from, to, classification } = query;

  if (taxYear && (from || to)) {
    throw new Error("Provide taxYear or from+to, not both");
  }
  if (!taxYear && (!from || !to)) {
    throw new Error("Provide taxYear or both from and to");
  }

  return {
    taxYear: taxYear || undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    classification: classification || undefined,
  };
}

/**
 * Refuse to hand someone a blank document.
 *
 * Exports are the headline Pro feature and the first thing a new subscriber
 * reaches for. Jakub Zychla (15 Aug 2026) subscribed, ran the PDF, the
 * self-assessment and the CSV within 27 minutes, and had deleted his only trip
 * beforehand - so all three came back empty and he filed for a refund inside
 * two hours. An empty file reads as a broken product, not as "no data yet".
 *
 * Deliberately conservative: it blocks only when the document would genuinely
 * have nothing in it. Letting a thin export through is a far smaller mistake
 * than blocking a legitimate one, so the self-assessment report - which also
 * carries earnings - is allowed whenever EITHER trips or earnings exist.
 */
async function countExportableData(
  userId: string,
  opts: { taxYear?: string; from?: Date; to?: Date; classification?: string },
  includeEarnings: boolean
): Promise<{ trips: number; earnings: number }> {
  let start: Date;
  let end: Date;
  if (opts.taxYear) {
    const range = parseTaxYear(opts.taxYear);
    start = range.start;
    end = range.end;
  } else {
    start = opts.from!;
    end = opts.to!;
  }

  // Mirrors fetchExportTrips' filter exactly, phantoms included, or the count
  // and the document could disagree.
  const [trips, earnings] = await Promise.all([
    prisma.trip.count({
      where: {
        userId,
        isPhantomTrip: false,
        startedAt: { gte: start, lte: end },
        ...(opts.classification ? { classification: opts.classification } : {}),
      },
    }),
    includeEarnings
      ? prisma.earning.count({
          where: { userId, periodStart: { gte: start, lte: end } },
        })
      : Promise.resolve(0),
  ]);
  return { trips, earnings };
}

/** Wording that still makes sense under the mobile client's "Export failed" title. */
function emptyExportMessage(taxYear: string | undefined, what: string): string {
  const period = taxYear ? `the ${taxYear} tax year` : "that date range";
  return `There are no ${what} in ${period} yet, so this export would come out empty. Add or record one first and it will have something to show.`;
}

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", premiumMiddleware);

  // CSV download
  app.get("/csv", async (request: FastifyRequest<{ Querystring: DateRangeQuery }>, reply) => {
    const opts = parseQueryOpts(request.query);

    const { trips } = await countExportableData(request.userId!, opts, false);
    if (trips === 0) {
      logEvent("export.blocked_empty", request.userId!, { format: "csv", taxYear: opts.taxYear });
      return reply.status(400).send({ error: emptyExportMessage(opts.taxYear, "trips") });
    }

    const csv = await generateTripsCsv(request.userId!, opts);
    const filename = buildFilename("trips", opts.taxYear || "custom", "csv");

    logEvent("export.csv", request.userId!, { taxYear: opts.taxYear });

    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csv);
  });

  // PDF trip report download
  app.get("/pdf", async (request: FastifyRequest<{ Querystring: DateRangeQuery }>, reply) => {
    const opts = parseQueryOpts(request.query);

    const { trips } = await countExportableData(request.userId!, opts, false);
    if (trips === 0) {
      logEvent("export.blocked_empty", request.userId!, { format: "pdf", taxYear: opts.taxYear });
      return reply.status(400).send({ error: emptyExportMessage(opts.taxYear, "trips") });
    }

    const pdf = await generateTripsPdf(request.userId!, opts);
    const filename = buildFilename("trips", opts.taxYear || "custom", "pdf");

    logEvent("export.pdf", request.userId!, { taxYear: opts.taxYear });

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pdf);
  });

  // Self-assessment PDF download
  app.get(
    "/self-assessment",
    async (request: FastifyRequest<{ Querystring: { taxYear: string } }>, reply) => {
      const { taxYear } = request.query;
      if (!taxYear) {
        return reply.status(400).send({ error: "taxYear is required" });
      }

      const { trips, earnings } = await countExportableData(
        request.userId!,
        { taxYear },
        true
      );
      if (trips === 0 && earnings === 0) {
        logEvent("export.blocked_empty", request.userId!, {
          format: "self_assessment",
          taxYear,
        });
        return reply
          .status(400)
          .send({ error: emptyExportMessage(taxYear, "trips or earnings") });
      }

      const pdf = await generateSelfAssessmentPdf(request.userId!, taxYear);
      const filename = buildFilename("self-assessment", taxYear, "pdf");

      logEvent("export.self_assessment", request.userId!, { taxYear });

      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdf);
    }
  );

  // Xero — coming soon
  app.post("/xero", async (request: FastifyRequest<{ Body: AccountingBody }>, reply) => {
    const { taxYear } = request.body;
    if (!taxYear) {
      return reply.status(400).send({ error: "taxYear is required" });
    }

    const preview = await formatXeroExpense(request.userId!, taxYear);
    return reply.send({
      status: "coming_soon",
      message: "Xero integration is coming soon. Here's a preview of what will be exported.",
      preview,
    });
  });

  // FreeAgent — coming soon
  app.post("/freeagent", async (request: FastifyRequest<{ Body: AccountingBody }>, reply) => {
    const { taxYear } = request.body;
    if (!taxYear) {
      return reply.status(400).send({ error: "taxYear is required" });
    }

    const preview = await formatFreeAgentExpense(request.userId!, taxYear);
    return reply.send({
      status: "coming_soon",
      message: "FreeAgent integration is coming soon. Here's a preview of what will be exported.",
      preview,
    });
  });

  // QuickBooks — coming soon
  app.post("/quickbooks", async (request: FastifyRequest<{ Body: AccountingBody }>, reply) => {
    const { taxYear } = request.body;
    if (!taxYear) {
      return reply.status(400).send({ error: "taxYear is required" });
    }

    const preview = await formatQuickBooksExpense(request.userId!, taxYear);
    return reply.send({
      status: "coming_soon",
      message: "QuickBooks integration is coming soon. Here's a preview of what will be exported.",
      preview,
    });
  });
}
