// Practice-started invites: email, pasted list, and "claim these clients"
// for drivers who shared through the old accountant link (A15).
//
// An invite creates nothing a practice can read. It is a PracticeLink in
// "invited" state; the driver says yes in the app (consent sheet), and only
// then does the link go live.

import { prisma } from "../../lib/prisma.js";
import { sendPushToUser } from "../../lib/push.js";
import {
  sendPracticeClientInviteEmail,
  sendPracticeNoticeEmail,
} from "../email.js";
import {
  PRACTICE_INVITE_DAYS,
  parsePastedInvites,
  type PastedInvite,
} from "@mileclear/shared";
import { hashToken, newInviteToken, type MemberContext } from "./access.js";
import { clientInviteUrl, DAY_MS, WEB_BASE_URL } from "../../routes/practice/shared.js";

export type InviteOutcome =
  | "invited"
  | "already_client"
  | "already_invited"
  | "wants_to_join"
  | "said_no_recently"
  | "not_an_email"
  | "is_staff"
  | "duplicate";

export interface InviteCheckRow {
  line: number;
  email: string;
  name: string | null;
  outcome: InviteOutcome;
}

/** What inviting this email would do, without changing anything. */
export async function classifyInvites(
  practiceId: string,
  entries: PastedInvite[],
  now: Date = new Date()
): Promise<InviteCheckRow[]> {
  const valid = entries.filter((e) => e.valid).map((e) => e.email);
  const [users, staff] = await Promise.all([
    valid.length
      ? prisma.user.findMany({ where: { email: { in: valid } }, select: { id: true, email: true } })
      : [],
    prisma.practiceMember.findMany({
      where: { practiceId, status: { in: ["active", "invited"] } },
      select: { invitedEmail: true, user: { select: { email: true } } },
    }),
  ]);
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  const staffEmails = new Set(
    staff.flatMap((s) => [s.invitedEmail.toLowerCase(), s.user?.email.toLowerCase()]).filter(Boolean) as string[]
  );
  const userIds = users.map((u) => u.id);
  const links = await prisma.practiceLink.findMany({
    where: {
      practiceId,
      OR: [
        ...(userIds.length ? [{ clientUserId: { in: userIds } }] : []),
        ...(valid.length ? [{ invitedEmail: { in: valid } }] : []),
      ],
    },
    select: {
      clientUserId: true,
      invitedEmail: true,
      status: true,
      endsAt: true,
      endedAt: true,
      endedBy: true,
      inviteExpiresAt: true,
    },
  });

  const seen = new Set<string>();
  return entries.map((e) => {
    const base = { line: e.line, email: e.email, name: e.name };
    if (!e.valid) return { ...base, outcome: "not_an_email" as const };
    if (seen.has(e.email)) return { ...base, outcome: "duplicate" as const };
    seen.add(e.email);
    if (staffEmails.has(e.email)) return { ...base, outcome: "is_staff" as const };
    const uid = userByEmail.get(e.email);
    const link = links.find((l) => (uid && l.clientUserId === uid) || l.invitedEmail === e.email);
    return { ...base, outcome: linkOutcome(link ?? null, now) };
  });
}

function linkOutcome(
  link: {
    status: string;
    endsAt: Date | null;
    endedAt: Date | null;
    endedBy: string | null;
    inviteExpiresAt: Date | null;
  } | null,
  now: Date
): InviteOutcome {
  if (!link) return "invited";
  switch (link.status) {
    case "active":
      return link.endsAt && link.endsAt.getTime() > now.getTime() ? "already_client" : "invited";
    case "invited":
      return link.inviteExpiresAt && link.inviteExpiresAt.getTime() > now.getTime()
        ? "already_invited"
        : "invited";
    case "pending_practice":
      return "wants_to_join";
    case "declined":
      // A driver who said no is not asked again for 30 days.
      return link.endedBy !== "practice" &&
        link.endedAt &&
        now.getTime() - link.endedAt.getTime() < 30 * DAY_MS
        ? "said_no_recently"
        : "invited";
    default:
      return "invited";
  }
}

/**
 * Invite one email. Reuses the (practice, client) row when there is one,
 * so ended and expired links are asked again rather than duplicated.
 */
