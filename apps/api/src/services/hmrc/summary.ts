// GET /hmrc/summary: what the Tax tab's "Quarterly updates" card shows.
//
// The Tax tab opens often, and every call to HMRC carries the driver's real
// phone in the fraud-prevention headers, so this does NOT call HMRC. It reads
// what HMRC last showed this driver (hmrc.obligations_seen, written whenever
// the quarterly updates screen loads them) and the updates MileClear has sent
// since (hmrc.submission, ok), the same sources the deadline reminders use.
// A quarter HMRC still shows Open but MileClear has sent an update covering
// is reported Fulfilled, so the card is right the moment an update is sent.
//
// Only events from the current connection count, and a snapshot tagged with
// the other HMRC service (test vs live) is ignored, so old test dates are not
// read back as live ones. `seenAt` says how old HMRC's dates are.

import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  asObligations,
  latestObligations,
  taxYearOfDate,
  type OkSubmission,
  type SeenObligation,
} from "../../jobs/mtdDeadlineReminders.js";
import { HMRC_SUBMISSION_EVENT } from "./audit.js";
import { MTD_OBLIGATIONS_SEEN_EVENT } from "./obligations.js";

export interface QuarterSummary {
  start: string;
  end: string;
  due: string;
  status: "Open" | "Fulfilled";
}

export interface MtdSummary {
  /** The tax year the quarters belong to, "2026-27". Null when none are known. */
  taxYear: string | null;
  /** Oldest first. Empty until the driver has opened the quarterly updates screen once. */
  quarters: QuarterSummary[];
  /** When HMRC's dates were last loaded (ISO), so the app can say how old they are. */
  seenAt: string | null;
}

/** One tax year of quarters, with sent updates applied. Pure. */
export function buildMtdSummary(args: {
  snapshots: Array<{ obligations: SeenObligation[] }>;
  okSubmissions: OkSubmission[];
  todayIso: string;
  /** createdAt of the newest snapshot. */
  seenAt?: Date | null;
}): MtdSummary {
  const all = latestObligations(args.snapshots);
  if (all.length === 0) return { taxYear: null, quarters: [], seenAt: null };

  // The year that is running; if HMRC has shown nothing for it, the newest.
  const current = taxYearOfDate(args.todayIso);
  const years = new Set(all.map((o) => taxYearOfDate(o.start.slice(0, 10))));
  const taxYear = years.has(current) ? current : [...years].sort().at(-1)!;

  const quarters = all
    .filter((o) => taxYearOfDate(o.start.slice(0, 10)) === taxYear)
    .map((o): QuarterSummary => {
      const end = o.end.slice(0, 10);
      const covered = args.okSubmissions.some(
        (s) => s.taxYear === taxYear && s.periodEnd.slice(0, 10) >= end
      );
      return {
        start: o.start.slice(0, 10),
        end,
        due: o.due.slice(0, 10),
        status: o.status === "Fulfilled" || covered ? "Fulfilled" : "Open",
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  return { taxYear, quarters, seenAt: args.seenAt ? args.seenAt.toISOString() : null };
}

const LOOKBACK_MS = 400 * 24 * 60 * 60 * 1000;
/** Newest snapshots and submissions read. Each load of the quarterly screen writes one. */
const MAX_SNAPSHOTS = 20;
const MAX_SUBMISSIONS = 60;

/** A snapshot with an environment tag must match; older ones have none and rely on the connection date. */
export function snapshotMatches(metadata: unknown, environment: "sandbox" | "production"): boolean {
  const env = (metadata as { environment?: unknown } | null)?.environment;
  return env == null || env === environment;
}

export async function loadMtdSummary(args: {
  userId: string;
  environment: "sandbox" | "production";
  /** Only events from this connection onwards count (an older one may be another service). */
  connectedAt: Date;
  todayIso: string;
  now?: Date;
}): Promise<MtdSummary> {
  const lookback = new Date((args.now ?? new Date()).getTime() - LOOKBACK_MS);
  const since = args.connectedAt > lookback ? args.connectedAt : lookback;
  // Ids first (newest N, selecting no JSON), then the JSON for just those rows.
  const [seenIds, subIds] = await Promise.all([
    prisma.appEvent.findMany({
      where: { type: MTD_OBLIGATIONS_SEEN_EVENT, userId: args.userId, createdAt: { gte: since } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: MAX_SNAPSHOTS,
    }),
    prisma.appEvent.findMany({
      where: { type: HMRC_SUBMISSION_EVENT, userId: args.userId, createdAt: { gte: since } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: MAX_SUBMISSIONS,
    }),
  ]);
  const [seenRows, subRows] = await Promise.all([
    seenIds.length
      ? prisma.appEvent.findMany({
          where: { id: { in: seenIds.map((r) => r.id) } },
          select: { metadata: true, createdAt: true },
        })
      : [],
    subIds.length
      ? prisma.appEvent.findMany({ where: { id: { in: subIds.map((r) => r.id) } }, select: { metadata: true } })
      : [],
  ]);
  // Newest first, in JS.
  const seen = seenRows
    .filter((s) => snapshotMatches(s.metadata, args.environment))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const okSubmissions: OkSubmission[] = [];
  for (const s of subRows) {
    const m = s.metadata as Record<string, unknown> | null;
    if (!m || m.ok !== true || m.environment !== args.environment) continue;
    if (m.operation !== "period_submit" && m.operation !== "period_amend") continue;
    if (typeof m.taxYear !== "string" || typeof m.periodEnd !== "string") continue;
    okSubmissions.push({ taxYear: m.taxYear, periodEnd: m.periodEnd });
  }
  return buildMtdSummary({
    snapshots: seen.map((s) => ({ obligations: asObligations(s.metadata as Prisma.JsonValue) })),
    okSubmissions,
    todayIso: args.todayIso,
    seenAt: seen[0]?.createdAt ?? null,
  });
}
