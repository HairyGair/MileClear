import { apiRequest } from "./index";
import { downloadAndShareExport } from "./exports";
import type { CazChargeItem, TicketDefenderLookup, TicketNoticeType } from "@mileclear/shared";

/** Ticket defender (Pro): what MileClear recorded around a notice's time. */
export interface TicketLookupParams {
  at: string;
  lat?: number;
  lng?: number;
  postcode?: string;
  locationLabel?: string;
  vehicleId?: string;
}

export interface TicketPackParams extends TicketLookupParams {
  noticeType?: TicketNoticeType;
  reference?: string;
  issuer?: string;
}

export function lookupTicketRecord(params: TicketLookupParams) {
  return apiRequest<{ data: TicketDefenderLookup }>("/ticket-defender/lookup", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/** Query string for the PDF, leaving out empty fields. Exported for tests. */
export function packQuery(params: TicketPackParams): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

/** Downloads the PDF record and opens the share sheet, as Tax Exports does. */
export function downloadTicketPack(params: TicketPackParams) {
  const stamp = params.at.slice(0, 16).replace(/[-:T]/g, "");
  return downloadAndShareExport(
    `/ticket-defender/pack?${packQuery(params)}`,
    `mileclear-journey-record-${stamp}.pdf`,
    "application/pdf"
  );
}

export function fetchCazCharges() {
  return apiRequest<{ data: CazChargeItem[] }>("/ticket-defender/caz-charges");
}

export function setCazChargePaid(tripId: string, zoneId: string, paid: boolean) {
  return apiRequest<{ data: { key: string; paid: boolean } }>(
    `/ticket-defender/caz-charges/${encodeURIComponent(tripId)}/paid`,
    { method: "POST", body: JSON.stringify({ zoneId, paid }) }
  );
}
