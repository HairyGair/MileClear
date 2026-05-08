// HMRC MTD ITSA — Business Details API.
//
// Returns the list of self-employment / property businesses HMRC has on
// file for a user. Required before any submission work because every
// downstream API is keyed on a businessId — without one we can't tell
// HMRC what trade we're submitting against.
//
// Endpoints:
//   GET /individuals/business/details/{nino}/list
//   GET /individuals/business/details/{nino}/{businessId}
//
// Reference: https://developer.service.hmrc.uk/api-documentation/docs/api/service/business-details-api/1.0

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall } from "./client.js";

export type HmrcBusinessType = "self-employment" | "uk-property" | "foreign-property";

export interface HmrcBusinessSummary {
  typeOfBusiness: HmrcBusinessType;
  businessId: string;
  tradingName?: string;
}

export interface HmrcBusinessListResponse {
  listOfBusinesses: HmrcBusinessSummary[];
}

export interface HmrcBusinessAddress {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface HmrcBusinessDetails {
  businessId: string;
  typeOfBusiness: HmrcBusinessType;
  tradingName?: string;
  // Self-employment specific
  accountingType?: "CASH" | "ACCRUALS";
  commencementDate?: string; // ISO date
  cessationDate?: string;    // ISO date — set when the trade has ended
  businessAddressDetails?: HmrcBusinessAddress;
  // Tax year accounting period (only for self-employment when set)
  firstAccountingPeriodStartDate?: string;
  firstAccountingPeriodEndDate?: string;
  latencyDetails?: {
    latencyEndDate?: string;
    taxYear1?: string;
    latencyIndicator1?: "A" | "Q";
    taxYear2?: string;
    latencyIndicator2?: "A" | "Q";
  };
}

export interface HmrcBusinessDetailsResponse {
  // The Business Details API returns shape varies by business type;
  // for self-employment we get yearOfMigration + businessDetails, but
  // the canonical fields are on the business object itself.
  businessId: string;
  typeOfBusiness: HmrcBusinessType;
  tradingName?: string;
  accountingType?: "CASH" | "ACCRUALS";
  commencementDate?: string;
  cessationDate?: string;
  businessAddressDetails?: HmrcBusinessAddress;
  firstAccountingPeriodStartDate?: string;
  firstAccountingPeriodEndDate?: string;
  latencyDetails?: HmrcBusinessDetails["latencyDetails"];
  yearOfMigration?: string;
}

/**
 * List all self-assessment businesses HMRC has on file for this user.
 * Most gig drivers have one self-employment trade. Some have additional
 * trades (e.g. landlords doing delivery on the side); we return them all
 * and let the caller pick.
 */
export async function listBusinesses(args: {
  userId: string;
  nino: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcBusinessSummary[]> {
  const data = await hmrcCall<HmrcBusinessListResponse>({
    userId: args.userId,
    method: "GET",
    path: `/individuals/business/details/${encodeURIComponent(args.nino)}/list`,
    apiVersion: "1.0",
    client: args.client,
    server: args.server,
  });

  return data.listOfBusinesses ?? [];
}

/**
 * Retrieve the full detail record for one business. Used to confirm the
 * trade matches the user's actual situation before they pick it as the
 * submission target (commencement date, accounting type, address).
 */
export async function retrieveBusiness(args: {
  userId: string;
  nino: string;
  businessId: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcBusinessDetailsResponse> {
  return hmrcCall<HmrcBusinessDetailsResponse>({
    userId: args.userId,
    method: "GET",
    path: `/individuals/business/details/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}`,
    apiVersion: "1.0",
    client: args.client,
    server: args.server,
  });
}

/**
 * Pick the most likely self-employment business when the user has more
 * than one. Strategy: prefer a self-employment trade with a tradingName
 * matching MileClear's expected gig pattern (currently just "first match"
 * — we'll layer matching once we see real data). Returns null if no
 * self-employment trade exists at all.
 */
export function pickPrimarySelfEmployment(
  businesses: HmrcBusinessSummary[]
): HmrcBusinessSummary | null {
  const seBusinesses = businesses.filter((b) => b.typeOfBusiness === "self-employment");
  return seBusinesses[0] ?? null;
}
