import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { ukDateParts } from "@mileclear/shared";
import { loadTaxPlan, updatePlannerSettings, MAX_ENTERED_BILL_PENCE } from "../../services/taxPlanner.js";
import { shiftTaxYear, taxYearOfDay } from "../../services/taxPlannerMath.js";

const taxYearSchema = z.string().regex(/^\d{4}-\d{2}$/);

const settingsSchema = z.object({
  firstSelfEmployedTaxYear: z.union([z.literal("earlier"), taxYearSchema, z.null()]).optional(),
  bills: z
    .record(taxYearSchema, z.union([z.number().int().min(0).max(MAX_ENTERED_BILL_PENCE), z.null()]))
    .optional(),
});

/**
 * Tax bill planner. Free for every driver (auth only): the dated Self
 * Assessment payments and a weekly set-aside figure (services/taxPlanner.ts).
 */
export async function taxPlannerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  /** GET /tax-planner: the plan, scoped to the caller. */
  app.get("/", async (request, reply) => {
    const plan = await loadTaxPlan(request.userId!);
    if (!plan) return reply.status(404).send({ error: "User not found" });
    return reply.send({ data: plan });
  });

  /**
   * PATCH /tax-planner/settings
   * { firstSelfEmployedTaxYear?: "2026-27" | "earlier" | null,
   *   bills?: { "2025-26": pence | null } }
   * Start year must be one of the three years the planner reads (or
   * "earlier"); bills for other years are ignored.
   */
  app.patch(
    "/settings",
    async (request: FastifyRequest<{ Body: unknown }>, reply) => {
      const parsed = settingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid settings" });
      }
      const started = parsed.data.firstSelfEmployedTaxYear;
      if (started && started !== "earlier") {
        const p = ukDateParts(new Date());
        const current = taxYearOfDay({ year: p.year, month: p.month, day: p.day });
        const allowed = [shiftTaxYear(current, -2), shiftTaxYear(current, -1), current];
        if (!allowed.includes(started)) {
          return reply.status(400).send({ error: "Start year must be one of the last three tax years" });
        }
      }
      const settings = await updatePlannerSettings(request.userId!, parsed.data);
      if (!settings) return reply.status(404).send({ error: "User not found" });
      return reply.send({ data: settings });
    }
  );
}
