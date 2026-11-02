import { apiRequest } from "./index";
import type { QuarterlySummary } from "../tax/quarterlyCard";

/** GET /hmrc/summary: the quarters for the Tax tab card. Never calls HMRC. */
export function fetchHmrcSummary() {
  return apiRequest<{ data: QuarterlySummary }>("/hmrc/summary");
}
