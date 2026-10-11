// HMRC Making Tax Digital for Income Tax: the two end-of-year business
// details HMRC wants before a tax return, from Business Details API 2.0.
//
// 1. Accounting type (cash basis or traditional accounting) for the year.
//    Service guide, "Capture and Change Accounting Method": "users/agents must
//    confirm their accounting method for all their relevant self-employment or
//    property income sources for that year before submitting an annual tax
//    return. Software should first show the user what HMRC holds ... In the
//    event the user needs to change the accounting method, software should
//    then call the Update Accounting Type endpoint."
//
// 2. Periods of account. Service guide, "Basis period reform: Capture Period
//    of Account": "software must first ask the customer if they have had a
//    period of account that ended in the relevant tax year ... Only in the
//    instance of the response being true must the software then collect the
//    start and end dates". The OpenAPI spec: "This has to be submitted before
//    final declaration."
//
// Endpoints (Business Details API 2.0, checked against HMRC's OpenAPI 11 Oct 2026):
//   GET /individuals/business/details/{nino}/{businessId}/{taxYear}/accounting-type      200 { accountingType }
//   PUT /individuals/business/details/{nino}/{businessId}/{taxYear}/accounting-type      204, body { accountingType }
//   GET /individuals/business/details/{nino}/{businessId}/{taxYear}/periods-of-account   200 { submittedOn, periodsOfAccount, periodsOfAccountDates? }
//   PUT /individuals/business/details/{nino}/{businessId}/{taxYear}/periods-of-account   204, body { periodsOfAccount, periodsOfAccountDates? }
// accountingType is "CASH" or "ACCRUAL" (singular; the older business record uses "ACCRUALS").
// Minimum tax year 2025-26 (2024-25 in the sandbox).
//
// Reference: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/business-details-api/2.0
// Research notes: docs/hmrc-end-of-year-oct2026.md

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall, HmrcError } from "./client.js";
import { isValidHmrcTaxYear } from "./selfEmployment.js";

const BD_API_VERSION = "2.0";

export type HmrcAccountingType = "CASH" | "ACCRUAL";

export interface PeriodOfAccountDates {
  startDate: string;
  endDate: string;
}

export interface PeriodsOfAccountBody {
  periodsOfAccount: boolean;
  periodsOfAccountDates?: PeriodOfAccountDates[];
}

export interface PeriodsOfAccountHeld extends PeriodsOfAccountBody {
  submittedOn: string;
}

/** Old business record says "ACCRUALS", the per-year endpoint says "ACCRUAL". Treat both as traditional. */
export function normaliseAccountingType(v: unknown): HmrcAccountingType | null {
  if (v === "CASH") return "CASH";
  if (v === "ACCRUAL" || v === "ACCRUALS") return "ACCRUAL";
  return null;
}

// ── Periods of account: the driver's answer to HMRC's body ─────────────

/**
 * The choices the app offers. Most drivers keep accounts for the tax year
 * itself; HMRC treats a year ending 31 March as lining up with the tax year
 * too. Anything else is "custom" with the driver's own dates.
 */
export type PeriodsOfAccountChoice = "tax_year" | "to_31_march" | "custom" | "none";

export interface PeriodsOfAccountPlan {
  body: PeriodsOfAccountBody | null;
  /** Why the answer can't be sent, in plain English. Null when it can. */
  error: string | null;
  /** Things the driver should know before sending. */
  warnings: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function buildPeriodsOfAccount(args: {
  taxYear: string;
  choice: PeriodsOfAccountChoice;
  startDate?: string;
  endDate?: string;
}): PeriodsOfAccountPlan {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    return { body: null, error: "That tax year isn't valid.", warnings: [] };
  }
  const y = parseInt(args.taxYear.slice(0, 4), 10);
  const tyStart = `${y}-04-06`;
  const tyEnd = `${y + 1}-04-05`;

  switch (args.choice) {
    case "tax_year":
      return {
        body: { periodsOfAccount: true, periodsOfAccountDates: [{ startDate: tyStart, endDate: tyEnd }] },
        error: null,
        warnings: [],
      };
    case "to_31_march":
      // HMRC: an accounting date of 31 March to 4 April is treated as the tax year end.
      return {
        body: {
          periodsOfAccount: true,
          periodsOfAccountDates: [{ startDate: `${y}-04-01`, endDate: `${y + 1}-03-31` }],
        },
        error: null,
        warnings: [],
      };
    case "none":
      return {
        body: { periodsOfAccount: false },
        error: null,
        warnings: [
          "If no accounting period ended in this tax year, your profit may need working out differently. MileClear's figures cover 6 April to 5 April. Check with an accountant or HMRC before you submit your tax return.",
        ],
      };
    case "custom": {
      const { startDate, endDate } = args;
      if (!startDate || !endDate || !isRealDate(startDate) || !isRealDate(endDate)) {
        return { body: null, error: "Enter a start date and an end date.", warnings: [] };
      }
      if (endDate < startDate) {
        return { body: null, error: "The end date must be after the start date.", warnings: [] };
      }
      // HMRC rules RULE_END_DATE and RULE_START_DATE.
      if (endDate < tyStart || endDate > tyEnd) {
        return {
          body: null,
          error: `The end date must be between 6 April ${y} and 5 April ${y + 1}. If your accounting period ended outside that, choose "No accounting period ended in this tax year".`,
          warnings: [],
        };
      }
      if (startDate > tyEnd) {
        return { body: null, error: `The start date must be on or before 5 April ${y + 1}.`, warnings: [] };
      }
      const warnings: string[] = [];
      const lateAccountingDate = endDate >= `${y + 1}-03-31` && endDate <= tyEnd;
      const alignedStart = startDate === tyStart || startDate === `${y}-04-01`;
      if (!(lateAccountingDate && alignedStart)) {
        warnings.push(
          "Your accounting period doesn't match the tax year. MileClear's figures cover 6 April to 5 April, and your profit may need adjusting. Check with an accountant or HMRC before you submit your tax return."
        );
      }
      return {
        body: { periodsOfAccount: true, periodsOfAccountDates: [{ startDate, endDate }] },
        error: null,
        warnings,
      };
    }
    default:
      return { body: null, error: "Choose an answer.", warnings: [] };
  }
}

