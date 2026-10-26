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
import { readPurchaseSource } from "../../routes/billing/validateBody.js";
import { logEvent } from "../../services/appEvents.js";
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

describe("readPurchaseSource", () => {
  it("reads a short plain label from any body shape", () => {
    expect(readPurchaseSource({ source: "Journey Map" })).toBe("Journey Map");
    expect(readPurchaseSource(Buffer.from(JSON.stringify({ source: "5th_trip" })))).toBe("5th_trip");
    expect(readPurchaseSource(JSON.stringify({ source: "self-assessment" }))).toBe("self-assessment");
  });
  it("drops missing, odd or long values", () => {
    expect(readPurchaseSource({})).toBeNull();
    expect(readPurchaseSource({ source: 7 })).toBeNull();
    expect(readPurchaseSource({ source: "" })).toBeNull();
    expect(readPurchaseSource({ source: "<script>" })).toBeNull();
    expect(readPurchaseSource({ source: "x".repeat(65) })).toBeNull();
    expect(readPurchaseSource(Buffer.from("not json"))).toBeNull();
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

  it("logs what led to the purchase and whether the subscription is new to this account", async () => {
    vi.mocked(logEvent).mockReset();
    const app = await createTestApp();
    await app.inject({
      method: "POST",
      url: "/billing/apple/validate",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ transactionId: "txn-1", source: "exports" }),
    });
    expect(logEvent).toHaveBeenCalledWith("billing.apple_iap_validated", USER_ID, {
      originalTransactionId: "orig-123",
      source: "exports",
      newLink: true,
    });

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: USER_ID } as never);
    vi.mocked(logEvent).mockReset();
    await app.inject({
      method: "POST",
      url: "/billing/apple/validate",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ transactionId: "txn-1" }),
    });
    expect(logEvent).toHaveBeenCalledWith("billing.apple_iap_validated", USER_ID, {
      originalTransactionId: "orig-123",
      source: null,
      newLink: false,
    });
    await app.close();
  });
});
