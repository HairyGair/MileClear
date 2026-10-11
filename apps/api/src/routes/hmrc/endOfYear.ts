// End-of-year tax return routes for Making Tax Digital for Income Tax.
//
// Registered from routes/hmrc/index.ts, so every path sits under /hmrc.
// Pro-gated like the quarterly update routes. Everything runs against HMRC's
// sandbox until production credentials arrive.
//
//   GET    /hmrc/tax-return/:taxYear/status                 quarters sent? already submitted?
//   GET    /hmrc/tax-return/:taxYear/annual                 what HMRC holds + what MileClear would send
//   PUT    /hmrc/tax-return/:taxYear/annual                 send MileClear's allowances/adjustments (if any)
//   DELETE /hmrc/tax-return/:taxYear/annual                 delete the annual submission (body: { confirm: true })
//   POST   /hmrc/tax-return/:taxYear/calculation            trigger the intent-to-finalise calculation
//   GET    /hmrc/tax-return/:taxYear/calculation/:calcId    retrieve it (ready:false while HMRC works)
//   POST   /hmrc/tax-return/:taxYear/submit                 submit the tax return (HMRC: final declaration)
//   GET    /hmrc/tax-return/:taxYear/accounting-type        cash basis or traditional, as HMRC holds it
//   PUT    /hmrc/tax-return/:taxYear/accounting-type        change it (body: { accountingType })
//   GET    /hmrc/tax-return/:taxYear/periods-of-account     what HMRC holds about the accounting period
//   PUT    /hmrc/tax-return/:taxYear/periods-of-account     send the driver's answer (body: { choice, startDate?, endDate? })
//
// HMRC's journey and wording: docs/hmrc-end-of-year-oct2026.md

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TAX_RETURN_DECLARATION_VERSION } from "@mileclear/shared";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import {
  getHmrcConfig,
  buildClientContext,
  buildServerContext,
  fetchObligations,
  listCalculations,
  triggerCalculation,
  retrieveBusiness,
  buildPeriodSubmission,
  isValidHmrcTaxYear,
} from "../../services/hmrc/index.js";
import {
  retrieveAnnualSubmission,
  submitAnnualSubmission,
  deleteAnnualSubmission,
} from "../../services/hmrc/annualSubmission.js";
import { buildAnnualSubmission } from "../../services/hmrc/annualMapping.js";
import {
  summariseQuarterlyStatus,
  findSubmittedTaxReturn,
  retrieveTaxReturnCalculation,
  submitFinalDeclaration,
  taxReturnBlocker,
  plainTaxReturnError,
  taxYearBounds,
} from "../../services/hmrc/taxReturn.js";
import {
  retrieveAccountingType,
  updateAccountingType,
  retrievePeriodsOfAccount,
  submitPeriodsOfAccount,
  buildPeriodsOfAccount,
  describeHeldPeriods,
  normaliseAccountingType,
  type HmrcAccountingType,
} from "../../services/hmrc/yearEndBusinessDetails.js";
import { handleHmrcError, loadConnectionWithNino } from "./index.js";

const taxYearParam = z.object({
  taxYear: z.string().refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format."),
});

/** True from 6 April after the tax year (UK date, compared in UTC). */
export function hasTaxYearEnded(taxYear: string, now: Date = new Date()): boolean {
  const { end } = taxYearBounds(taxYear);
  return now.toISOString().slice(0, 10) > end;
}

/** NINO + chosen businessId, or an error envelope. */
async function loadContext(userId: string) {
  const ctx = await loadConnectionWithNino(userId);
  if ("error" in ctx) return ctx;
  const conn = await prisma.hmrcConnection.findUnique({
    where: { userId },
    select: { businessId: true },
  });
  if (!conn?.businessId) {
    return { error: "Choose your self-employment business first.", status: 400 as const };
  }
  return { nino: ctx.nino, businessId: conn.businessId };
}

/**
 * HMRC's accounting type for the year: the per-year record first, then the
 * business record. Only changes wording, so a failed lookup gives null.
 */
async function resolveAccountingType(args: {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;
  client: ReturnType<typeof buildClientContext>;
  server: Awaited<ReturnType<typeof buildServerContext>>;
}): Promise<HmrcAccountingType | null> {
  const perYear = await retrieveAccountingType(args).catch(() => null);
  if (perYear) return perYear;
  const business = await retrieveBusiness(args).catch(() => null);
  return normaliseAccountingType(business?.accountingType);
}

/** Year totals from MileClear data, the same figures the quarterly updates use. */
async function yearTotals(userId: string, taxYear: string) {
  const { start, end } = taxYearBounds(taxYear);
  const sub = await buildPeriodSubmission({
    prisma,
    userId,
    taxYear,
    periodStartDate: start,
    periodEndDate: end,
  });
  const e = sub.breakdown.expenses;
  return {
    turnoverPence: sub.breakdown.income.turnoverPence + sub.breakdown.income.otherPence,
    expensesClaimedPence:
      e.carVanTravelPence + (e.professionalFeesPence ?? 0) + e.adminCostsPence + e.otherExpensesPence,
  };
}

