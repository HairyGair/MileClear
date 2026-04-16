import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import {
  fetchExportSummary,
  fetchExpenseSummary,
} from "../../services/export-data.js";
import {
  estimateUkTax,
  calculateHmrcDeduction,
  parseTaxYear,
  UK_TAX_2025_26,
  type VehicleType,
} from "@mileclear/shared";
import { logEvent } from "../../services/appEvents.js";

const taxYearSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "taxYear must be in the format YYYY-YY, e.g. 2025-26");

interface TaxBandRow {
  band: string;
  type: string;
  ratePct: number | null;
  amountPence: number;
  description: string;
}

export async function selfAssessmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", premiumMiddleware);

  /**
   * GET /self-assessment/summary?taxYear=2025-26
   *
   * Returns the full financial summary needed by the Self Assessment wizard
   * (mobile + web). Response is wrapped in `{ data: ... }` - both clients
   * call `api.get<{ data: SelfAssessmentSummary }>(...)`.
   *
   * Shape matches the `SelfAssessmentSummary` interface duplicated in:
   *   - apps/mobile/lib/api/selfAssessment.ts
   *   - apps/web/src/app/dashboard/self-assessment/page.tsx
   *
   * Protected: auth + premium.
   */
  app.get(
    "/summary",
    async (
      request: FastifyRequest<{ Querystring: { taxYear?: string } }>,
      reply
    ) => {
      const { taxYear } = request.query;

      const parsed = taxYearSchema.safeParse(taxYear);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid taxYear",
          details:
            parsed.error.issues[0]?.message ??
            "taxYear must be in format YYYY-YY, e.g. 2025-26",
        });
      }

      const userId = request.userId!;
      const validatedTaxYear = parsed.data;
      const { start, end } = parseTaxYear(validatedTaxYear);

      const [summary, expenseSummary, trips, earnings, primaryVehicle] =
        await Promise.all([
          fetchExportSummary(userId, validatedTaxYear),
          fetchExpenseSummary(userId, validatedTaxYear),
          prisma.trip.findMany({
            where: { userId, startedAt: { gte: start, lte: end } },
            include: {
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  vehicleType: true,
                },
              },
            },
          }),
          prisma.earning.findMany({
            where: {
              userId,
              periodStart: { gte: start },
              periodEnd: { lte: end },
            },
            select: { platform: true, amountPence: true },
          }),
          prisma.vehicle.findFirst({
            where: { userId },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: { id: true, make: true, model: true, vehicleType: true },
          }),
        ]);

      // Platform breakdown with per-platform count
      const platformMap = new Map<
        string,
        { platform: string; totalPence: number; count: number }
      >();
      for (const e of earnings) {
        const row = platformMap.get(e.platform);
        if (row) {
          row.totalPence += e.amountPence;
          row.count += 1;
        } else {
          platformMap.set(e.platform, {
            platform: e.platform,
            totalPence: e.amountPence,
            count: 1,
          });
        }
      }
      const platformBreakdown = Array.from(platformMap.values()).sort(
        (a, b) => b.totalPence - a.totalPence
      );

      // Vehicle breakdown - richer than fetchExportSummary's output because
      // the wizard needs vehicleId/make/model/personalMiles per vehicle.
      interface VehicleRow {
        vehicleId: string;
        make: string;
        model: string;
        vehicleType: string;
        businessMiles: number;
        personalMiles: number;
        totalMiles: number;
        deductionPence: number;
      }

      const vehicleMap = new Map<string, VehicleRow>();
      for (const trip of trips) {
        const vehicle = trip.vehicle ?? primaryVehicle;
        const vKey = trip.vehicleId || primaryVehicle?.id || "unassigned";
        let row = vehicleMap.get(vKey);
        if (!row) {
          row = {
            vehicleId: vKey,
            make: vehicle?.make ?? "Unassigned",
            model: vehicle?.model ?? "",
            vehicleType: (vehicle?.vehicleType || "car") as VehicleType,
            businessMiles: 0,
            personalMiles: 0,
            totalMiles: 0,
            deductionPence: 0,
          };
          vehicleMap.set(vKey, row);
        }
        row.totalMiles += trip.distanceMiles;
        if (trip.classification === "business") {
          row.businessMiles += trip.distanceMiles;
        } else {
          row.personalMiles += trip.distanceMiles;
        }
      }

      for (const row of vehicleMap.values()) {
        row.businessMiles = Math.round(row.businessMiles * 100) / 100;
        row.personalMiles = Math.round(row.personalMiles * 100) / 100;
        row.totalMiles = Math.round(row.totalMiles * 100) / 100;
        row.deductionPence = calculateHmrcDeduction(
          row.vehicleType as VehicleType,
          row.businessMiles
        );
      }
      const vehicleBreakdown = Array.from(vehicleMap.values()).sort(
        (a, b) => b.businessMiles - a.businessMiles
      );

      // Totals + tax estimate
      const totalEarningsPence = summary.totalEarningsPence;
      const mileageDeductionPence = summary.totalDeductionPence;
      const allowableExpensesPence = expenseSummary.totalAllowablePence;
      const nonMileageExpensesPence = expenseSummary.totalNonAllowablePence;
      const taxableProfitPence = Math.max(
        0,
        totalEarningsPence - mileageDeductionPence - allowableExpensesPence
      );

      const taxEstimate = estimateUkTax(taxableProfitPence);
      const totalTaxPence =
        taxEstimate.incomeTaxPence +
        taxEstimate.class2NiPence +
        taxEstimate.class4NiPence;
      const effectiveRatePercent =
        totalEarningsPence > 0
          ? Math.round((totalTaxPence / totalEarningsPence) * 10000) / 100
          : 0;

      const taxBandBreakdown = buildTaxBandBreakdown(
        taxableProfitPence,
        taxEstimate
      );

      // SA103 box values - consumed by clients via box.dataKey lookup
      const netProfitBeforeMileage =
        totalEarningsPence - allowableExpensesPence;
      const sa103Values: Record<string, number> = {
        totalEarnings: totalEarningsPence,
        otherIncome: 0,
        totalExpenses: allowableExpensesPence,
        netProfit: Math.max(0, netProfitBeforeMileage),
        allowableExpenses: allowableExpensesPence,
        motorExpenses: 0, // actual motor costs unused under simplified mileage
        otherExpenses: allowableExpensesPence,
        mileageDeduction: mileageDeductionPence,
        adjustedProfit: taxableProfitPence,
        taxableProfit: taxableProfitPence,
      };

      logEvent("self_assessment.summary", userId, {
        taxYear: validatedTaxYear,
      });

      return reply.send({
        data: {
          taxYear: validatedTaxYear,
          totalEarningsPence,
          platformBreakdown,
          totalMiles: summary.totalMiles,
          businessMiles: summary.businessMiles,
          personalMiles: summary.personalMiles,
          mileageDeductionPence,
          vehicleBreakdown,
          expenseBreakdown: expenseSummary.categories,
          allowableExpensesPence,
          nonMileageExpensesPence,
          taxableProfitPence,
          taxBandBreakdown,
          totalTaxPence,
          effectiveRatePercent,
          sa103Values,
        },
      });
    }
  );
}

