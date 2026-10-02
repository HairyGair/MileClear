// Response shapes for the Ops page endpoints.

export type { HealthData } from "@/components/admin/legacy";

export interface RoutingHealthData {
  config: { graphhopperUrl: string; googleConfigured: boolean };
  graphhopper: { reachable: boolean | null; latencyMs: number | null; error: string | null };
  cache: { rowCount: number; bySource: Record<string, number>; totalHits: number };
  last24h: {
    routesComputed: number;
    routesUnavailable: number;
    bySource: Record<string, number>;
    fallbackRate: number;
  };
  generatedAt: string;
}

export interface AppleWebhookLog {
  id: string;
  environment?: string | null;
  notificationType: string | null;
  subtype: string | null;
  originalTransactionId: string | null;
  userId: string | null;
  status: string;
  errorMessage: string | null;
  receivedAt: string;
  isGhost?: boolean;
}

/** /admin/apple-webhooks answers with its body directly (no { data } wrapper
 *  around the whole thing; `data` is the rows). */
export interface AppleWebhookResponse {
  data: AppleWebhookLog[];
  total: number;
  totalPages: number;
  last24h: Record<string, number>;
  ghostCount?: number;
}

export interface JobRunLog {
  id: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  errorMessage: string | null;
  metadata: string | null;
}

export interface JobRunResponse {
  data: JobRunLog[];
  total: number;
  totalPages: number;
  latestPerJob: Array<{
    jobName: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
  }>;
}

export interface OrphanReprocessResult {
  txn: string;
  receivedAt: string;
  outcome: "linked" | "still_no_user" | "no_appAccountToken" | "fetch_failed" | "conflict" | "no_txn_id";
  userId?: string;
  userEmail?: string;
  detail?: string;
}

export interface AlertEvent {
  id: string;
  type: string;
  userId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user?: { email: string; displayName: string | null } | null;
}

/** Status of a webhook or a job run, as a badge tone. */
export function runTone(status: string): "good" | "info" | "warn" | "bad" {
  if (status === "success") return "good";
  if (status === "running") return "info";
  if (status === "unhandled") return "warn";
  return "bad";
}
