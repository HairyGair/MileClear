import type { TaxOverview } from "@mileclear/shared";
import { apiRequest } from "./index";

/**
 * GET /tax/overview: everything the Tax tab and the Home tax line show.
 * `fresh` skips the server's 30 second cache (pull to refresh). `asOf`
 * (YYYY-MM-DD) is honoured for admins only, to test the February lead.
 */
export function fetchTaxOverview(opts: { fresh?: boolean; asOf?: string } = {}) {
  const q: string[] = [];
  if (opts.fresh) q.push("fresh=1");
  if (opts.asOf) q.push(`asOf=${encodeURIComponent(opts.asOf)}`);
  return apiRequest<{ data: TaxOverview }>(`/tax/overview${q.length ? `?${q.join("&")}` : ""}`);
}
