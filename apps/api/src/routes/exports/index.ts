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

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", premiumMiddleware);

  // CSV download
  app.get("/csv", async (request: FastifyRequest<{ Querystring: DateRangeQuery }>, reply) => {
    const opts = parseQueryOpts(request.query);
    const csv = await generateTripsCsv(request.userId!, opts);
    const filename = buildFilename("trips", opts.taxYear || "custom", "csv");

    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csv);
  });

  // PDF trip report download
  app.get("/pdf", async (request: FastifyRequest<{ Querystring: DateRangeQuery }>, reply) => {
    const opts = parseQueryOpts(request.query);
    const pdf = await generateTripsPdf(request.userId!, opts);
    const filename = buildFilename("trips", opts.taxYear || "custom", "pdf");

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

      const pdf = await generateSelfAssessmentPdf(request.userId!, taxYear);
      const filename = buildFilename("self-assessment", taxYear, "pdf");

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
