// HMRC Making Tax Digital for Income Tax: the end-of-year tax return.
//
// HMRC's API calls this the "final declaration" (formerly "crystallisation").
// HMRC's terminology guide says not to use that phrase with customers, so
// driver-facing copy says "tax return"; code names keep HMRC's terms so they
// match the API docs.
//
// Journey (HMRC end-to-end service guide, "Tax return user journey"):
//   1. Trigger a calculation with calculationType intent-to-finalise.
//   2. Retrieve it (404 while HMRC is still working on it). Show it to the
//      driver: HMRC asks for at least the equivalent of an SA302.
//   3. Driver agrees to HMRC's declaration.
//   4. Submit the final declaration against THAT calculationId.
//   5. Show our own confirmation: "HMRC does not do this".
//
// Endpoints (Individual Calculations API 8.0, checked 11 Oct 2026):
//   POST /individuals/calculations/{nino}/self-assessment/{taxYear}/trigger/intent-to-finalise
//        (done by triggerCalculation in calculations.ts)
//   GET  /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}
//   POST /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}/final-declaration
//        -> 204, no body. The X-CorrelationId header is the only trace back.
//
// Reference: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-calculations-api/8.0
// Research notes: docs/hmrc-end-of-year-oct2026.md

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall, HmrcError } from "./client.js";
import { isValidHmrcTaxYear } from "./selfEmployment.js";
import {
  summariseCalculation,
  type HmrcCalculationListItem,
  type HmrcCalculationSummary,
} from "./calculations.js";
import type { NormalisedObligation } from "./obligations.js";

const CALC_API_VERSION = "8.0";

// ── Quarterly updates check ────────────────────────────────────────────

export interface QuarterlyStatus {
  /** HMRC's quarterly obligations that fall inside the tax year, oldest first. */
  quarters: Array<{ start: string; end: string; due: string; sent: boolean; received?: string }>;
  sentCount: number;
  /** True only when HMRC lists at least one quarter and every one is fulfilled. */
  allSent: boolean;
}

