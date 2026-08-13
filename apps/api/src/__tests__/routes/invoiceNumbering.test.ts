/**
 * PATCH /user/profile — continuing an existing invoice sequence.
 *
 * People arrive mid-sequence. Rachel Thorndyke (13 Aug 2026) migrated from a
 * spreadsheet at invoice 485 and MileClear restarted her at 1, with no way for
 * her or for support to change it short of a database write.
 *
 * The number is exposed as "next invoice number" because that is how users
 * think about it; the stored counter holds the last number ALLOCATED. The guard
 * that matters: never move the sequence back onto ground already issued, since
 * @@unique([userId, invoiceNumber]) would fail the next create and a duplicate
 * reference is worse than the error — the payment reconciler matches on it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    invoice: { aggregate: vi.fn() },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    trip: { count: vi.fn().mockResolvedValue(0) },
  },
}));
vi.mock("../../lib/stripe.js", () => ({ stripe: null }));
vi.mock("../../lib/push.js", () => ({ sendPushToUser: vi.fn() }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/referral.js", () => ({
  resolvePremiumStatus: vi.fn((u: any) => ({ ...u, isPremium: false })),
}));
vi.mock("../../lib/encryption.js", () => ({
  encrypt: (v: string) => `enc:${v}`,
  decryptIfEncrypted: (v: string | null) => v,
}));
vi.mock("../../services/export.js", () => ({ canSafelyEmbedImage: vi.fn() }));
vi.mock("../../services/auth.js", () => ({ verifyPassword: vi.fn() }));

import { userRoutes } from "../../routes/user/index.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-0000000000f1";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

const BASE_USER = {
  id: USER_ID, email: "rachel@example.com", displayName: "Rachel",
  passwordHash: "x", invoiceCounter: 0, invoicePaymentTermsDays: 30,
  bankSortCode: null, bankAccountNumber: null, isPremium: false,
  premiumExpiresAt: null,
};

async function createTestApp() {
  const app = await buildApp();
  await app.register(userRoutes, { prefix: "/user" });
  return app;
}

describe("invoice numbering", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(BASE_USER as any);
    vi.mocked(prisma.user.update).mockImplementation((({ data }: any) =>
      Promise.resolve({ ...BASE_USER, ...data })) as any);
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _max: { invoiceNumber: null } } as any);
    app = await createTestApp();
  });

  it("lets someone migrating at 485 carry on from there", async () => {
    const res = await app.inject({
      method: "PATCH", url: "/user/profile", headers: auth,
      payload: { nextInvoiceNumber: 485 },
    });

    expect(res.statusCode).toBe(200);
    // Stored counter is the last number ALLOCATED, so 485 next means 484 stored.
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data.invoiceCounter).toBe(484);
  });

  it("reports the sequence back as the next number, not the raw counter", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...BASE_USER, invoiceCounter: 484 } as any);

    const res = await app.inject({ method: "GET", url: "/user/profile", headers: auth });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.nextInvoiceNumber).toBe(485);
  });

  it("refuses to reuse a number already issued", async () => {
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _max: { invoiceNumber: 490 } } as any);

    const res = await app.inject({
      method: "PATCH", url: "/user/profile", headers: auth,
      payload: { nextInvoiceNumber: 485 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("INV-0490");
    expect(res.json().error).toContain("INV-0491");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses the boundary case of reissuing the highest number itself", async () => {
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _max: { invoiceNumber: 490 } } as any);

    const res = await app.inject({
      method: "PATCH", url: "/user/profile", headers: auth,
      payload: { nextInvoiceNumber: 490 },
    });

    expect(res.statusCode).toBe(400);
  });

  it("allows the next number straight after the highest issued", async () => {
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _max: { invoiceNumber: 490 } } as any);

    const res = await app.inject({
      method: "PATCH", url: "/user/profile", headers: auth,
      payload: { nextInvoiceNumber: 491 },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data.invoiceCounter).toBe(490);
  });

  it("leaves the sequence alone when saving the rest of the profile", async () => {
    const res = await app.inject({
      method: "PATCH", url: "/user/profile", headers: auth,
      payload: { tradingName: "Thorndyke Animal Care" },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data.invoiceCounter).toBeUndefined();
    // No point querying invoices when the caller did not ask to renumber.
    expect(prisma.invoice.aggregate).not.toHaveBeenCalled();
  });

  it("rejects a zero or negative sequence at the schema", async () => {
    for (const n of [0, -5]) {
      const res = await app.inject({
        method: "PATCH", url: "/user/profile", headers: auth,
        payload: { nextInvoiceNumber: n },
      });
      expect(res.statusCode).toBe(400);
    }
  });
});
