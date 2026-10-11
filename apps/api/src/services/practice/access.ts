// Practice accounts: who may see what (Accountant mode phase 1, Oct 2026).
//
// The rules every practice read goes through, in one place so a check added
// to one route cannot be missing from another (the old accountant link's
// never-expiring access came from exactly that drift):
//
//   1. The person is an active member of the practice.
//   2. The practice is not paused by an admin.
//   3. There is a link between the practice and the client, the driver said
//      yes in the app, the practice accepted it, and it has not ended or
//      run past its end date. A missing end date fails closed.
//   4. Business records only, unless the driver turned on personal trips.
//      Earnings and expenses only when the driver shares them.
//   5. Every read writes a PracticeAccessLog row BEFORE data goes back. If
//      the log write fails, the read fails.

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import type { PracticeAccessAction } from "@mileclear/shared";
import { prisma } from "../../lib/prisma.js";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 128 hex characters of CSPRNG output, same as the other invite links. */
export function newInviteToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

export const INVITE_TOKEN_RE = /^[0-9a-f]{128}$/;

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A join code: 8 characters, no lookalikes (no I, O, 0, 1). */
export function newJoinCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (const b of bytes) out += JOIN_ALPHABET[b % JOIN_ALPHABET.length];
  return out;
}

// ── Membership ──────────────────────────────────────────────────────────

export interface MemberContext {
  memberId: string;
  role: "owner" | "staff";
  userId: string;
  name: string;
  practice: {
    id: string;
    name: string;
    status: string;
    suspendedAt: Date | null;
  };
}

/** The practice this person belongs to, or null. One practice per person. */
export async function loadMember(userId: string): Promise<MemberContext | null> {
  const m = await prisma.practiceMember.findFirst({
    where: { userId, status: "active" },
    orderBy: { acceptedAt: "asc" },
    select: {
      id: true,
      role: true,
      practice: { select: { id: true, name: true, status: true, suspendedAt: true } },
      user: { select: { displayName: true, fullName: true, email: true } },
    },
  });
  if (!m) return null;
  return {
    memberId: m.id,
    role: m.role === "owner" ? "owner" : "staff",
    userId,
    name: m.user?.fullName || m.user?.displayName || "A colleague",
    practice: m.practice,
  };
}

// ── Links ───────────────────────────────────────────────────────────────

export interface LinkLike {
  status: string;
  consentedAt: Date | null;
  startedAt: Date | null;
  endsAt: Date | null;
}

export type LinkProblem =
  | "no_link"
  | "not_answered"
  | "waiting_for_practice"
  | "stopped"
  | "ended"
  | "declined"
  | "paused";

/**
 * Is this link live right now? Pure, so the rule is tested on its own.
 * Live = active, driver consent recorded, started, and before its end
 * date. No end date = not live (fail closed).
 */
export function linkProblem(
  link: (LinkLike & { endedBy?: string | null }) | null,
  practice: { suspendedAt: Date | null } | null,
  now: Date = new Date()
): LinkProblem | null {
  if (!link) return "no_link";
  if (practice?.suspendedAt) return "paused";
  switch (link.status) {
    case "invited":
      return "not_answered";
    case "pending_practice":
      return "waiting_for_practice";
    case "declined":
    case "cancelled":
      return "declined";
    case "ended":
      return link.endedBy === "driver" || link.endedBy === "report" ? "stopped" : "ended";
    case "active":
      break;
    default:
      return "no_link";
  }
  if (!link.consentedAt || !link.startedAt) return "not_answered";
  if (!link.endsAt || link.endsAt.getTime() <= now.getTime()) return "ended";
  return null;
}

const PROBLEM_HTTP: Record<LinkProblem, { status: number; error: string }> = {
  no_link: { status: 404, error: "This person is not your client." },
  not_answered: { status: 403, error: "Your client has not said yes yet." },
  waiting_for_practice: { status: 403, error: "Accept this client first." },
  stopped: { status: 403, error: "Your client stopped sharing with you." },
  ended: { status: 403, error: "Sharing with this client has ended." },
  declined: { status: 403, error: "This client is not sharing with you." },
  paused: { status: 403, error: "This practice account is paused." },
};

export function problemResponse(code: LinkProblem) {
  return { ...PROBLEM_HTTP[code], code };
}

export const liveLinkSelect = {
  id: true,
  practiceId: true,
  clientUserId: true,
  status: true,
  startedBy: true,
  consentedAt: true,
  startedAt: true,
  endsAt: true,
  endedAt: true,
  endedBy: true,
  renewalAskedAt: true,
  shareEarnings: true,
  shareExpenses: true,
  sharePersonalTrips: true,
} as const;

export type LiveLink = Prisma.PracticeLinkGetPayload<{ select: typeof liveLinkSelect }>;

/** The link for (practice, client) if it is live, otherwise why not. */
export async function resolveClientLink(
  member: MemberContext,
  clientUserId: string,
  now: Date = new Date()
): Promise<{ ok: true; link: LiveLink } | { ok: false; code: LinkProblem; link: LiveLink | null }> {
  const link = await prisma.practiceLink.findUnique({
    where: { practiceId_clientUserId: { practiceId: member.practice.id, clientUserId } },
    select: liveLinkSelect,
  });
  const code = linkProblem(link, member.practice, now);
  if (code) return { ok: false, code, link };
  return { ok: true, link: link! };
}

/** Trip classifications a practice may list for this link. */
export function visibleClassifications(
  link: Pick<LiveLink, "sharePersonalTrips">,
  show: "business" | "personal" | "all" = "business"
): string[] {
  if (!link.sharePersonalTrips) return ["business"];
  if (show === "personal") return ["personal"];
  if (show === "all") return ["business", "personal"];
  return ["business"];
}

// ── Access log ──────────────────────────────────────────────────────────

/**
 * Write one access-log row. Awaited on purpose: callers write it before
 * reading the data, so a failed write means no data goes back.
 */
export async function logPracticeAccess(args: {
  member: MemberContext | null;
  practice: { id: string; name: string };
  clientUserId: string;
  action: PracticeAccessAction;
  detail?: Record<string, unknown>;
}): Promise<{ id: string; createdAt: Date }> {
  return prisma.practiceAccessLog.create({
    data: {
      practiceId: args.practice.id,
      practiceName: args.practice.name,
      memberId: args.member?.memberId ?? null,
      actorName: args.member?.name ?? null,
      clientUserId: args.clientUserId,
      action: args.action,
      detail: (args.detail ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: { id: true, createdAt: true },
  });
}

/** Display name for a client: the name used on exports, else display name. */
export function clientName(u: { fullName?: string | null; displayName?: string | null; email?: string | null }): string {
  return u.fullName?.trim() || u.displayName?.trim() || "Your client";
}
