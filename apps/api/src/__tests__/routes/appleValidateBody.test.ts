/**
 * The in-app Apple purchase check must read the transaction id.
 *
 * appleBillingRoutes swaps the JSON parser for a raw-buffer one so the
 * webhook can verify its signature, and Fastify applies that parser to every
 * route in the plugin. /validate read `request.body.transactionId` off a
 * Buffer, got undefined, and answered 400 "transactionId is required" to every
 * purchase from 3 Mar to 30 Sep 2026. Payers only became Pro when Apple's
 * webhook arrived minutes later, and the app showed them as free meanwhile
 * (Sarah Webb, 30 Sep 2026). These tests post real JSON through the route.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    appEvent: { findFirst: vi.fn() },
  },
}));
vi.mock("../../lib/push.js", () => ({ sendPushNotification: vi.fn() }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/appleConsumption.js", () => ({ respondToConsumptionRequest: vi.fn() }));
vi.mock("../../services/billingAlerts.js", () => ({ notifyBillingEvent: vi.fn() }));
vi.mock("../../services/email.js", () => ({ sendProWelcomeEmail: vi.fn() }));
vi.mock("../../services/appleIap.js", () => ({
  getAppleClient: vi.fn(() => ({})),
  getSignedDataVerifier: vi.fn(() => ({})),
  decodeNotification: vi.fn(),
  isTransactionActive: vi.fn(() => true),
  fetchTransactionWithEnvFallback: vi.fn(),
  VALID_PRODUCT_IDS: ["com.mileclear.premium.monthly", "com.mileclear.premium.annual"],
  bundleId: "com.mileclear.app",
  planFromAppleProductId: vi.fn(() => "monthly"),
}));

import { appleBillingRoutes, readTransactionId } from "../../routes/billing/apple.js";
import { prisma } from "../../lib/prisma.js";
import { fetchTransactionWithEnvFallback } from "../../services/appleIap.js";

const USER_ID = "00000000-0000-0000-0000-0000000000a1";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

async function createTestApp() {
  const app = await buildApp();
  await app.register(appleBillingRoutes, { prefix: "/billing/apple" });
  return app;
}

describe("readTransactionId", () => {
  it("reads a parsed object, a Buffer and a string", () => {
    expect(readTransactionId({ transactionId: "t1" })).toBe("t1");
    expect(readTransactionId(Buffer.from(JSON.stringify({ transactionId: "t2" })))).toBe("t2");
    expect(readTransactionId(JSON.stringify({ transactionId: "t3" }))).toBe("t3");
  });
  it("returns undefined for missing, empty, non-string or unparseable input", () => {
    expect(readTransactionId(undefined)).toBeUndefined();
    expect(readTransactionId({})).toBeUndefined();
    expect(readTransactionId({ transactionId: "" })).toBeUndefined();
    expect(readTransactionId({ transactionId: 42 })).toBeUndefined();
    expect(readTransactionId(Buffer.from("not json"))).toBeUndefined();
  });
});

describe("POST /billing/apple/validate", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValue(null as never);
    vi.mocked(prisma.user.update).mockReset().mockResolvedValue({} as never);
    vi.mocked(prisma.appEvent.findFirst).mockReset().mockResolvedValue({ id: "x" } as never);
    vi.mocked(fetchTransactionWithEnvFallback).mockReset().mockResolvedValue({
      environment: "Production",
      transaction: {
        bundleId: "com.mileclear.app",
        productId: "com.mileclear.premium.monthly",
        originalTransactionId: "orig-123",
        expiresDate: Date.now() + 30 * 86400e3,
      },
    } as never);
  });

  it("reads the transaction id from a JSON body and binds the purchase", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/billing/apple/validate",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ transactionId: "txn-999" }),
    });
    expect(res.statusCode).toBe(200);
    expect(fetchTransactionWithEnvFallback).toHaveBeenCalledWith("txn-999");
    expect(vi.mocked(prisma.user.update).mock.calls[0][0]).toMatchObject({
      where: { id: USER_ID },
      data: { isPremium: true, appleOriginalTransactionId: "orig-123" },
    });
    await app.close();
  });

  it("still answers 400 when the body really has no transaction id", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/billing/apple/validate",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    expect(fetchTransactionWithEnvFallback).not.toHaveBeenCalled();
    await app.close();
  });
});
