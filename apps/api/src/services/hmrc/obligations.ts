// HMRC MTD ITSA — Obligations API.
//
// "What's due when" for a given user. Drives the "Q3 due in 14 days"
// countdown on the dashboard once we surface this in mobile UI (Phase 3).
//
// Endpoint: GET /individuals/business/obligations/{nino}/{businessId}
//   Optional query: from, to, status (Open|Fulfilled), type (CRYSTALLISATION|EOPS|ITSP)
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

export interface HmrcObligationsResponse {
  obligations: Array<{
    identification?: {
      incomeSourceType?: string;
      referenceType?: string;
      referenceNumber?: string;
    };
    obligationDetails: HmrcObligation[];
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
  // Path differs slightly when a businessId is supplied — without it, we
  // get all of the user's obligations across every income source.
  const path = args.businessId
    ? `/individuals/business/obligations/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}`
    : `/individuals/business/obligations/${encodeURIComponent(args.nino)}`;

  const data = await hmrcCall<HmrcObligationsResponse>({
    userId: args.userId,
    method: "GET",
    path,
    apiVersion: "3.0",
    query: {
      from: args.from,
      to: args.to,
      status: args.status,
    },
    client: args.client,
    server: args.server,
  });

  const flat: NormalisedObligation[] = [];
  for (const group of data.obligations ?? []) {
    for (const detail of group.obligationDetails ?? []) {
      flat.push(normaliseObligation(detail));
    }
  }
  // Newest first — drives the "next due" UI naturally.
  flat.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  return flat;
}
