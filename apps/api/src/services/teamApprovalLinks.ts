import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";

// Milesheet (Oct 2026): approve the month from an email link, no account
// needed. The 26 Oct pilot numbers showed most driver-started teams stalled
// because the nominated manager never created an account, so the monthly
// email now carries a link that lets them approve without one.
//
// Token discipline copies the team invites: 128 hex chars of CSPRNG, sha256
// at rest, the raw token only ever in the email. A link grants ONE org for
// ONE month and nothing else: it cannot list other months, other orgs,
// members' emails, or change any setting.

export const APPROVAL_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[0-9a-f]{128}$/;

export function hashLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Short stable fingerprint of an address, for dedup metadata without storing the address. */
export function emailFingerprint(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** Creates a link and returns the raw token (goes in the email, never stored). */
export async function createApprovalLink(
  orgId: string,
  month: string,
  recipientEmail: string,
  now: Date = new Date()
): Promise<string> {
  const token = crypto.randomBytes(64).toString("hex").slice(0, 128);
  await prisma.teamApprovalLink.create({
    data: {
      orgId,
      month,
      recipientEmail: recipientEmail.trim().toLowerCase(),
      tokenHash: hashLinkToken(token),
      expiresAt: new Date(now.getTime() + APPROVAL_LINK_TTL_MS),
    },
  });
  return token;
}

export interface ResolvedApprovalLink {
  id: string;
  orgId: string;
  orgName: string;
  month: string;
  recipientEmail: string;
  /** The recipient's own admin membership: "active" has an account, "invited" does not yet. */
  recipientStatus: "active" | "invited";
  /**
   * True while nobody in the org has accepted the manager role: the
   * nominating driver (an "invited" membership with a userId) is counted,
   * because there is nobody else who could ever approve them.
   */
  includeNominatingDrivers: boolean;
}

export type ResolveLinkResult = { ok: true; link: ResolvedApprovalLink } | { ok: false; reason: "unknown" | "expired" };

export async function resolveApprovalLink(token: string, now: Date = new Date()): Promise<ResolveLinkResult> {
  // Malformed tokens never reach the database.
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { ok: false, reason: "unknown" };
  const tokenHash = hashLinkToken(token);

  // Looked up by the sha256 of the token (a unique index), so the database
  // only ever compares hashes, never the secret itself. The stored hash is
  // re-checked with timingSafeEqual as a belt-and-braces guard.
  const row = await prisma.teamApprovalLink.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      orgId: true,
      month: true,
      recipientEmail: true,
      tokenHash: true,
      expiresAt: true,
      org: { select: { name: true } },
    },
  });
  if (!row) return { ok: false, reason: "unknown" };
  const a = Buffer.from(row.tokenHash, "hex");
  const b = Buffer.from(tokenHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "unknown" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };

  // The link only works while its recipient is still a manager of this org
  // (active, or still invited). Removing a manager, or cancelling their
  // invite, kills their links with it.
  const email = row.recipientEmail.toLowerCase();
  const standing = await prisma.orgMembership.findFirst({
    where: {
      orgId: row.orgId,
      role: "admin",
      status: { in: ["active", "invited"] },
      OR: [{ invitedEmail: email }, { user: { email } }],
    },
    select: { status: true },
  });
  if (!standing) return { ok: false, reason: "expired" };

  const activeAdmins = await prisma.orgMembership.count({
    where: { orgId: row.orgId, role: "admin", status: "active" },
  });

  // Best effort: a failed write must not stop the manager approving.
  await prisma.teamApprovalLink
    .update({ where: { id: row.id }, data: { lastUsedAt: now } })
    .catch(() => undefined);

  return {
    ok: true,
    link: {
      id: row.id,
      orgId: row.orgId,
      orgName: row.org.name,
      month: row.month,
      recipientEmail: email,
      recipientStatus: standing.status === "active" ? "active" : "invited",
      includeNominatingDrivers: activeAdmins === 0,
    },
  };
}
