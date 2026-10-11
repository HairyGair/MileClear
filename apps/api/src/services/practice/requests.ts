// Practice requests: "Please sort your trips", "Please add your earnings"...
//
// Two types can be checked, so they close themselves when the driver has
// done the thing: sort_trips when no trips are left unsorted in the tax
// year, add_earnings when at least one earning is dated in the period. The
// check runs whenever either side looks at requests (and in the practice
// job), so there is no background state to drift.

import { prisma } from "../../lib/prisma.js";
import { ukMidnight } from "../../lib/ukTime.js";
import { requestTitle, type PracticeRequestType } from "@mileclear/shared";

function dateKey(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Instants for UK calendar dates (DATE columns come back as UTC midnight). */
export function ukBoundsFromDates(first: Date, last: Date): { start: Date; end: Date } {
  return {
    start: ukMidnight(first.getUTCFullYear(), first.getUTCMonth() + 1, first.getUTCDate()),
    end: new Date(ukMidnight(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate() + 1).getTime() - 1),
  };
}

/** Same from "YYYY-MM-DD" keys. */
export function ukBoundsFromKeys(first: string, last: string): { start: Date; end: Date } {
  return ukBoundsFromDates(new Date(`${first}T00:00:00Z`), new Date(`${last}T00:00:00Z`));
}

/** Close open sort/earnings requests whose condition is now met. */
export async function refreshAutoRequests(clientUserIds: string[], now: Date = new Date()): Promise<number> {
  if (clientUserIds.length === 0) return 0;
  const open = await prisma.practiceRequest.findMany({
    where: {
      clientUserId: { in: clientUserIds },
      status: "open",
      type: { in: ["sort_trips", "add_earnings"] },
    },
    select: { id: true, clientUserId: true, type: true, periodStart: true, periodEnd: true },
  });
  if (open.length === 0) return 0;

  const done: string[] = [];
  for (const r of open) {
    if (!r.periodStart || !r.periodEnd) continue;
    if (r.type === "sort_trips") {
      // Trips are instants; the stored period is UK calendar dates.
      const { start, end } = ukBoundsFromDates(r.periodStart, r.periodEnd);
      const unsorted = await prisma.trip.count({
        where: {
          userId: r.clientUserId,
          isPhantomTrip: false,
          classification: "unclassified",
          startedAt: { gte: start, lte: end },
        },
      });
      if (unsorted === 0) done.push(r.id);
    } else {
      const earnings = await prisma.earning.count({
        where: { userId: r.clientUserId, periodStart: { gte: r.periodStart, lte: r.periodEnd } },
      });
      if (earnings > 0) done.push(r.id);
    }
  }
  if (done.length === 0) return 0;
  const res = await prisma.practiceRequest.updateMany({
    where: { id: { in: done }, status: "open" },
    data: { status: "done", doneHow: "auto", doneAt: now },
  });
  return res.count;
}

export interface RequestRow {
  id: string;
  practiceId: string;
  clientUserId: string;
  type: string;
  note: string | null;
  dueDate: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  countAtSend: number | null;
  status: string;
  doneHow: string | null;
  doneAt: Date | null;
  driverReply: string | null;
  repliedAt: Date | null;
  lastRemindedAt: Date | null;
  createdByName: string | null;
  createdAt: Date;
}

/** The shape both sides read. Dates as calendar keys or ISO instants. */
export function shapeRequest(r: RequestRow) {
  const periodStart = dateKey(r.periodStart);
  const periodEnd = dateKey(r.periodEnd);
  return {
    id: r.id,
    type: r.type as PracticeRequestType,
    title: requestTitle({
      type: r.type,
      countAtSend: r.countAtSend,
      periodStart: r.type === "sort_trips" ? null : periodStart,
      periodEnd: r.type === "sort_trips" ? null : periodEnd,
    }),
    note: r.note,
    dueDate: dateKey(r.dueDate),
    periodStart,
    periodEnd,
    countAtSend: r.countAtSend,
    status: r.status as "open" | "done" | "cancelled",
    doneHow: r.doneHow as "auto" | "driver" | null,
    doneAt: r.doneAt?.toISOString() ?? null,
    driverReply: r.driverReply,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    lastRemindedAt: r.lastRemindedAt?.toISOString() ?? null,
    createdByName: r.createdByName,
    createdAt: r.createdAt.toISOString(),
  };
}

export const requestSelect = {
  id: true,
  practiceId: true,
  clientUserId: true,
  type: true,
  note: true,
  dueDate: true,
  periodStart: true,
  periodEnd: true,
  countAtSend: true,
  status: true,
  doneHow: true,
  doneAt: true,
  driverReply: true,
  repliedAt: true,
  lastRemindedAt: true,
  createdByName: true,
  createdAt: true,
} as const;
