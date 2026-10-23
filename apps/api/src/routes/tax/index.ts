import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { loadTaxOverview } from "../../services/taxOverview.js";
import { loadRegimeSummary } from "../../services/regimeSummary.js";
import { effectiveCountry } from "../../lib/countrySetting.js";
import { prisma } from "../../lib/prisma.js";
import { regimeFor } from "@mileclear/shared";

/**
 * GET /tax/overview: the Tax tab and the Home tax line, one request. Free,
 * auth only. All figures come from existing services (services/taxOverview.ts).
 *
 * Query: `fresh=1` skips the 30 second cache (pull to refresh). `asOf=YYYY-MM-DD`
 * is honoured for admins only, to check the February to April lead.
 */
export async function taxRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/overview", async (request, reply) => {
    const q = request.query as { asOf?: string; fresh?: string };
    let now: Date | undefined;
    if (q.asOf && request.isAdmin) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.asOf)) {
        return reply.status(400).send({ error: "asOf must be YYYY-MM-DD" });
      }
      const d = new Date(`${q.asOf}T12:00:00Z`);
      if (Number.isNaN(d.getTime())) return reply.status(400).send({ error: "asOf must be a real date" });
      now = d;
    }
    const data = await loadTaxOverview(request.userId!, { now, fresh: q.fresh === "1" });
    if (!data) return reply.status(404).send({ error: "User not found" });
    return reply.send({ data });
  });

  // GET /tax/regime-summary?taxYear=2025-26: the mileage claim under the
  // driver's country's rules, for countries other than the UK (New Zealand
  // first, 23 Oct 2026). The UK keeps /tax/overview; for a UK driver, or a
  // country with no rules yet, data is null. The country is the effective one
  // (GB unless the Country setting is on for this driver).
  app.get("/regime-summary", async (request, reply) => {
    const q = request.query as { taxYear?: string };
    const user = await prisma.user.findUnique({
      where: { id: request.userId! },
      select: { isAdmin: true, country: true },
    });
    if (!user) return reply.status(404).send({ error: "User not found" });
    const regime = regimeFor(effectiveCountry(user));
    if (!regime || regime.id === "uk-hmrc") return reply.send({ data: null });
    const taxYear = q.taxYear ?? regime.taxYearOf(new Date());
    if (!regime.isTaxYearLabel(taxYear)) {
      return reply.status(400).send({ error: "taxYear must look like 2025-26" });
    }
    const data = await loadRegimeSummary(request.userId!, regime, taxYear);
    return reply.send({ data });
  });
}
