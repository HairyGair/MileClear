import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  fetchExportSummary,
  fetchExpenseSummary,
} from "../../services/export-data.js";
import {
  estimateUkTax,
  calculateMileageDeduction,
  parseTaxYear,
  UK_TAX_2025_26,
  sa103sExpenseBoxTotals,
  type VehicleType,
} from "@mileclear/shared";
import { logEvent } from "../../services/appEvents.js";
import { loadSaChecklist } from "../../services/saChecklist.js";
import { isClaimableTrip } from "../../lib/claimableTrips.js";

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
  // Self-Assessment wizard data is FREE as of 8 May 2026 — the wizard
  // helps users map their data to SA103 boxes ("fighting your corner"
  // tax tooling per paywall_philosophy.md). The print-ready PDF stays
  // Pro because PDF generation has real per-call compute cost; that's
  // gated separately under /exports/self-assessment.

  /**
   * GET /self-assessment/checklist[?preview=1]
   *
   * "Ready for 31 January?" checklist for the tax year the next 31 January
   * deadline is for (services/saChecklist.ts). Free. Scoped to the caller.
   * `inSeason` is true from 1 December to 31 January; `preview=1` forces it
   * on, for admins only, so the card can be checked before December.
   */
  app.get(
    "/checklist",
    async (
      request: FastifyRequest<{ Querystring: { preview?: string } }>,
      reply
    ) => {
      const forceSeason = request.query.preview === "1" && request.isAdmin === true;
      const checklist = await loadSaChecklist(request.userId!, { forceSeason });
      if (!checklist) return reply.status(404).send({ error: "User not found" });
      return reply.send({ data: checklist });
    }
  );

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
   * Protected: auth only (free as of 8 May 2026).
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

      const [summary, expenseSummary, trips, earnings, primaryVehicle, saUser] =
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
                  providedByOthers: true,
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
          prisma.user.findUnique({
            where: { id: userId },
            select: {
              workType: true,
              employerMileageRatePence: true,
              employerMileageRatePenceAfter10k: true,
              otherAnnualIncomePence: true,
            },
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
      // Business miles the deduction is worked out from: a vehicle someone
      // else pays for shows its business miles but claims nothing.
      const claimableMilesByVehicle = new Map<string, number>();

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
        if (isClaimableTrip(trip)) {
          claimableMilesByVehicle.set(vKey, (claimableMilesByVehicle.get(vKey) ?? 0) + trip.distanceMiles);
        }
      }

      // SA103 is the self-employment form: HMRC rates, not an employer's
      // rate, and the same figure the Self Assessment PDF prints.
      const rateOpts = {};
      for (const row of vehicleMap.values()) {
        row.businessMiles = Math.round(row.businessMiles * 100) / 100;
        row.personalMiles = Math.round(row.personalMiles * 100) / 100;
        row.totalMiles = Math.round(row.totalMiles * 100) / 100;
        row.deductionPence = calculateMileageDeduction(
          row.vehicleType as VehicleType,
          claimableMilesByVehicle.get(row.vehicleId) ?? 0,
          { ...rateOpts, taxYear: validatedTaxYear },
        ).deductionPence;
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

      // Other income (a salary, a pension) sets the rate the profit is taxed
      // at, the same as the Tax tab. Without it a small profit showed £0 tax
      // for a driver whose job already uses their personal allowance (7 Oct
      // 2026: demo, £509 profit on a £50k salary showed £0 vs £155 on Tax).
      const taxEstimate = estimateUkTax(taxableProfitPence, {
        otherIncomePence: saUser?.otherAnnualIncomePence ?? null,
      });
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
        taxEstimate,
        saUser?.otherAnnualIncomePence ?? null,
      );

      // SA103S box values - consumed by clients via SA103_BOXES[i].dataKey.
      // Box 12 is the mileage figure plus the claimable travel categories;
      // box 20 is every claimable expense plus mileage (SA103S 2025-26).
      const boxTotals = sa103sExpenseBoxTotals(expenseSummary.categories);
      const totalAllowableExpensesPence =
        mileageDeductionPence + allowableExpensesPence;
      const netPence = totalEarningsPence - totalAllowableExpensesPence;
      // Keys up to `taxableProfit` are read by app builds from before the
      // 2 Oct 2026 box correction (they show boxes 9/17/18/20/25/27/29/46/
      // 49/51); keep them until those builds are gone.
      const netProfitBeforeMileage =
        totalEarningsPence - allowableExpensesPence;
      const sa103Values: Record<string, number> = {
        carVanTravelExpenses: mileageDeductionPence + boxTotals[12],
        professionalFees: boxTotals[16],
        officeCosts: boxTotals[18],
        otherAllowableExpenses: boxTotals[19],
        totalAllowableExpenses: totalAllowableExpensesPence,
        netProfitTotal: Math.max(0, netPence),
        netLossTotal: Math.max(0, -netPence),
        netBusinessProfit: taxableProfitPence,
        totalEarnings: totalEarningsPence,
        otherIncome: 0, // SA103S box 10, other BUSINESS income; never the salary
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
  },
  otherIncomePence: number | null = null,
): TaxBandRow[] {
  const T = UK_TAX_2025_26;
  const profit = Math.max(0, taxableProfitPence);
  const other = Math.max(0, otherIncomePence ?? 0);
  const rows: TaxBandRow[] = [];
  const gbp = (p: number) => `£${Math.round(p / 100).toLocaleString("en-GB")}`;

  // The profit sits on top of any other income (salary, pension): each band
  // row is the part of the profit that falls in that band. With no other
  // income this is the profit on its own, as before 7 Oct 2026.
  const inBand = (lo: number, hi: number) =>
    Math.max(0, Math.min(other + profit, hi) - Math.max(other, lo));

  const paUsed = inBand(0, T.personalAllowancePence);
  rows.push({
    band: "Personal Allowance",
    type: "income_tax",
    ratePct: 0,
    amountPence: 0,
    description:
      other > 0
        ? `First ${gbp(T.personalAllowancePence)} of income is tax-free. Your other income (${gbp(other)}) uses ${gbp(Math.min(other, T.personalAllowancePence))} of it; ${gbp(paUsed)} of profit falls in it`
        : `First £${(T.personalAllowancePence / 100).toLocaleString(
            "en-GB"
          )} of profit is tax-free (£${(paUsed / 100).toLocaleString("en-GB")} used)`,
  });

  // ratePct is a decimal (0.20 = 20%). Clients multiply by 100 for display.
  const bands: [string, number, number, number, string][] = [
    ["Basic Rate", T.personalAllowancePence, T.basicRateThresholdPence, T.basicRate, "20% on income between £12,570 and £50,270"],
    ["Higher Rate", T.basicRateThresholdPence, T.higherRateThresholdPence, T.higherRate, "40% on income between £50,270 and £125,140"],
    ["Additional Rate", T.higherRateThresholdPence, Number.MAX_SAFE_INTEGER, T.additionalRate, "45% on income above £125,140"],
  ];
  let bandTax = 0;
  for (const [band, lo, hi, rate, description] of bands) {
    const taxed = inBand(lo, hi);
    if (taxed <= 0) continue;
    const amountPence = Math.round(taxed * rate);
    bandTax += amountPence;
    rows.push({
      band,
      type: "income_tax",
      ratePct: rate,
      amountPence,
      description: other > 0 ? `${description}: ${gbp(taxed)} of profit` : description.replace("income", "profit"),
    });
  }

  // Anything the bands don't explain (the Personal Allowance shrinking on
  // income over £100,000) so the rows always add up to the total.
  const unexplained = taxEstimate.incomeTaxPence - bandTax;
  if (Math.abs(unexplained) > 100) {
    rows.push({
      band: "Personal Allowance reduced",
      type: "income_tax",
      ratePct: null,
      amountPence: unexplained,
      description: "The tax-free allowance shrinks by £1 for every £2 of income over £100,000",
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