/** 6 April to 5 April, as YYYY-MM-DD strings. */
export function taxYearBounds(taxYear: string): { start: string; end: string } {
  if (!isValidHmrcTaxYear(taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${taxYear} (expected YYYY-YY)`);
  }
  const startYear = parseInt(taxYear.slice(0, 4), 10);
  return { start: `${startYear}-04-06`, end: `${startYear + 1}-04-05` };
}

/**
 * Pick the obligations that belong to the tax year and say whether they have
 * all been sent. HMRC's list is the source of truth for how many quarters
 * there are (usually four; fewer if the business started mid-year).
 *
 * A quarter belongs to the year when it ENDS after 5 April of the first year
 * and on or before 5 April of the second. That covers standard quarters
 * (ending 5 Jul, 5 Oct, 5 Jan, 5 Apr) and calendar quarters (ending 30 Jun,
 * 30 Sep, 31 Dec, 31 Mar).
 */
export function summariseQuarterlyStatus(
  obligations: Pick<NormalisedObligation, "start" | "end" | "due" | "status" | "received">[],
  taxYear: string
): QuarterlyStatus {
  const { start, end } = taxYearBounds(taxYear);
  const previousYearEnd = `${start.slice(0, 4)}-04-05`;
  const quarters = obligations
    .filter((o) => o.end > previousYearEnd && o.end <= end)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((o) => ({
      start: o.start,
      end: o.end,
      due: o.due,
      sent: o.status === "Fulfilled",
      received: o.received,
    }));
  // De-duplicate (HMRC can list the same period under two filters).
  const seen = new Set<string>();
  const unique = quarters.filter((q) => {
    const k = `${q.start}|${q.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const sentCount = unique.filter((q) => q.sent).length;
  return {
    quarters: unique,
    sentCount,
    allSent: unique.length > 0 && sentCount === unique.length,
  };
}

/**
 * Has a tax return already been submitted for this year? HMRC's list shows
 * the declared calculation as calculationType "final-declaration" (8.0 list)
 * or "declare-finalisation" (retrieve metadata), or flags finalDeclaration.
 */
export function findSubmittedTaxReturn(
  list: Array<HmrcCalculationListItem & { finalDeclaration?: boolean; finalDeclarationTimestamp?: string }>
): { calculationId: string; submittedAt?: string } | null {
  const hit = list.find(
    (c) =>
      c.finalDeclaration === true ||
      c.crystallised === true ||
      (c.calculationType as string) === "final-declaration" ||
      (c.calculationType as string) === "declare-finalisation"
  );
  if (!hit) return null;
  return {
    calculationId: hit.calculationId,
    submittedAt: hit.finalDeclarationTimestamp ?? hit.calculationTimestamp,
  };
}

// ── The calculation the driver reviews ─────────────────────────────────

export interface CalcMessage {
  id: string;
  text: string;
}

export interface TaxReturnCalculation {
  ready: boolean;
  calculationId: string;
  taxYear: string;
  /** From metadata. Must be intent-to-finalise before a tax return can be submitted. */
  calculationType?: string;
  periodFrom?: string;
  periodTo?: string;
  /** Headline figures, pounds. */
  totalIncomeReceived?: number;
  personalAllowance?: number;
  totalAllowancesAndDeductions?: number;
  totalTaxableIncome?: number;
  incomeTax?: number;
  class2Nics?: number;
  class4Nics?: number;
  /** Tax already paid, for example PAYE or tax taken off at source. */
  totalTaxDeducted?: number;
  /** The amount HMRC says is due. Negative means a refund. */
  totalIncomeTaxAndNicsDue?: number;
  /** Income by source, pounds. */
  incomeSources: Array<{ label: string; amount: number }>;
  /** Income Tax by band, the SA302-style lines. */
  taxBands: Array<{ name: string; rate: number; income: number; taxAmount: number }>;
  errors: CalcMessage[];
  warnings: CalcMessage[];
  info: CalcMessage[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function messages(v: unknown): CalcMessage[] {
  return arr(v)
    .map((m) => obj(m))
    .filter((m) => typeof m.text === "string" || typeof m.id === "string")
    .map((m) => ({ id: String(m.id ?? ""), text: String(m.text ?? "") }));
}

const BAND_LABELS: Record<string, string> = {
  "SRT": "Starter rate",
  "BRT": "Basic rate",
  "IRT": "Intermediate rate",
  "HRT": "Higher rate",
  "ART": "Additional rate",
  "ART_scottish": "Top rate",
  "ZRT": "Zero rate",
  "savings-starter-rate": "Savings starter rate",
  "savings-nil-rate": "Savings nil rate",
  "basic-rate": "Basic rate",
  "intermediate-rate": "Intermediate rate",
  "higher-rate": "Higher rate",
  "additional-rate": "Additional rate",
  "advanced-rate": "Advanced rate",
  "top-rate": "Top rate",
  "starter-rate": "Starter rate",
  "dividend-nil-rate": "Dividend nil rate",
  "dividend-basic-rate": "Dividend basic rate",
  "dividend-higher-rate": "Dividend higher rate",
  "dividend-additional-rate": "Dividend additional rate",
};

/**
 * Turn HMRC's (very large) calculation into the figures the review screen
 * shows. Builds on summariseCalculation for the headline numbers and adds
 * the SA302-style detail: income by source, personal allowance, Income Tax
 * by band, tax already paid, and HMRC's messages.
 */
export function summariseTaxReturnCalculation(raw: unknown, fallbackCalcId: string): TaxReturnCalculation {
  const r = obj(raw);
  const headline: HmrcCalculationSummary = summariseCalculation(
    r as Parameters<typeof summariseCalculation>[0],
    fallbackCalcId
  );
  const meta = obj(r.metadata);
  const calc = obj(r.calculation);
  const tc = obj(calc.taxCalculation);
  const it = obj(tc.incomeTax);
  const nics = obj(tc.nics);
  const msgs = obj(r.messages);

  const incomeSources: Array<{ label: string; amount: number }> = [];
  for (const b of arr(calc.businessProfitAndLoss)) {
    const bo = obj(b);
    const amount = num(bo.taxableProfit) ?? num(bo.netProfit);
    if (amount === undefined) continue;
    const type = String(bo.incomeSourceType ?? "");
    const label =
      type === "self-employment" || type === "01"
        ? "Self-employment profit"
        : type.includes("property") || type === "02" || type === "03"
          ? "Property profit"
          : "Business profit";
    incomeSources.push({ label, amount });
  }
  const totals = obj(calc.incomeSummaryTotals);
  const employment = num(totals.totalEmploymentIncome);
  if (employment !== undefined && employment !== 0) {
    incomeSources.push({ label: "Employment income", amount: employment });
  }
  // If HMRC sent no per-business breakdown, fall back to the totals line.
  if (!incomeSources.some((s) => s.label === "Self-employment profit")) {
    const se = num(totals.totalSelfEmploymentProfit);
    if (se !== undefined) incomeSources.unshift({ label: "Self-employment profit", amount: se });
  }

  const taxBands: TaxReturnCalculation["taxBands"] = [];
  for (const section of ["payPensionsProfit", "savingsAndGains", "dividends"]) {
    for (const band of arr(obj(it[section]).taxBands)) {
      const bo = obj(band);
      const name = String(bo.name ?? "");
      const rate = num(bo.rate);
      const income = num(bo.income);
      const taxAmount = num(bo.taxAmount);
      if (rate === undefined || income === undefined || taxAmount === undefined) continue;
      taxBands.push({ name: BAND_LABELS[name] ?? name, rate, income, taxAmount });
    }
  }

  const class4 = num(obj(nics.class4Nics).totalAmount) ?? headline.nic4;
  const class2 = num(obj(nics.class2Nics).amount) ?? headline.nic2;
  const errors = messages(msgs.errors);

  return {
    // A calculation with errors produces no figures; it is still "ready" in
    // the sense that HMRC has finished, so the screen can show the errors.
    ready: headline.ready || errors.length > 0,
    calculationId: headline.calculationId,
    taxYear: headline.taxYear,
    calculationType: typeof meta.calculationType === "string" ? meta.calculationType : undefined,
    periodFrom: typeof meta.periodFrom === "string" ? meta.periodFrom : undefined,
    periodTo: typeof meta.periodTo === "string" ? meta.periodTo : undefined,
    totalIncomeReceived: headline.totalIncomeReceived,
    personalAllowance: num(obj(calc.allowancesAndDeductions).personalAllowance),
    totalAllowancesAndDeductions: headline.totalAllowancesAndDeductions,
    totalTaxableIncome: headline.totalTaxableIncome,
    incomeTax: num(it.totalIncomeTaxDue) ?? headline.incomeTaxAmount,
    class2Nics: class2,
    class4Nics: class4,
    totalTaxDeducted: num(tc.totalTaxDeducted),
    totalIncomeTaxAndNicsDue: headline.totalIncomeTaxAndNicsDue,
    incomeSources,
    taxBands,
    errors,
    warnings: messages(msgs.warnings),
    info: messages(msgs.info),
  };
}

/**
 * Can the driver submit a tax return against this calculation? Returns the
 * reason it can't, or null when it can. The API route checks this again
 * on the server before submitting, whatever the app says.
 */
export function taxReturnBlocker(calc: TaxReturnCalculation): string | null {
  if (!calc.ready) return "HMRC is still working out your tax. Try again in a minute.";
  if (calc.errors.length > 0) {
    return "HMRC found problems with this calculation. Fix them before you submit your tax return.";
  }
  if (calc.calculationType && calc.calculationType !== "intent-to-finalise") {
    return "This calculation is not the end-of-year one. Get a new calculation and try again.";
  }
  if (calc.totalIncomeTaxAndNicsDue === undefined) {
    return "HMRC's calculation has no total. Get a new calculation and try again.";
  }
  return null;
}

/** Plain-English versions of the HMRC errors a driver can hit on this journey. */
const PLAIN_ERRORS: Record<string, string> = {
  RULE_FINAL_DECLARATION_TAX_YEAR:
    "You can't submit the tax return for this year until the tax year has ended on 5 April.",
  RULE_FINAL_DECLARATION_RECEIVED:
    "HMRC already has a tax return for this year. To change it, contact HMRC or use software that can amend a return.",
  RULE_FINAL_DECLARATION_IN_PROGRESS:
    "HMRC is already working on a tax return for this year. Wait a few minutes, then check again.",
  RULE_RECENT_SUBMISSIONS_EXIST:
    "Something was sent to HMRC after this calculation was made. Get a new calculation and check it before you submit.",
  RULE_INCOME_SOURCES_CHANGED:
    "Your income sources changed after this calculation was made. Get a new calculation and check it before you submit.",
  RULE_RESIDENCY_CHANGED:
    "Your residency details changed after this calculation was made. Get a new calculation and check it before you submit.",
  RULE_NO_INCOME_SUBMISSIONS_EXIST:
    "HMRC has no income for this year yet. Send your quarterly updates first.",
  RULE_INCOME_SOURCES_INVALID:
    "HMRC couldn't find a valid income source for this year. Check your business details with HMRC.",
  RULE_SUBMISSION_FAILED:
    "HMRC couldn't take your tax return just now. Nothing has been submitted. Try again later.",
  RULE_OUTSIDE_AMENDMENT_WINDOW:
    "It's too late to change this tax year with software. Contact HMRC.",
  RULE_TAX_YEAR_NOT_SUPPORTED: "HMRC doesn't accept this tax year through software.",
  RULE_TAX_YEAR_NOT_ENDED:
    "This tax year hasn't ended yet. You can get the end-of-year calculation from 6 April.",
  RULE_CALCULATION_IN_PROGRESS: "HMRC is already working out a calculation. Wait a minute, then try again.",
  RULE_BUSINESS_VALIDATION_FAILURE:
    "HMRC found a problem with the figures it holds for this year. Check your quarterly updates, then try again.",
  RULE_PREMATURE_FINALISATION: "It's too early to get the end-of-year calculation for this tax year.",
  RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED: "There was nothing to send.",
  MATCHING_RESOURCE_NOT_FOUND: "HMRC couldn't find that calculation. Get a new calculation and try again.",
};

/** Swap HMRC's message for a plain one when we know the code. Keeps code + status. */
export function plainTaxReturnError(err: unknown): unknown {
  if (!(err instanceof HmrcError) || !err.hmrcCode) return err;
  const plain = PLAIN_ERRORS[err.hmrcCode];
  if (!plain) return err;
  return new HmrcError(plain, err.httpStatus, err.hmrcCode, err.detail);
}

// ── Transport ──────────────────────────────────────────────────────────

interface CalcArgs {
  userId: string;
  nino: string;
  taxYear: string;
  calculationId: string;
  client: ClientContext;
  server: ServerContext;
}

function calcPath(args: Pick<CalcArgs, "nino" | "taxYear" | "calculationId">): string {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  return `/individuals/calculations/${encodeURIComponent(args.nino)}/self-assessment/${encodeURIComponent(args.taxYear)}/${encodeURIComponent(args.calculationId)}`;
}

/**
 * Retrieve the calculation for the review screen. HMRC answers 404 while a
 * newly triggered calculation is still running, so 404 becomes ready:false
 * rather than an error.
 */
export async function retrieveTaxReturnCalculation(args: CalcArgs): Promise<TaxReturnCalculation> {
  try {
    const raw = await hmrcCall<unknown>({
      userId: args.userId,
      method: "GET",
      path: calcPath(args),
      apiVersion: CALC_API_VERSION,
      client: args.client,
      server: args.server,
    });
    return summariseTaxReturnCalculation(raw, args.calculationId);
  } catch (err) {
    if (err instanceof HmrcError && err.httpStatus === 404) {
      return {
        ready: false,
        calculationId: args.calculationId,
        taxYear: args.taxYear,
        incomeSources: [],
        taxBands: [],
        errors: [],
        warnings: [],
        info: [],
      };
    }
    throw err;
  }
}

/**
 * Submit the tax return (HMRC: "final declaration") against the calculation
 * the driver agreed to. HMRC replies 204 with no body; we return the
 * X-CorrelationId header so support can trace it.
 */
export async function submitFinalDeclaration(args: CalcArgs): Promise<{ correlationId: string | null }> {
  let correlationId: string | null = null;
  await hmrcCall<unknown>({
    userId: args.userId,
    method: "POST",
    path: `${calcPath(args)}/final-declaration`,
    apiVersion: CALC_API_VERSION,
    client: args.client,
    server: args.server,
    onResponseHeaders: (h) => {
      correlationId = h.get("x-correlationid");
    },
  });
  return { correlationId };
}
