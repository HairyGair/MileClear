import { apiRequest } from "./index";
import type { ReconciliationSummary } from "@mileclear/shared";

export function fetchHmrcReconciliation(taxYear: string) {
  return apiRequest<{ data: ReconciliationSummary }>(
    `/hmrc-reconciliation?taxYear=${encodeURIComponent(taxYear)}`
  );
}

export function saveHmrcReconciliation(input: {
  taxYear: string;
  platform: string;
  hmrcReportedPence: number;
  notes?: string;
}) {
  return apiRequest<{ data: ReconciliationSummary }>("/hmrc-reconciliation", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteHmrcReconciliation(taxYear: string, platform: string) {
  return apiRequest<{ data: ReconciliationSummary }>(
    `/hmrc-reconciliation/${encodeURIComponent(platform)}?taxYear=${encodeURIComponent(taxYear)}`,
    { method: "DELETE" }
  );
}
