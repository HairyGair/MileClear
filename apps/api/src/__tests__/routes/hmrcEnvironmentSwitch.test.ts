/**
 * When the server moves from HMRC's test service to the real one, connections
 * made on the test service can't work: their tokens belong to the other
 * service. They must read as not connected (so the app words itself for the
 * real service and asks the driver to connect again) and must never be used
 * for a call.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    hmrcConnection: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: (v: string) => v, decryptIfEncrypted: (v: string) => v }));
vi.mock("../../middleware/premium.js", () => ({ premiumMiddleware: vi.fn(async () => {}) }));

import { hmrcRoutes } from "../../routes/hmrc/index.js";
import { resetHmrcConfig, getHmrcConfigForUser } from "../../services/hmrc/config.js";
import { hmrcCall, HmrcNotConnectedError } from "../../services/hmrc/client.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-0000000000e1";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

function connection(environment: "sandbox" | "production") {
  return {
    id: "conn-1",
    userId: USER_ID,
    accessToken: "a",
    refreshToken: "r",
    scope: "read:self-assessment write:self-assessment",
    environment,
    expiresAt: new Date(Date.now() + 3_600_000),
    connectedAt: new Date("2026-10-01T10:00:00Z"),
    disconnectedAt: null,
    nino: "enc",
    businessId: "XAIS12345678901",
  };
}

describe("HMRC connections from the other service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HMRC_CLIENT_ID = "test-client-id";
    process.env.HMRC_CLIENT_SECRET = "test-client-secret";
    process.env.HMRC_ENVIRONMENT = "production";
    process.env.HMRC_REDIRECT_URI = "https://api.example.com/hmrc/callback";
    resetHmrcConfig();
  });

  it("reports a test-service connection as not connected on the real service", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("sandbox") as never);
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const res = await app.inject({ method: "GET", url: "/hmrc/status", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ connected: false, environment: "production" });
  });

  it("reports a real-service connection as connected", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("production") as never);
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const res = await app.inject({ method: "GET", url: "/hmrc/status", headers: auth });
    expect(res.json().data).toMatchObject({ connected: true, environment: "production" });
  });

  it("never calls HMRC with a test-service connection", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("sandbox") as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      hmrcCall({ userId: USER_ID, method: "GET", path: "/individuals/business/details/AA123456A/list", apiVersion: "2.0", client: {} as never }),
    ).rejects.toBeInstanceOf(HmrcNotConnectedError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("HMRC's not-signed-up refusal", () => {
  it("is passed on with its code and a plain explanation", async () => {
    const { handleHmrcError, NOT_SIGNED_UP_MESSAGE } = await import("../../routes/hmrc/index.js");
    const { HmrcError } = await import("../../services/hmrc/client.js");
    let status = 0;
    let body: unknown = null;
    const reply = {
      status(code: number) { status = code; return this; },
      send(b: unknown) { body = b; return this; },
    };
    handleHmrcError(reply as never, new HmrcError("The client and/or agent is not authorised", 403, "CLIENT_OR_AGENT_NOT_AUTHORISED", null));
    expect(status).toBe(403);
    expect(body).toEqual({ error: { code: "CLIENT_OR_AGENT_NOT_AUTHORISED", message: NOT_SIGNED_UP_MESSAGE, retryable: false } });
    expect(NOT_SIGNED_UP_MESSAGE).not.toMatch(/[–—]/);
  });
});

// The App Review demo account uses HMRC's test service; everyone else stays on
// the real one.
describe("HMRC test service for listed accounts", () => {
  const OTHER_ID = "00000000-0000-0000-0000-0000000000e2";
  const otherAuth = { authorization: `Bearer ${makeAccessToken(OTHER_ID)}` };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HMRC_CLIENT_ID = "live-client-id";
    process.env.HMRC_CLIENT_SECRET = "live-client-secret";
    process.env.HMRC_ENVIRONMENT = "production";
    process.env.HMRC_REDIRECT_URI = "https://api.example.com/hmrc/callback";
    process.env.HMRC_SANDBOX_USER_IDS = `x-other, ${USER_ID}`;
    process.env.HMRC_SANDBOX_CLIENT_ID = "test-service-client-id";
    process.env.HMRC_SANDBOX_CLIENT_SECRET = "test-service-client-secret";
    resetHmrcConfig();
  });

  afterAll(() => {
    delete process.env.HMRC_SANDBOX_USER_IDS;
    delete process.env.HMRC_SANDBOX_CLIENT_ID;
    delete process.env.HMRC_SANDBOX_CLIENT_SECRET;
    resetHmrcConfig();
  });

  it("gives a listed account the test service and its own client, others the real one", () => {
    expect(getHmrcConfigForUser(USER_ID)).toMatchObject({
      environment: "sandbox",
      clientId: "test-service-client-id",
      apiBaseUrl: "https://test-api.service.hmrc.gov.uk",
      tokenUrl: "https://test-api.service.hmrc.gov.uk/oauth/token",
      redirectUri: "https://api.example.com/hmrc/callback",
    });
    expect(getHmrcConfigForUser(OTHER_ID)).toMatchObject({
      environment: "production",
      clientId: "live-client-id",
      apiBaseUrl: "https://api.service.hmrc.gov.uk",
    });
  });

  it("falls back to the real service, warning once, when the test client is missing", () => {
    delete process.env.HMRC_SANDBOX_CLIENT_ID;
    resetHmrcConfig();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getHmrcConfigForUser(USER_ID)?.environment).toBe("production");
    expect(getHmrcConfigForUser(USER_ID)?.environment).toBe("production");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("reports the test service in /hmrc/status for a listed account only", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(null as never);
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const listed = await app.inject({ method: "GET", url: "/hmrc/status", headers: auth });
    expect(listed.json().data).toMatchObject({ connected: false, environment: "sandbox" });
    const other = await app.inject({ method: "GET", url: "/hmrc/status", headers: otherAuth });
    expect(other.json().data).toMatchObject({ connected: false, environment: "production" });
  });

  it("counts a real-service connection as not connected for a listed account", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("production") as never);
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const res = await app.inject({ method: "GET", url: "/hmrc/status", headers: auth });
    expect(res.json().data).toMatchObject({ connected: false, environment: "sandbox" });
  });

  it("builds the authorize link on the test service with the test client", async () => {
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const res = await app.inject({ method: "GET", url: "/hmrc/authorize", headers: auth });
    const url = new URL(res.json().data.url);
    expect(url.origin).toBe("https://test-api.service.hmrc.gov.uk");
    expect(url.searchParams.get("client_id")).toBe("test-service-client-id");
    expect(vi.mocked(prisma.hmrcConnection.upsert).mock.calls[0][0].create).toMatchObject({ environment: "sandbox" });

    const other = await app.inject({ method: "GET", url: "/hmrc/authorize", headers: otherAuth });
    const otherUrl = new URL(other.json().data.url);
    expect(otherUrl.origin).toBe("https://api.service.hmrc.gov.uk");
    expect(otherUrl.searchParams.get("client_id")).toBe("live-client-id");
  });

  it("exchanges the callback code with the client of the user the state belongs to", async () => {
    vi.mocked(prisma.hmrcConnection.findFirst).mockResolvedValue({ id: "conn-1", userId: USER_ID } as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 14400, scope: "read:self-assessment", token_type: "bearer" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const res = await app.inject({ method: "GET", url: "/hmrc/callback?code=abc&state=st" });
    expect(res.statusCode).toBe(302);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://test-api.service.hmrc.gov.uk/oauth/token");
    expect(String((init as RequestInit).body)).toContain("client_id=test-service-client-id");
    expect(vi.mocked(prisma.hmrcConnection.update).mock.calls[0][0].data).toMatchObject({ environment: "sandbox" });
    fetchSpy.mockRestore();
  });

  it("opens the year-end writes and the balance for a listed account, not for others", async () => {
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    delete process.env.HMRC_BALANCE;

    const other = await app.inject({ method: "POST", url: "/hmrc/tax-return/2025-26/submit", payload: {}, headers: otherAuth });
    expect(other.statusCode).toBe(403);
    expect(other.json().code).toBe("YEAR_END_NOT_LIVE");
    const otherBalance = await app.inject({ method: "GET", url: "/hmrc/balance", headers: otherAuth });
    expect(otherBalance.json().data).toEqual({ available: false, balance: null });

    const listed = await app.inject({ method: "POST", url: "/hmrc/tax-return/2025-26/submit", payload: {}, headers: auth });
    expect(listed.json().code).not.toBe("YEAR_END_NOT_LIVE");
    // Past the "off" answer: it went on to look for the connection.
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(null as never);
    const listedBalance = await app.inject({ method: "GET", url: "/hmrc/balance", headers: auth });
    expect(listedBalance.json().data).not.toEqual({ available: false, balance: null });
  });
});
