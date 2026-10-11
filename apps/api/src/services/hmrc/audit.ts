// The HMRC submission trail and the production error alert (Oct 2026).
//
// Every call that changes something at HMRC (a quarterly update, an
// amendment, a calculation or adjustable-summary trigger) is recorded once
// as an `hmrc.submission` app_event, whether HMRC said yes or no. The admin
// view (GET /admin/hmrc/submissions) reads only these rows, so it shows who
// sent what, for which tax year and period, in which HMRC environment, what
// HMRC answered and HMRC's correlation id (the reference HMRC support ask for).
//
// Never a NINO: the path is redacted before it is stored, and nothing here
// takes the NINO as an input. Discord gets even less: no path segments that
// identify anyone, no email, no NINO, only the MileClear user id.

import { logEvent } from "../appEvents.js";
import { postFounderAlert } from "../discord.js";
import { redactNinoInPath } from "../../lib/redactUrl.js";
import type { HmrcEnvironment } from "./config.js";

export const HMRC_SUBMISSION_EVENT = "hmrc.submission";

export type HmrcAuditOperation =
  | "period_submit"
  | "period_amend"
  | "calculation_trigger"
  | "bsas_trigger"
  | "annual_submit"
  | "annual_delete"
  | "final_declaration";

/** What a write call tells the trail about itself. No personal data. */
export interface HmrcAudit {
  operation: HmrcAuditOperation;
  taxYear?: string;
  /** ISO dates of the period the update covers (cumulative: 6 April to the quarter end). */
  periodStart?: string;
  periodEnd?: string;
  businessId?: string;
}

export interface HmrcSubmissionRecord extends HmrcAudit {
  environment: HmrcEnvironment;
  ok: boolean;
  httpStatus: number;
  hmrcCode: string | null;
  correlationId: string | null;
  path: string;
  appVersion: string | null;
}

/** Record one write call for the admin view. The path is NINO-redacted here as well as by the caller. */
export function recordHmrcSubmission(userId: string, rec: HmrcSubmissionRecord): void {
  logEvent(HMRC_SUBMISSION_EVENT, userId, { ...rec, path: redactNinoInPath(rec.path) });
}

/**
 * Whether an HMRC error is worth a Discord alert. Production only: sandbox
 * errors are our own testing. A 404 on a read is HMRC saying "nothing there
 * yet" (no update sent for that year), which the screens expect.
 */
export function shouldAlertHmrcError(args: {
  environment: HmrcEnvironment;
  method: string;
  httpStatus: number;
}): boolean {
  if (args.environment !== "production") return false;
  if (args.method === "GET" && args.httpStatus === 404) return false;
  return true;
}

/**
 * The endpoint as Discord sees it: NINO redacted, and any other long id
 * (business id, calculation id) replaced, so the alert says which kind of
 * call failed without naming whose.
 */
export function endpointLabel(path: string): string {
  return redactNinoInPath(path)
    .split("/")
    .map((seg) => (/\d/.test(seg) && seg.length >= 10 ? ":id" : seg))
    .join("/");
}

// One alert per (code, endpoint) per 10 minutes: a broken HMRC endpoint
// otherwise posts once for every driver who opens the screen.
const ALERT_WINDOW_MS = 10 * 60 * 1000;
const lastAlertAt = new Map<string, number>();

export function alertThrottleKey(hmrcCode: string | null, httpStatus: number, path: string): string {
  return `${hmrcCode ?? `HTTP_${httpStatus}`} ${endpointLabel(path)}`;
}

/** Post the alert unless the same one went out in the last 10 minutes. Never throws. */
export function alertHmrcError(args: {
  userId: string;
  environment: HmrcEnvironment;
  method: string;
  path: string;
  httpStatus: number;
  hmrcCode: string | null;
  correlationId: string | null;
  operation?: HmrcAuditOperation;
  now?: number;
}): boolean {
  if (!shouldAlertHmrcError(args)) return false;
  const key = alertThrottleKey(args.hmrcCode, args.httpStatus, args.path);
  const now = args.now ?? Date.now();
  const last = lastAlertAt.get(key);
  if (last !== undefined && now - last < ALERT_WINDOW_MS) return false;
  lastAlertAt.set(key, now);

  const lines = [
    `**${args.hmrcCode ?? "No HMRC code"}** (HTTP ${args.httpStatus})`,
    `${args.method} ${endpointLabel(args.path)}`,
    args.operation ? `Operation: ${args.operation}` : null,
    `Correlation id: ${args.correlationId ?? "none"}`,
    "Admin: /dashboard/admin/hmrc",
  ].filter(Boolean);
  void postFounderAlert({
    severity: args.httpStatus >= 500 ? "critical" : "warning",
    title: "HMRC error in production",
    detail: lines.join("\n"),
    userId: args.userId,
  }).catch(() => {});
  return true;
}

/** Test-only: forget the throttle. */
export function resetHmrcAlertThrottle(): void {
  lastAlertAt.clear();
}