export async function hmrcTaxReturnRoutes(app: FastifyInstance) {
  const pre = { preHandler: [authMiddleware, premiumMiddleware] };

  // ── Status: quarters sent, tax return already submitted ──────────────
  app.get("/tax-return/:taxYear/status", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const { taxYear } = params.data;
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

    const { start, end } = taxYearBounds(taxYear);
    try {
      const client = buildClientContext(request);
      const server = await buildServerContext();
      const obligations = await fetchObligations({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        from: start,
        to: end,
        client,
        server,
      });
      const calcs = await listCalculations({
        userId: request.userId!,
        nino: ctx.nino,
        taxYear,
        client,
        server,
      }).catch(() => []);

      return reply.send({
        data: {
          taxYear,
          environment: getHmrcConfig()?.environment ?? "sandbox",
          yearEnded: hasTaxYearEnded(taxYear),
          quarterly: summariseQuarterlyStatus(obligations, taxYear),
          submitted: findSubmittedTaxReturn(calcs),
        },
      });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  // ── Annual submission: allowances and adjustments ───────────────────
  app.get("/tax-return/:taxYear/annual", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const { taxYear } = params.data;
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

    try {
      const client = buildClientContext(request);
      const server = await buildServerContext();
      const held = await retrieveAnnualSubmission({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        taxYear,
        client,
        server,
      });
      const accountingType = await resolveAccountingType({
        userId: request.userId!, nino: ctx.nino, businessId: ctx.businessId, taxYear, client, server,
      });
      const totals = await yearTotals(request.userId!, taxYear);
      const proposal = buildAnnualSubmission({ taxYear, accountingType, ...totals });
      return reply.send({ data: { held, proposal } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  app.put("/tax-return/:taxYear/annual", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const { taxYear } = params.data;
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

    try {
      const client = buildClientContext(request);
      const server = await buildServerContext();
      const accountingType = await resolveAccountingType({
        userId: request.userId!, nino: ctx.nino, businessId: ctx.businessId, taxYear, client, server,
      });
      const totals = await yearTotals(request.userId!, taxYear);
      const proposal = buildAnnualSubmission({ taxYear, accountingType, ...totals });
      // The body only ever comes from the mapping rules, never from the
      // client, so nothing MileClear can't justify reaches HMRC.
      if (!proposal.body) {
        return reply.status(409).send({
          error: {
            code: "NOTHING_TO_SEND",
            message: "MileClear has no allowances or adjustments to send for this year.",
            retryable: false,
          },
        });
      }
      await submitAnnualSubmission({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        taxYear,
        body: proposal.body,
        client,
        server,
      });
      logEvent("hmrc.annual_submitted", request.userId!, { taxYear, businessId: ctx.businessId });
      return reply.send({ data: { sent: proposal.body } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  const deleteBody = z.object({ confirm: z.literal(true) });
  app.delete("/tax-return/:taxYear/annual", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    if (!deleteBody.safeParse(request.body).success) {
      return reply.status(400).send({ error: "Send { confirm: true } to delete the annual submission." });
    }
    const { taxYear } = params.data;
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

    try {
      await deleteAnnualSubmission({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        taxYear,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      logEvent("hmrc.annual_deleted", request.userId!, { taxYear, businessId: ctx.businessId });
      return reply.send({ data: { deleted: true } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  // ── End-of-year calculation ─────────────────────────────────────────
  // The driver must have said they have no other income, or that they have
  // already sent it elsewhere. HMRC's guide: software must make sure the
  // customer "has already provided their entire income" before this step.
  const triggerBody = z.object({ otherIncomeConfirmed: z.literal(true) });
  app.post("/tax-return/:taxYear/calculation", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    if (!triggerBody.safeParse(request.body).success) {
      return reply.status(400).send({
        error: "Confirm that all your other income for the year is already with HMRC first.",
      });
    }
    const { taxYear } = params.data;
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

    try {
      const result = await triggerCalculation({
        userId: request.userId!,
        nino: ctx.nino,
        taxYear,
        calculationType: "intent-to-finalise",
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      logEvent("hmrc.tax_return_calculation_triggered", request.userId!, {
        taxYear,
        calculationId: result.calculationId,
      });
      return reply.send({ data: { calculationId: result.calculationId } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  app.get("/tax-return/:taxYear/calculation/:calculationId", pre, async (request, reply) => {
    const params = taxYearParam.extend({ calculationId: z.string().min(1).max(64) }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

    try {
      const calc = await retrieveTaxReturnCalculation({
        userId: request.userId!,
        nino: ctx.nino,
        taxYear: params.data.taxYear,
        calculationId: params.data.calculationId,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      return reply.send({ data: { ...calc, blocker: calc.ready ? taxReturnBlocker(calc) : null } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  // ── Submit the tax return ───────────────────────────────────────────
  const submitBody = z.object({
    calculationId: z.string().min(1).max(64),
    declarationAccepted: z.literal(true),
    otherIncomeConfirmed: z.literal(true),
    declarationVersion: z.string().min(1).max(64),
  });
  app.post("/tax-return/:taxYear/submit", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const body = submitBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: "Tick the declaration and confirm your other income before you submit.",
      });
    }
    if (body.data.declarationVersion !== TAX_RETURN_DECLARATION_VERSION) {
      return reply.status(409).send({
        error: {
          code: "DECLARATION_CHANGED",
          message: "The declaration wording has changed. Update MileClear, read it again, then submit.",
          retryable: false,
        },
      });
    }
    const { taxYear } = params.data;
    const { calculationId } = body.data;
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

    try {
      const client = buildClientContext(request);
      const server = await buildServerContext();
      // Check the calculation again here, whatever the app showed: it must be
      // finished, error-free and the end-of-year type.
      const calc = await retrieveTaxReturnCalculation({
        userId: request.userId!,
        nino: ctx.nino,
        taxYear,
        calculationId,
        client,
        server,
      });
      const blocker = taxReturnBlocker(calc);
      if (blocker) {
        return reply.status(409).send({
          error: { code: "CALCULATION_NOT_READY", message: blocker, retryable: false },
        });
      }

      // HMRC: periods of account "has to be submitted before final declaration".
      const periods = await retrievePeriodsOfAccount({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        taxYear,
        client,
        server,
      });
      if (!periods) {
        return reply.status(409).send({
          error: {
            code: "PERIODS_OF_ACCOUNT_MISSING",
            message: "Tell HMRC about your accounting period for this year first. It's one of the end-of-year steps.",
            retryable: false,
          },
        });
      }

      const { correlationId } = await submitFinalDeclaration({
        userId: request.userId!,
        nino: ctx.nino,
        taxYear,
        calculationId,
        client,
        server,
      });
      const submittedAt = new Date().toISOString();
      const environment = getHmrcConfig()?.environment ?? "sandbox";
      logEvent("hmrc.tax_return_submitted", request.userId!, {
        taxYear,
        calculationId,
        correlationId,
        environment,
        declarationVersion: body.data.declarationVersion,
        totalIncomeTaxAndNicsDue: calc.totalIncomeTaxAndNicsDue ?? null,
      });
      return reply.send({
        data: {
          taxYear,
          calculationId,
          correlationId,
          submittedAt,
          environment,
          totalIncomeTaxAndNicsDue: calc.totalIncomeTaxAndNicsDue ?? null,
        },
      });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  // ── Accounting method (cash basis or traditional) ───────────────────
  app.get("/tax-return/:taxYear/accounting-type", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });
    try {
      const accountingType = await retrieveAccountingType({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        taxYear: params.data.taxYear,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      return reply.send({ data: { accountingType } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  const accountingTypeBody = z.object({ accountingType: z.enum(["CASH", "ACCRUAL"]) });
  app.put("/tax-return/:taxYear/accounting-type", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const body = accountingTypeBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Choose cash basis or traditional accounting." });
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });
    try {
      await updateAccountingType({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        taxYear: params.data.taxYear,
        accountingType: body.data.accountingType,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      logEvent("hmrc.accounting_type_updated", request.userId!, {
        taxYear: params.data.taxYear,
        accountingType: body.data.accountingType,
      });
      return reply.send({ data: { accountingType: body.data.accountingType } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  // ── Periods of account ──────────────────────────────────────────────
  app.get("/tax-return/:taxYear/periods-of-account", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });
    try {
      const held = await retrievePeriodsOfAccount({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        taxYear: params.data.taxYear,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      return reply.send({ data: { held, answer: describeHeldPeriods(held, params.data.taxYear) } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });

  const periodsBody = z.object({
    choice: z.enum(["tax_year", "to_31_march", "custom", "none"]),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });
  app.put("/tax-return/:taxYear/periods-of-account", pre, async (request, reply) => {
    const params = taxYearParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: params.error.issues[0].message });
    const body = periodsBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Choose an answer about your accounting period." });
    // The HMRC body is built here from the driver's answer, never taken raw.
    const plan = buildPeriodsOfAccount({ taxYear: params.data.taxYear, ...body.data });
    if (!plan.body) return reply.status(400).send({ error: plan.error ?? "Check your answer." });
    const ctx = await loadContext(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });
    try {
      await submitPeriodsOfAccount({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: ctx.businessId,
        taxYear: params.data.taxYear,
        body: plan.body,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      logEvent("hmrc.periods_of_account_submitted", request.userId!, {
        taxYear: params.data.taxYear,
        choice: body.data.choice,
      });
      return reply.send({ data: { sent: plan.body, warnings: plan.warnings } });
    } catch (err) {
      return handleHmrcError(reply, plainTaxReturnError(err));
    }
  });
}
