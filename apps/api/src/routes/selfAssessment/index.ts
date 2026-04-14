import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import {
  fetchExportSummary,
  fetchExpenseSummary,
} from "../../services/export-data.js";
import {
  estimateUkTax,
  SA103_BOXES,
} from "@mileclear/shared";
import { logEvent } from "../../services/appEvents.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const taxYearSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "taxYear must be in the format YYYY-YY, e.g. 2025-26");

// ---------------------------------------------------------------------------
// Route module
// ---------------------------------------------------------------------------

export async function selfAssessmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", premiumMiddleware);

  /**
   * GET /self-assessment/summary?taxYear=2025-26
   *
   * Returns a structured object mapping all MileClear financial data for the
   * requested tax year to HMRC SA103 (Self-employment) form boxes.
   * Protected: auth + premium.
   */
  app.get(
    "/summary",
    async (
      request: FastifyRequest<{ Querystring: { taxYear?: string } }>,
      reply
    ) => {
      const { taxYear } = request.query;

      // Validate taxYear query param
      const parsed = taxYearSchema.safeParse(taxYear);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid taxYear",
          details: parsed.error.issues[0]?.message ?? "taxYear must be in format YYYY-YY, e.g. 2025-26",
        });
      }

      const userId = request.userId!;
      const validatedTaxYear = parsed.data;

      // Fetch mileage, trips, earnings and expense data in parallel
      const [summary, expenseSummary] = await Promise.all([
        fetchExportSummary(userId, validatedTaxYear),
        fetchExpenseSummary(userId, validatedTaxYear),
      ]);

      // ---------------------------------------------------------------------------
      // Earnings
      // ---------------------------------------------------------------------------

      const totalEarningsPence = summary.totalEarningsPence;
      const earningsByPlatform = summary.earningsByPlatform.map((e) => ({
        platform: e.platform,
        totalPence: e.totalPence,
      }));

      // ---------------------------------------------------------------------------
      // Mileage
      // ---------------------------------------------------------------------------

      const totalMiles = summary.totalMiles;
      const businessMiles = summary.businessMiles;
      const personalMiles = summary.personalMiles;
      const mileageDeductionPence = summary.totalDeductionPence;

      const vehicleBreakdown = summary.vehicleBreakdown.map((v) => ({
        vehicleName: v.vehicleName,
        vehicleType: v.vehicleType,
        businessMiles: v.businessMiles,
        deductionPence: v.deductionPence,
      }));

      // ---------------------------------------------------------------------------
      // Expenses
      // ---------------------------------------------------------------------------

      const allowableExpenses = expenseSummary.categories
        .filter((c) => c.deductibleWithMileage)
        .map((c) => ({
          category: c.category,
          label: c.label,
          totalPence: c.totalPence,
        }));

      const nonAllowableExpenses = expenseSummary.categories
        .filter((c) => !c.deductibleWithMileage)
        .map((c) => ({
          category: c.category,
          label: c.label,
          totalPence: c.totalPence,
        }));

      const totalAllowableExpensesPence = expenseSummary.totalAllowablePence;
      const totalNonAllowableExpensesPence = expenseSummary.totalNonAllowablePence;

      // ---------------------------------------------------------------------------
      // Tax calculation
      //
      // Using the simplified mileage method (Box 46). Under this method:
      //   taxable income = earnings - mileage deduction - other allowable expenses
      //
      // Non-vehicle allowable expenses (parking, tolls, phone, etc.) are still
      // deductible alongside simplified mileage.
      // ---------------------------------------------------------------------------

      const taxableIncomePence = Math.max(
        0,
        totalEarningsPence - mileageDeductionPence - totalAllowableExpensesPence
      );

      const rawTax = estimateUkTax(taxableIncomePence);
      const totalTaxPence =
        rawTax.incomeTaxPence + rawTax.class2NiPence + rawTax.class4NiPence;

      const taxEstimate = {
        incomeTaxPence: rawTax.incomeTaxPence,
        class2NiPence: rawTax.class2NiPence,
        class4NiPence: rawTax.class4NiPence,
        totalTaxPence,
        breakdown: {
          taxableProfit: taxableIncomePence,
          mileageDeductionApplied: mileageDeductionPence,
          allowableExpensesApplied: totalAllowableExpensesPence,
          grossEarnings: totalEarningsPence,
        },
      };

      // ---------------------------------------------------------------------------
      // SA103 box mapping
      //
      // We use the simplified mileage method (Box 46). The mapping below reflects
      // HMRC rules for self-employed gig workers using this method:
      //   - Box 9/10: total turnover (earnings)
      //   - Box 17/20/29: allowable non-vehicle expenses only (not mileage, since
      //     simplified mileage is claimed in Box 46 instead)
      //   - Box 18: net profit (earnings minus allowable non-vehicle expenses)
      //   - Box 27: other allowable expenses (parking, tolls, phone, etc.)
      //   - Box 46: simplified flat-rate mileage deduction
      //   - Box 49/51: taxable profit after all deductions
      //
      // Box 25 (actual motor expenses) is intentionally set to zero because the
      // simplified method is used. Box 10 is set to zero (no secondary income source).
      // ---------------------------------------------------------------------------

      const netProfitBeforeMileage =
        totalEarningsPence - totalAllowableExpensesPence;

      const boxValues: Record<string, number> = {
        totalEarnings: totalEarningsPence,
        otherIncome: 0,
        totalExpenses: totalAllowableExpensesPence,
        netProfit: Math.max(0, netProfitBeforeMileage),
        allowableExpenses: totalAllowableExpensesPence,
        motorExpenses: 0, // actual motor costs not used under simplified mileage
        otherExpenses: totalAllowableExpensesPence,
        mileageDeduction: mileageDeductionPence,
        adjustedProfit: taxableIncomePence,
        taxableProfit: taxableIncomePence,
      };

      const sa103Boxes = SA103_BOXES.map((b) => ({
        box: b.box,
        label: b.label,
        description: b.description,
        valuePence: boxValues[b.dataKey] ?? 0,
        section: b.section,
      }));

      // ---------------------------------------------------------------------------
      // Response
      // ---------------------------------------------------------------------------

      logEvent("self_assessment.summary", userId, { taxYear: validatedTaxYear });

      return reply.send({
        taxYear: validatedTaxYear,
        userName: summary.userName,

        // Income
        totalEarningsPence,
        earningsByPlatform,

        // Mileage
        totalMiles,
        businessMiles,
        personalMiles,
        mileageDeductionPence,
        vehicleBreakdown,

        // Expenses
        allowableExpenses,
        totalAllowableExpensesPence,
        nonAllowableExpenses,
        totalNonAllowableExpensesPence,

        // Tax
        taxableIncomePence,
        taxEstimate,

        // SA103 form boxes
        sa103Boxes,
      });
    }
  );
}