/** Turn what HMRC holds back into one of the app's choices, for showing it. */
export function describeHeldPeriods(
  held: PeriodsOfAccountHeld | null,
  taxYear: string
): { choice: PeriodsOfAccountChoice; startDate?: string; endDate?: string } | null {
  if (!held) return null;
  if (!held.periodsOfAccount) return { choice: "none" };
  const d = held.periodsOfAccountDates?.[0];
  if (!d) return null;
  const y = parseInt(taxYear.slice(0, 4), 10);
  if ((held.periodsOfAccountDates?.length ?? 0) === 1) {
    if (d.startDate === `${y}-04-06` && d.endDate === `${y + 1}-04-05`) return { choice: "tax_year" };
    if (d.startDate === `${y}-04-01` && d.endDate === `${y + 1}-03-31`) return { choice: "to_31_march" };
  }
  return { choice: "custom", startDate: d.startDate, endDate: d.endDate };
}

// ── Transport ──────────────────────────────────────────────────────────

interface Args {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;
  client: ClientContext;
  server: ServerContext;
}

function basePath(args: Pick<Args, "nino" | "businessId" | "taxYear">): string {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  return `/individuals/business/details/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/${encodeURIComponent(args.taxYear)}`;
}

/** What HMRC holds for the year. Null when HMRC has nothing (404). */
export async function retrieveAccountingType(args: Args): Promise<HmrcAccountingType | null> {
  try {
    const data = await hmrcCall<{ accountingType?: string } | undefined>({
      userId: args.userId,
      method: "GET",
      path: `${basePath(args)}/accounting-type`,
      apiVersion: BD_API_VERSION,
      client: args.client,
      server: args.server,
    });
    return normaliseAccountingType(data?.accountingType);
  } catch (err) {
    if (err instanceof HmrcError && err.httpStatus === 404) return null;
    throw err;
  }
}

export async function updateAccountingType(args: Args & { accountingType: HmrcAccountingType }): Promise<void> {
  if (args.accountingType !== "CASH" && args.accountingType !== "ACCRUAL") {
    throw new Error(`Invalid accountingType: ${String(args.accountingType)}`);
  }
  await hmrcCall<unknown>({
    userId: args.userId,
    method: "PUT",
    path: `${basePath(args)}/accounting-type`,
    apiVersion: BD_API_VERSION,
    body: { accountingType: args.accountingType },
    client: args.client,
    server: args.server,
    audit: { operation: "accounting_type_update", taxYear: args.taxYear, businessId: args.businessId },
  });
}

/** What HMRC holds for the year. Null when nothing has been sent (404). */
export async function retrievePeriodsOfAccount(args: Args): Promise<PeriodsOfAccountHeld | null> {
  try {
    const data = await hmrcCall<PeriodsOfAccountHeld | undefined>({
      userId: args.userId,
      method: "GET",
      path: `${basePath(args)}/periods-of-account`,
      apiVersion: BD_API_VERSION,
      client: args.client,
      server: args.server,
    });
    return data ?? null;
  } catch (err) {
    if (err instanceof HmrcError && err.httpStatus === 404) return null;
    throw err;
  }
}

export async function submitPeriodsOfAccount(args: Args & { body: PeriodsOfAccountBody }): Promise<void> {
  const b = args.body;
  // HMRC rule RULE_PERIODS_OF_ACCOUNT: dates only, and always, when true.
  if (b.periodsOfAccount && !(b.periodsOfAccountDates && b.periodsOfAccountDates.length > 0)) {
    throw new Error("periodsOfAccountDates are required when periodsOfAccount is true");
  }
  if (!b.periodsOfAccount && b.periodsOfAccountDates !== undefined) {
    throw new Error("periodsOfAccountDates must be left out when periodsOfAccount is false");
  }
  await hmrcCall<unknown>({
    userId: args.userId,
    method: "PUT",
    path: `${basePath(args)}/periods-of-account`,
    apiVersion: BD_API_VERSION,
    body: b,
    client: args.client,
    server: args.server,
    audit: { operation: "periods_of_account_submit", taxYear: args.taxYear, businessId: args.businessId },
  });
}
