// HMRC submissions admin view (Oct 2026). Registered inside adminRoutes, so
// the auth + admin hooks already apply.
//
//   GET /admin/hmrc/submissions?days=30&environment=all|sandbox|production&result=all|ok|error
//
// Every quarterly update, amendment and calculation trigger, from the
// hmrc.submission rows the HMRC client writes (services/hmrc/audit.ts): the
// driver (id + display name, never email or NINO), tax year, period, HMRC
// environment, result (ok or HMRC's error code), HMRC's correlation id and
// time. Rows written before the trail existed (hmrc.period_submitted and
// friends) are shown too, marked "earlier log", with what they recorded.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HMRC_SUBMISSION_EVENT } from "../../services/hmrc/audit.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 500;

/** Success events the routes logged before hmrc.submission existed. */
const LEGACY_TYPES: Record<string, string> = {
  "hmrc.period_submitted": "period_submit",
  "hmrc.period_amended": "period_amend",
  "hmrc.calculation_triggered": "calculation_trigger",
  "hmrc.bsas_triggered": "bsas_trigger",
};

export interface AdminHmrcSubmissionRow {
  id: string;
  createdAt: string;
  userId: string | null;
  displayName: string | null;
  operation: string;
  taxYear: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  environment: "sandbox" | "production" | null;
  ok: boolean;
  httpStatus: number | null;
  hmrcCode: string | null;
  correlationId: string | null;
  appVersion: string | null;
  source: "trail" | "earlier_log";
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** One app_event as a table row. Pure, exported for tests. */
export function toSubmissionRow(e: {
  id: string;
  type: string;
  userId: string | null;
  metadata: unknown;
  createdAt: Date;
}): AdminHmrcSubmissionRow | null {
  const m = (e.metadata && typeof e.metadata === "object" ? e.metadata : {}) as Record<string, unknown>;
  const base = {
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    userId: e.userId,
    displayName: null,
  };
  if (e.type === HMRC_SUBMISSION_EVENT) {
    const env = m.environment === "production" || m.environment === "sandbox" ? m.environment : null;
    return {
      ...base,
      operation: str(m.operation) ?? "unknown",
      taxYear: str(m.taxYear),
      periodStart: str(m.periodStart),
      periodEnd: str(m.periodEnd),
      environment: env,
      ok: m.ok === true,
      httpStatus: typeof m.httpStatus === "number" ? m.httpStatus : null,
      hmrcCode: str(m.hmrcCode),
      correlationId: str(m.correlationId),
      appVersion: str(m.appVersion),
      source: "trail",
    };
  }
  const op = LEGACY_TYPES[e.type];
  if (!op) return null;
  return {
    ...base,
    operation: op,
    taxYear: str(m.taxYear),
    periodStart: null,
    periodEnd: null,
    environment: null,
    ok: true,
    httpStatus: null,
    hmrcCode: null,
    correlationId: null,
    appVersion: null,
    source: "earlier_log",
  };
}

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(730).default(90),
  environment: z.enum(["all", "sandbox", "production"]).default("all"),
  result: z.enum(["all", "ok", "error"]).default("all"),
});

export async function adminHmrcRoutes(app: FastifyInstance): Promise<void> {
  app.get("/hmrc/submissions", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    const { days, environment, result } = parsed.data;
    const since = new Date(Date.now() - days * DAY_MS);

    const events = await prisma.appEvent.findMany({
      where: {
        type: { in: [HMRC_SUBMISSION_EVENT, ...Object.keys(LEGACY_TYPES)] },
        createdAt: { gte: since },
      },
      select: { id: true, type: true, userId: true, metadata: true, createdAt: true },
      take: 5000,
    });

    // The routes still log the old success events alongside the new trail, so
    // only show an old one when it predates the first trail row.
    const firstTrail = events
      .filter((e) => e.type === HMRC_SUBMISSION_EVENT)
      .reduce<number | null>((min, e) => (min === null || e.createdAt.getTime() < min ? e.createdAt.getTime() : min), null);

    let rows = events
      .filter((e) => e.type === HMRC_SUBMISSION_EVENT || firstTrail === null || e.createdAt.getTime() < firstTrail)
      .map(toSubmissionRow)
      .filter((r): r is AdminHmrcSubmissionRow => r !== null);

    if (environment !== "all") rows = rows.filter((r) => r.environment === environment);
    if (result === "ok") rows = rows.filter((r) => r.ok);
    if (result === "error") rows = rows.filter((r) => !r.ok);

    // Sort in JS: ordering a query that selects JSON metadata can exceed
    // MySQL's sort buffer on prod.
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const counts = {
      total: rows.length,
      ok: rows.filter((r) => r.ok).length,
      failed: rows.filter((r) => !r.ok).length,
      production: rows.filter((r) => r.environment === "production").length,
      sandbox: rows.filter((r) => r.environment === "sandbox").length,
      drivers: new Set(rows.map((r) => r.userId).filter(Boolean)).size,
    };

    rows = rows.slice(0, MAX_ROWS);
    const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.displayName]));
    for (const r of rows) r.displayName = r.userId ? names.get(r.userId) ?? null : null;

    return reply.send({
      data: {
        generatedAt: new Date().toISOString(),
        days,
        counts,
        truncated: counts.total > rows.length,
        items: rows,
      },
    });
  });
}
