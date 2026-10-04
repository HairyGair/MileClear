// Milesheet: the database side of starting a team and of the waiting list
// (4 Oct 2026). The rules (mode, trial, dedupe) are pure and live in
// milesheetNewTeams.ts and teamTrial.ts; this file only reads and writes.

import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import {
  WAITLIST_DEDUPE_DAYS,
  isDuplicateWaitlistRequest,
  type WaitlistSource,
} from "./milesheetNewTeams.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newInviteToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
}

export interface WaitlistRequest {
  source: WaitlistSource;
  /** The person to contact: the manager. */
  email: string;
  company: string | null;
  contactName?: string | null;
  /** "1-5" | "6-20" | "21-50" | "50+" when the form asked. */
  drivers?: string | null;
  notes?: string | null;
  /** The driver who named their manager (driver_nomination only). */
  nominatedByUserId?: string | null;
  /** Which page or screen, for the admin's "via" column. */
  page?: string | null;
}

/**
 * Store a parked request to start a team. Never loses one: the row is
 * written before anything else happens, and a repeat of the same request
 * within WAITLIST_DEDUPE_DAYS returns the first row instead of adding
 * another (duplicate: true), so callers can skip a second email.
 */
export async function recordWaitlistRequest(
  req: WaitlistRequest
): Promise<{ id: string; duplicate: boolean }> {
  const now = new Date();
  const email = req.email.trim().toLowerCase();
  const recent = await prisma.teamInterest.findMany({
    where: {
      email,
      waitlistSource: req.source,
      admittedAt: null,
      createdAt: { gte: new Date(now.getTime() - WAITLIST_DEDUPE_DAYS * DAY_MS) },
    },
    select: { id: true, email: true, waitlistSource: true, nominatedByUserId: true, admittedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const match = recent.find((r) =>
    isDuplicateWaitlistRequest(
      r,
      { email, source: req.source, nominatedByUserId: req.nominatedByUserId ?? null },
      now
    )
  );
  if (match) return { id: match.id, duplicate: true };

  const row = await prisma.teamInterest.create({
    data: {
      email,
      company: req.company?.trim() || null,
      contactName: req.contactName?.trim() || null,
      drivers: req.drivers ?? null,
      notes: req.notes?.trim() || null,
      source: req.page ?? null,
      waitlistSource: req.source,
      nominatedByUserId: req.nominatedByUserId ?? null,
    },
    select: { id: true },
  });
  return { id: row.id, duplicate: false };
}

/** Has this person already started a team that had a free trial? */
export async function creatorHadTrial(userId: string): Promise<boolean> {
  const n = await prisma.organisation.count({
    where: { createdByUserId: userId, trialEndsAt: { not: null } },
  });
  return n > 0;
}
