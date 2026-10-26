/**
 * Milesheet approval links (Oct 2026): the token a manager gets by email to
 * approve one org's month without an account. 128 hex chars, sha256 at rest,
 * 30 days, and only while the recipient is still a manager of that org.
 */
import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    teamApprovalLink: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    orgMembership: { findFirst: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma.js";
import {
  APPROVAL_LINK_TTL_MS,
  createApprovalLink,
  hashLinkToken,
  resolveApprovalLink,
} from "../../services/teamApprovalLinks.js";

const p = prisma as any;
const NOW = new Date("2026-11-01T09:00:00Z");
const TOKEN = "ab".repeat(64);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    orgId: "org-1",
    month: "2026-10",
    recipientEmail: "boss@firm.co.uk",
    tokenHash: hashLinkToken(TOKEN),
    expiresAt: new Date(NOW.getTime() + 1000),
    org: { name: "Firm Ltd" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.orgMembership.findFirst.mockResolvedValue({ status: "invited" });
  p.orgMembership.count.mockResolvedValue(0);
});

describe("createApprovalLink", () => {
  it("returns a 128-hex token and stores only its sha256, for 30 days", async () => {
    const token = await createApprovalLink("org-1", "2026-10", " Boss@Firm.co.uk ", NOW);
    expect(token).toMatch(/^[0-9a-f]{128}$/);
    const data = p.teamApprovalLink.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(crypto.createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(data).toMatchObject({ orgId: "org-1", month: "2026-10", recipientEmail: "boss@firm.co.uk" });
    expect(data.expiresAt.getTime() - NOW.getTime()).toBe(APPROVAL_LINK_TTL_MS);
  });

  it("never hands out the same token twice", async () => {
    const a = await createApprovalLink("org-1", "2026-10", "a@x.com", NOW);
    const b = await createApprovalLink("org-1", "2026-10", "a@x.com", NOW);
    expect(a).not.toBe(b);
  });
});

describe("resolveApprovalLink", () => {
  it("rejects a malformed token without touching the database", async () => {
    for (const bad of ["", "abc", "zz".repeat(64), "AB".repeat(64), `${TOKEN}0`]) {
      expect(await resolveApprovalLink(bad, NOW)).toEqual({ ok: false, reason: "unknown" });
    }
    expect(p.teamApprovalLink.findUnique).not.toHaveBeenCalled();
  });

  it("looks the link up by the hash, never the raw token", async () => {
    p.teamApprovalLink.findUnique.mockResolvedValue(null);
    expect(await resolveApprovalLink(TOKEN, NOW)).toEqual({ ok: false, reason: "unknown" });
    expect(p.teamApprovalLink.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashLinkToken(TOKEN) });
  });

  it("refuses an expired link", async () => {
    p.teamApprovalLink.findUnique.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime() - 1) }));
    expect(await resolveApprovalLink(TOKEN, NOW)).toEqual({ ok: false, reason: "expired" });
    expect(p.teamApprovalLink.update).not.toHaveBeenCalled();
  });

  it("stops working once the recipient is no longer a manager of the org", async () => {
    p.teamApprovalLink.findUnique.mockResolvedValue(row());
    p.orgMembership.findFirst.mockResolvedValue(null);
    expect(await resolveApprovalLink(TOKEN, NOW)).toEqual({ ok: false, reason: "expired" });
    const where = p.orgMembership.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ orgId: "org-1", role: "admin", status: { in: ["active", "invited"] } });
  });

  it("an invited manager with no active admin in the org counts the nominating drivers", async () => {
    p.teamApprovalLink.findUnique.mockResolvedValue(row());
    const res = await resolveApprovalLink(TOKEN, NOW);
    expect(res).toEqual({
      ok: true,
      link: {
        id: "link-1",
        orgId: "org-1",
        orgName: "Firm Ltd",
        month: "2026-10",
        recipientEmail: "boss@firm.co.uk",
        recipientStatus: "invited",
        includeNominatingDrivers: true,
      },
    });
    expect(p.teamApprovalLink.update).toHaveBeenCalledWith({ where: { id: "link-1" }, data: { lastUsedAt: NOW } });
  });

  it("an org with an active admin uses the portal's driver list", async () => {
    p.teamApprovalLink.findUnique.mockResolvedValue(row());
    p.orgMembership.findFirst.mockResolvedValue({ status: "active" });
    p.orgMembership.count.mockResolvedValue(1);
    const res = await resolveApprovalLink(TOKEN, NOW);
    expect(res.ok && res.link).toMatchObject({ recipientStatus: "active", includeNominatingDrivers: false });
  });

  it("a failed lastUsedAt write does not stop the manager", async () => {
    p.teamApprovalLink.findUnique.mockResolvedValue(row());
    p.teamApprovalLink.update.mockRejectedValueOnce(new Error("db"));
    expect((await resolveApprovalLink(TOKEN, NOW)).ok).toBe(true);
  });
});