function buildTaxBandBreakdown(
  taxableProfitPence: number,
  taxEstimate: {
    incomeTaxPence: number;
    class2NiPence: number;
    class4NiPence: number;
  }
): TaxBandRow[] {
  const T = UK_TAX_2025_26;
  const profit = Math.max(0, taxableProfitPence);
  const rows: TaxBandRow[] = [];

  const paUsed = Math.min(profit, T.personalAllowancePence);
  rows.push({
    band: "Personal Allowance",
    type: "income_tax",
    ratePct: 0,
    amountPence: 0,
    description: `First £${(T.personalAllowancePence / 100).toLocaleString(
      "en-GB"
    )} of profit is tax-free (£${(paUsed / 100).toLocaleString("en-GB")} used)`,
  });

  // ratePct is a decimal (0.20 = 20%). Clients multiply by 100 for display.
  if (profit > T.personalAllowancePence) {
    const basicTaxed =
      Math.min(profit, T.basicRateThresholdPence) - T.personalAllowancePence;
    rows.push({
      band: "Basic Rate",
      type: "income_tax",
      ratePct: T.basicRate,
      amountPence: Math.round(basicTaxed * T.basicRate),
      description: "20% on profit between £12,570 and £50,270",
    });
  }

  if (profit > T.basicRateThresholdPence) {
    const higherTaxed =
      Math.min(profit, T.higherRateThresholdPence) - T.basicRateThresholdPence;
    rows.push({
      band: "Higher Rate",
      type: "income_tax",
      ratePct: T.higherRate,
      amountPence: Math.round(higherTaxed * T.higherRate),
      description: "40% on profit between £50,270 and £125,140",
    });
  }

  if (profit > T.higherRateThresholdPence) {
    const additionalTaxed = profit - T.higherRateThresholdPence;
    rows.push({
      band: "Additional Rate",
      type: "income_tax",
      ratePct: T.additionalRate,
      amountPence: Math.round(additionalTaxed * T.additionalRate),
      description: "45% on profit above £125,140",
    });
  }

  if (taxEstimate.class2NiPence > 0) {
    rows.push({
      band: "Class 2 National Insurance",
      type: "class2_ni",
      ratePct: null,
      amountPence: taxEstimate.class2NiPence,
      description: "£3.45/week flat rate for self-employed",
    });
  }

  if (taxEstimate.class4NiPence > 0) {
    rows.push({
      band: "Class 4 National Insurance",
      type: "class4_ni",
      ratePct: T.class4NiLowerRate,
      amountPence: taxEstimate.class4NiPence,
      description: "6% on profit between £12,570 and £50,270, 2% above",
    });
  }

  return rows;
}
