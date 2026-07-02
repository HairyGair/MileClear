// HMRC MTD ITSA — Obligations API.
//
// "What's due when" for a given user. Drives the "Q3 due in 14 days"
// countdown on the dashboard once we surface this in mobile UI (Phase 3).
//
// Endpoint (Obligations API v3.0): GET /obligations/details/{nino}/income-and-expenditure
//   Optional query: fromDate, toDate, status (Open|Fulfilled), typeOfBusiness, businessId
//   (The old /individuals/business/obligations/{nino} path was retired.)
//
// The shape we care about for self-employment quarterly submissions:
//   - status="Open" + type="ITSP" → unsubmitted quarterly periods
//   - dueDate < now → overdue
//   - dueDate < now+14d → "due soon"
//
// Reference: https://developer.service.hmrc.uk/api-documentation/docs/api/service/obligations-api/3.0

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall } from "./client.js";

export interface HmrcObligation {
  start: string;        // ISO date (period start)
  end: string;          // ISO date (period end)
  due: string;          // ISO date (when the submission is due)
  periodKey: string;    // HMRC's identifier for the period
  status: "Open" | "Fulfilled";
  received?: string;    // ISO date (when HMRC received the submission), only on Fulfilled
}

// Raw obligation detail as returned by Obligations API v3.0. The field
// names (periodStartDate/periodEndDate/dueDate/receivedDate) and the
// lowercase status differ from our normalised HmrcObligation, so we map
// before normalising.
interface RawObligationDetail {
  periodStartDate: string;
  periodEndDate: string;
  dueDate: string;
  status: string; // "open" | "fulfilled" (lowercase in v3.0)
  periodKey?: string;
  receivedDate?: string;
}

export interface HmrcObligationsResponse {
  obligations: Array<{
    typeOfBusiness?: string;
    businessId?: string;
    obligationDetails: RawObligationDetail[];
  }>;
}

export interface NormalisedObligation extends HmrcObligation {
  daysUntilDue: number;        // negative = overdue
  isOverdue: boolean;
  isDueSoon: boolean;          // < 14 days
  isFulfilled: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function normaliseObligation(
  raw: HmrcObligation,
  now: Date = new Date()
): NormalisedObligation {
  const due = new Date(raw.due).getTime();
  const daysUntilDue = Math.ceil((due - now.getTime()) / DAY_MS);
  return {
    ...raw,
    daysUntilDue,
    isOverdue: daysUntilDue < 0 && raw.status !== "Fulfilled",
    isDueSoon: daysUntilDue >= 0 && daysUntilDue <= 14 && raw.status !== "Fulfilled",
    isFulfilled: raw.status === "Fulfilled",
  };
}

export async function fetchObligations(args: {
  userId: string;
  nino: string;
  businessId?: string;
  from?: string;
  to?: string;
  status?: "Open" | "Fulfilled";
  client: ClientContext;
  server: ServerContext;
}): Promise<NormalisedObligation[]> {
  // Obligations API v3.0: periodic (quarterly) update obligations live under
  // the income-and-expenditure endpoint. Optional query narrows by
  // businessId / date range / status. (HMRC's response groups by
  // typeOfBusiness + businessId; each detail uses periodStartDate/etc. and a
  // lowercase status, which we map to our normalised shape below.)
  const path = `/obligations/details/${encodeURIComponent(args.nino)}/income-and-expenditure`;

  const data = await hmrcCall<HmrcObligationsResponse>({
    userId: args.userId,
    method: "GET",
    path,
    apiVersion: "3.0",
    query: {
      fromDate: args.from,
      toDate: args.to,
      status: args.status,
      businessId: args.businessId,
    },
    client: args.client,
    server: args.server,
  });

  const flat: NormalisedObligation[] = [];
  for (const group of data.obligations ?? []) {
    for (const detail of group.obligationDetails ?? []) {
      flat.push(
        normaliseObligation({
          start: detail.periodStartDate,
          end: detail.periodEndDate,
          due: detail.dueDate,
          periodKey: detail.periodKey ?? "",
          status: /fulfilled/i.test(detail.status) ? "Fulfilled" : "Open",
          received: detail.receivedDate,
        })
      );
    }
  }
  // Newest first — drives the "next due" UI naturally.
  flat.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  return flat;
}
