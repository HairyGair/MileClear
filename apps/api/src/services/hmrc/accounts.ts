// HMRC MTD ITSA — Self Assessment Accounts API (balance).
//
// "What you owe HMRC": overdue, due now and not yet due, with their dates.
//
// Endpoint (Self Assessment Accounts API v4.0):
//   GET /accounts/self-assessment/{nino}/balance-and-transactions?onlyOpenItems=true
//   Scope: read:self-assessment (already requested at connect, so no reconnect).
//
// HMRC only returns charges for tax years since the driver joined Making Tax
// Digital. Earlier years stay in their HMRC online account, so the screen
// must say so rather than present this as the whole picture.
//
// Amounts arrive in pounds (2dp, may be negative); we hand pence to the app.
//
// Reference: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-assessment-accounts-api/4.0

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall, HmrcError } from "./client.js";
import { poundsToPence } from "./periodMapping.js";

/** The balanceDetails fields we use. HMRC sends more (coding out, standovers). */
export interface RawBalanceDetails {
  payableAmount?: number;
  payableDueDate?: string;
  pendingChargeDueAmount?: number;
  pendingChargeDueDate?: string;
  overdueAmount?: number;
  earliestPaymentDateOverdue?: string;
  totalBalance?: number;
  availableCredit?: number;
}

export interface HmrcBalanceResponse {
  balanceDetails: RawBalanceDetails;
}

export interface HmrcBalance {
  /** Past its due date. */
  overduePence: number;
  /** The oldest overdue charge's due date, when anything is overdue. */
  overdueSince: string | null;
  /** Due now (payable). */
  dueNowPence: number;
  dueNowDate: string | null;
  /** Charged but not yet due. */
  comingUpPence: number;
  comingUpDate: string | null;
  /** Everything HMRC says is outstanding (can be negative when in credit). */
  totalPence: number;
  /** Credit the driver can use or reclaim. */
  creditPence: number;
  /** HMRC holds no charges yet (new to Making Tax Digital). */
  nothingYet: boolean;
}

/** Pence, never negative: a negative due/overdue figure means nothing owed. */
function owed(pounds: number | undefined): number {
  if (typeof pounds !== "number" || !Number.isFinite(pounds) || pounds <= 0) return 0;
  return poundsToPence(pounds);
}

export function summariseBalance(details: RawBalanceDetails | undefined): HmrcBalance {
  const d = details ?? {};
  const overduePence = owed(d.overdueAmount);
  const dueNowPence = owed(d.payableAmount);
  const comingUpPence = owed(d.pendingChargeDueAmount);
  const total = d.totalBalance;
  return {
    overduePence,
    overdueSince: overduePence > 0 ? d.earliestPaymentDateOverdue ?? null : null,
    dueNowPence,
    dueNowDate: dueNowPence > 0 ? d.payableDueDate ?? null : null,
    comingUpPence,
    comingUpDate: comingUpPence > 0 ? d.pendingChargeDueDate ?? null : null,
    totalPence: typeof total === "number" && Number.isFinite(total) ? poundsToPence(total) : 0,
    creditPence: owed(d.availableCredit),
    nothingYet: false,
  };
}

const NOTHING_YET: HmrcBalance = {
  overduePence: 0,
  overdueSince: null,
  dueNowPence: 0,
  dueNowDate: null,
  comingUpPence: 0,
  comingUpDate: null,
  totalPence: 0,
  creditPence: 0,
  nothingYet: true,
};

export async function fetchBalance(args: {
  userId: string;
  nino: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcBalance> {
  try {
    const data = await hmrcCall<HmrcBalanceResponse>({
      userId: args.userId,
      method: "GET",
      path: `/accounts/self-assessment/${encodeURIComponent(args.nino)}/balance-and-transactions`,
      apiVersion: "4.0",
      // Unpaid charges only. With onlyOpenItems=false HMRC insists on a date
      // range or document number; we want the current position, not history.
      query: { onlyOpenItems: "true" },
      client: args.client,
      server: args.server,
    });
    return summariseBalance(data.balanceDetails);
  } catch (err) {
    // 404 NOT_FOUND = HMRC has no account data for this NINO yet, which is
    // normal for someone who has only just joined. Not an error to the driver.
    if (err instanceof HmrcError && err.httpStatus === 404) return NOTHING_YET;
    throw err;
  }
}