export async function inviteClient(args: {
  member: MemberContext;
  email: string;
  name: string | null;
  now?: Date;
}): Promise<InviteOutcome> {
  const now = args.now ?? new Date();
  const email = args.email.trim().toLowerCase();
  const [row] = await classifyInvites(
    args.member.practice.id,
    [{ line: 1, raw: email, email, name: args.name, valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) }],
    now
  );
  if (row.outcome !== "invited") return row.outcome;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const token = newInviteToken();
  const data = {
    status: "invited",
    startedBy: "practice",
    invitedEmail: email,
    invitedName: args.name,
    inviteTokenHash: hashToken(token),
    inviteExpiresAt: new Date(now.getTime() + PRACTICE_INVITE_DAYS * DAY_MS),
    invitedAt: now,
    lastResentAt: null,
    createdByMemberId: args.member.memberId,
    consentedAt: null,
    startedAt: null,
    endsAt: null,
    endedAt: null,
    endedBy: null,
    renewalAskedAt: null,
    renewalRemindedAt: null,
    // A fresh ask starts from the defaults; the driver chooses again.
    shareEarnings: true,
    shareExpenses: true,
    sharePersonalTrips: false,
  };

  // The row for this person if they have one, else the row for this email.
  const existing =
    (user
      ? await prisma.practiceLink.findUnique({
          where: { practiceId_clientUserId: { practiceId: args.member.practice.id, clientUserId: user.id } },
          select: { id: true },
        })
      : null) ??
    (await prisma.practiceLink.findFirst({
      where: { practiceId: args.member.practice.id, invitedEmail: email, clientUserId: null },
      select: { id: true },
    }));
  let linkId: string;
  if (existing) {
    linkId = existing.id;
    await prisma.practiceLink.update({
      where: { id: existing.id },
      data: { ...data, clientUserId: user?.id ?? undefined },
    });
  } else {
    const created = await prisma.practiceLink.create({
      data: { ...data, practiceId: args.member.practice.id, clientUserId: user?.id ?? null },
      select: { id: true },
    });
    linkId = created.id;
  }

  await deliverClientInvite({
    to: email,
    token,
    practiceName: args.member.practice.name,
    inviterName: args.member.name,
    clientUserId: user?.id ?? null,
    linkId,
  });
  return "invited";
}

/** Email (and push, for someone already on MileClear) one invite. */
export async function deliverClientInvite(args: {
  to: string;
  token: string;
  practiceName: string;
  inviterName: string;
  clientUserId: string | null;
  linkId: string;
}): Promise<void> {
  try {
    await sendPracticeClientInviteEmail({
      to: args.to,
      practiceName: args.practiceName,
      inviterName: args.inviterName,
      url: clientInviteUrl(args.token),
    });
  } catch (err) {
    console.error("[practice] client invite email failed:", (err as Error)?.message ?? err);
  }
  if (args.clientUserId) {
    sendPushToUser(
      args.clientUserId,
      args.practiceName,
      "Would like to see your business records. Nothing is shared unless you say yes.",
      { action: "practice_consent", linkId: args.linkId }
    ).catch(() => {});
  }
}

/** Pasted list: check every line, invite the ones that can be invited. */
export async function inviteFromText(member: MemberContext, text: string, max: number) {
  const entries = parsePastedInvites(text);
  const rows = await classifyInvites(member.practice.id, entries);
  const toInvite = rows.filter((r) => r.outcome === "invited").slice(0, max);
  let sent = 0;
  for (const r of toInvite) {
    const outcome = await inviteClient({ member, email: r.email, name: r.name });
    if (outcome === "invited") sent++;
  }
  return { rows, sent };
}

// ── Old accountant links (A15) ──────────────────────────────────────────

/**
 * Drivers who shared with one of these emails through the old token link
 * and still have live access, and are not already linked to the practice.
 */
export async function findClaimable(practiceId: string, emails: string[], now: Date = new Date()) {
  const lower = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (lower.length === 0) return [];
  const access = await prisma.accountantAccess.findMany({
    where: { accountantEmail: { in: lower }, expiresAt: { gt: now } },
    select: { userId: true, accountantEmail: true },
  });
  if (access.length === 0) return [];
  const linked = await prisma.practiceLink.findMany({
    where: {
      practiceId,
      clientUserId: { in: access.map((a) => a.userId) },
      status: { in: ["invited", "pending_practice", "active"] },
    },
    select: { clientUserId: true },
  });
  const skip = new Set(linked.map((l) => l.clientUserId));
  const seen = new Set<string>();
  return access.filter((a) => {
    if (skip.has(a.userId) || seen.has(a.userId)) return false;
    seen.add(a.userId);
    return true;
  });
}

/** "Add them": ask each old-link driver to say yes in the app. */
export async function claimOldLinks(member: MemberContext, emails: string[]): Promise<number> {
  const claimable = await findClaimable(member.practice.id, emails);
  let asked = 0;
  for (const c of claimable) {
    const user = await prisma.user.findUnique({ where: { id: c.userId }, select: { email: true } });
    if (!user) continue;
    const outcome = await inviteClient({ member, email: user.email, name: null });
    if (outcome === "invited") asked++;
  }
  return asked;
}

// ── Notices to the practice ─────────────────────────────────────────────

/** Email the staff member who started a link, or the owners. */
export async function noticeToPractice(args: {
  practiceId: string;
  memberId?: string | null;
  subject: string;
  title: string;
  lines: string[];
  path?: string;
}): Promise<void> {
  try {
    const members = await prisma.practiceMember.findMany({
      where: { practiceId: args.practiceId, status: "active" },
      select: { id: true, role: true, user: { select: { email: true } } },
    });
    const creator = members.find((m) => m.id === args.memberId);
    const to = creator ? [creator] : members.filter((m) => m.role === "owner");
    for (const m of to) {
      if (!m.user?.email) continue;
      await sendPracticeNoticeEmail({
        to: m.user.email,
        subject: args.subject,
        title: args.title,
        lines: args.lines,
        ctaLabel: "Open your client list",
        ctaUrl: `${WEB_BASE_URL}${args.path ?? "/practice"}`,
      });
    }
  } catch (err) {
    console.error("[practice] notice email failed:", (err as Error)?.message ?? err);
  }
}
