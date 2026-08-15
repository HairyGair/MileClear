/**
 * Exports must not hand a paying subscriber a blank document.
 *
 * Jakub Zychla (15 Aug 2026) registered, created one manual trip, deleted it 30
 * seconds later, subscribed to Pro, and inside 27 minutes ran the PDF, the
 * self-assessment and the CSV. He had nothing recorded, so all three came back
 * empty, and he filed a refund with Apple under two hours after paying. An
 * empty file reads as a broken product rather than as "no data yet".
 *
 * The guard is deliberately conservative: it fires only when the document would
 * genuinely contain nothing. The self-assessment report also carries earnings,
 * so it is allowed whenever EITHER trips or earnings exist.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { count: vi.fn() },
    earning: { count: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/export.js", () => ({
  generateTripsCsv: vi.fn().mockResolvedValue("Date,From,To\r\n"),
  generateTripsPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")),
  generateSelfAssessmentPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")),
  formatXeroExpense: vi.fn(),
  formatFreeAgentExpense: vi.fn(),
  formatQuickBooksExpense: vi.fn(),
}));
// Premium gate passes; this suite is about emptiness, not entitlement.
vi.mock("../../middleware/premium.js", () => ({
  premiumMiddleware: vi.fn(async () => {}),
}));

import { exportRoutes } from "../../routes/exports/index.js";
import { prisma } from "../../lib/prisma.js";
import {
  generateTripsCsv,
  generateTripsPdf,
  generateSelfAssessmentPdf,
} from "../../services/export.js";
import { logEvent } from "../../services/appEvents.js";

const USER_ID = "00000000-0000-0000-0000-0000000000e1";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

async function createTestApp() {
  const app = await buildApp();
  await app.register(exportRoutes, { prefix: "/exports" });
  return app;
}

describe("exports: empty-document guard", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.earning.count).mockResolvedValue(0 as never);
    app = await createTestApp();
  });

  it("refuses a CSV when there is nothing in the tax year, and says why", async () => {
    const res = await app.inject({
      method: "GET", url: "/exports/csv?taxYear=2026-27", headers: auth,
    });

    expect(res.statusCode).toBe(400);
    // The mobile client shows this under an "Export failed" title, so it has to
    // explain itself without any surrounding context.
    expect(res.json().error).toContain("2026-27");
    expect(res.json().error).toMatch(/empty/i);
    expect(generateTripsCsv).not.toHaveBeenCalled();
  });

  it("refuses the trip-report PDF on the same basis", async () => {
    const res = await app.inject({
      method: "GET", url: "/exports/pdf?taxYear=2026-27", headers: auth,
    });

    expect(res.statusCode).toBe(400);
    expect(generateTripsPdf).not.toHaveBeenCalled();
  });

  it("still produces the CSV as soon as there is one trip", async () => {
    vi.mocked(prisma.trip.count).mockResolvedValue(1 as never);

    const res = await app.inject({
      method: "GET", url: "/exports/csv?taxYear=2026-27", headers: auth,
    });

    expect(res.statusCode).toBe(200);
    expect(generateTripsCsv).toHaveBeenCalled();
  });

  it("lets the self-assessment through on earnings alone, with no trips", async () => {
    // It reports earnings as well as mileage, so this document is not empty.
    vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.earning.count).mockResolvedValue(3 as never);

    const res = await app.inject({
      method: "GET", url: "/exports/self-assessment?taxYear=2026-27", headers: auth,
    });

    expect(res.statusCode).toBe(200);
    expect(generateSelfAssessmentPdf).toHaveBeenCalled();
  });

  it("refuses the self-assessment only when both are absent", async () => {
    const res = await app.inject({
      method: "GET", url: "/exports/self-assessment?taxYear=2026-27", headers: auth,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/trips or earnings/i);
    expect(generateSelfAssessmentPdf).not.toHaveBeenCalled();
  });

  it("records that it blocked, so the frequency is visible", async () => {
    await app.inject({ method: "GET", url: "/exports/csv?taxYear=2026-27", headers: auth });

    expect(logEvent).toHaveBeenCalledWith(
      "export.blocked_empty",
      USER_ID,
      expect.objectContaining({ format: "csv", taxYear: "2026-27" })
    );
  });

  it("handles a custom date range without naming a tax year it does not have", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/exports/csv?from=2026-04-06&to=2026-05-06",
      headers: auth,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("that date range");
  });
});
