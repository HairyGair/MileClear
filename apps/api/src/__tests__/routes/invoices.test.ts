/**
 * Invoice route tests — focused on the link-earning / duplicate-detect
 * flow shipped 21 May 2026 (Laura Joyce double-count fix).
 *
 * Covers:
 *   - POST /invoices/:id/link-earning happy path + ownership checks
 *   - POST /invoices/:id/unlink-earning
 *   - PATCH /invoices/:id mark-paid surfaces potentialEarningMatches
 *   - matches exclude already-linked earnings
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    invoice: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    earning: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    appEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { invoiceRoutes } from "../../routes/invoices/index.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-000000000099";
const INVOICE_ID = "11111111-1111-1111-1111-111111111111";
const EARNING_ID = "22222222-2222-2222-2222-222222222222";

const PAID_INVOICE = {
  id: INVOICE_ID,
  userId: USER_ID,
  company: "Acme Ltd",
  reference: null,
  amountPence: 40000,
  sentAt: new Date("2026-05-01"),
  dueAt: new Date("2026-05-31"),
  paidAt: new Date("2026-05-20"),
  status: "paid",
  notes: null,
  linkedEarningId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SENT_INVOICE = {
  ...PAID_INVOICE,
  paidAt: null,
  status: "sent",
};

const MATCHING_EARNING = {
  id: EARNING_ID,
  userId: USER_ID,
  platform: "freelance",
  amountPence: 40000,
  periodStart: new Date("2026-05-14"),
  periodEnd: new Date("2026-05-14"),
  source: "manual",
  externalId: null,
  notes: null,
  createdAt: new Date(),
};

async function createTestApp() {
  const app = await buildApp();
  await app.register(invoiceRoutes, { prefix: "/invoices" });
  return app;
}

function resetMocks() {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    isPremium: true,
    premiumExpiresAt: null,
  } as any);
  vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
  vi.mocked(prisma.invoice.updateMany).mockResolvedValue({ count: 0 } as any);
  vi.mocked(prisma.earning.findMany).mockResolvedValue([]);
  vi.mocked(prisma.invoice.count).mockResolvedValue(0);
}

const authHeader = (id = USER_ID) => ({
  authorization: `Bearer ${makeAccessToken(id)}`,
});

describe("POST /invoices/:id/link-earning", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("401 — rejects unauthenticated", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/invoices/${INVOICE_ID}/link-earning`,
      payload: { earningId: EARNING_ID },
    });
    expect(res.statusCode).toBe(401);
  });

  it("400 — rejects missing earningId", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/invoices/${INVOICE_ID}/link-earning`,
      payload: {},
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(400);
  });

  it("404 — when invoice not owned by caller", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.earning.findFirst).mockResolvedValue(MATCHING_EARNING as any);

    const res = await app.inject({
      method: "POST",
      url: `/invoices/${INVOICE_ID}/link-earning`,
      payload: { earningId: EARNING_ID },
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/invoice/i);
  });

  it("404 — when earning not owned by caller", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(PAID_INVOICE as any);
    vi.mocked(prisma.earning.findFirst).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: `/invoices/${INVOICE_ID}/link-earning`,
      payload: { earningId: EARNING_ID },
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/earning/i);
  });

  it("200 — links invoice to earning and persists linkedEarningId", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(PAID_INVOICE as any);
    vi.mocked(prisma.earning.findFirst).mockResolvedValue(MATCHING_EARNING as any);
    vi.mocked(prisma.invoice.update).mockResolvedValue({
      ...PAID_INVOICE,
      linkedEarningId: EARNING_ID,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/invoices/${INVOICE_ID}/link-earning`,
      payload: { earningId: EARNING_ID },
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.linkedEarningId).toBe(EARNING_ID);
    expect(vi.mocked(prisma.invoice.update)).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: { linkedEarningId: EARNING_ID },
    });
  });
});

describe("POST /invoices/:id/unlink-earning", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("200 — clears the link without deleting either side", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      ...PAID_INVOICE,
      linkedEarningId: EARNING_ID,
    } as any);
    vi.mocked(prisma.invoice.update).mockResolvedValue({
      ...PAID_INVOICE,
      linkedEarningId: null,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/invoices/${INVOICE_ID}/unlink-earning`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.linkedEarningId).toBeNull();
    expect(vi.mocked(prisma.invoice.update)).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: { linkedEarningId: null },
    });
  });

  it("404 — when invoice not owned by caller", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: `/invoices/${INVOICE_ID}/unlink-earning`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /invoices/:id — duplicate-earning surfacing", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("returns potentialEarningMatches when an unpaid invoice is marked paid and a near-match earning exists", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(SENT_INVOICE as any);
    vi.mocked(prisma.invoice.update).mockResolvedValue({
      ...SENT_INVOICE,
      paidAt: new Date("2026-05-20"),
      status: "paid",
    } as any);
    vi.mocked(prisma.earning.findMany).mockResolvedValue([MATCHING_EARNING as any]);

    const res = await app.inject({
      method: "PATCH",
      url: `/invoices/${INVOICE_ID}`,
      payload: { paidAt: "2026-05-20" },
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.potentialEarningMatches).toHaveLength(1);
    expect(body.potentialEarningMatches[0].id).toBe(EARNING_ID);
  });

  it("returns empty potentialEarningMatches when the invoice was already paid (edit, not transition)", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(PAID_INVOICE as any);
    vi.mocked(prisma.invoice.update).mockResolvedValue({
      ...PAID_INVOICE,
      amountPence: 41000,
    } as any);

    const res = await app.inject({
      method: "PATCH",
      url: `/invoices/${INVOICE_ID}`,
      payload: { amountPence: 41000 },
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.potentialEarningMatches).toEqual([]);
    // No earning lookup should happen on a non-transition update.
    expect(vi.mocked(prisma.earning.findMany)).not.toHaveBeenCalled();
  });

  it("excludes already-linked earnings via the linkedInvoices: { none: {} } filter", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(SENT_INVOICE as any);
    vi.mocked(prisma.invoice.update).mockResolvedValue({
      ...SENT_INVOICE,
      paidAt: new Date("2026-05-20"),
      status: "paid",
    } as any);
    vi.mocked(prisma.earning.findMany).mockResolvedValue([]);

    await app.inject({
      method: "PATCH",
      url: `/invoices/${INVOICE_ID}`,
      payload: { paidAt: "2026-05-20" },
      headers: authHeader(),
    });

    const findManyCall = vi.mocked(prisma.earning.findMany).mock.calls[0][0];
    expect(findManyCall?.where).toMatchObject({
      userId: USER_ID,
      linkedInvoices: { none: {} },
    });
  });
});
