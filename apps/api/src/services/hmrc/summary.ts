// GET /hmrc/summary: what the Tax tab's "Quarterly updates" card shows.
//
// The Tax tab opens often, and every call to HMRC carries the driver's real
// phone in the fraud-prevention headers, so this does NOT call HMRC. It reads
// what HMRC last showed this driver (hmrc.obligations_seen, written whenever
// the quarterly updates screen loads them) and the updates MileClear has sent
// since (hmrc.submission, ok), the same sources the deadline reminders use.
// A quarter HMRC still shows Open but MileClear has sent an update covering
// is reported Fulfilled, so the card is right the moment an update is sent.

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
}

/** One tax year of quarters, with sent updates applied. Pure. */
export function buildMtdSummary(args: {
  snapshots: Array<{ obligations: SeenObligation[] }>;
  okSubmissions: OkSubmission[];
  todayIso: string;
}): MtdSummary {
  const all = latestObligations(args.snapshots);
  if (all.length === 0) return { taxYear: null, quarters: [] };

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
  return { taxYear, quarters };
}

const LOOKBACK_MS = 400 * 24 * 60 * 60 * 1000;

export async function loadMtdSummary(args: {
  userId: string;
  environment: "sandbox" | "production";
  todayIso: string;
  now?: Date;
}): Promise<MtdSummary> {
  const since = new Date((args.now ?? new Date()).getTime() - LOOKBACK_MS);
  const [seen, subs] = await Promise.all([
    prisma.appEvent.findMany({
      where: { type: MTD_OBLIGATIONS_SEEN_EVENT, userId: args.userId, createdAt: { gte: since } },
      select: { metadata: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { type: HMRC_SUBMISSION_EVENT, userId: args.userId, createdAt: { gte: since } },
      select: { metadata: true },
    }),
  ]);
  // Newest first, in JS (sorting a JSON-selecting query can run out of sort memory on prod).
  seen.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const okSubmissions: OkSubmission[] = [];
  for (const s of subs) {
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
  });
}
