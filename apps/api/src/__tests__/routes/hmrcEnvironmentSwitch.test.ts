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
vi.mock("../../services/hmrc/fraudPreventionHeaders.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/hmrc/fraudPreventionHeaders.js")>();
  return { ...actual, buildFraudPreventionHeaders: vi.fn(() => ({})) };
});
vi.mock("../../lib/encryption.js", () => ({ encrypt: (v: string) => v, decryptIfEncrypted: (v: string) => v }));
vi.mock("../../middleware/premium.js", () => ({ premiumMiddleware: vi.fn(async () => {}) }));

import { hmrcRoutes } from "../../routes/hmrc/index.js";
import { resetHmrcConfig, getHmrcConfigForUser } from "../../services/hmrc/config.js";
import { hmrcCall, HmrcNotConnectedError } from "../../services/hmrc/client.js";
import { prisma } from "../../lib/prisma.js";
import { runHmrcKeepAliveJob } from "../../jobs/hmrcKeepAlive.js";

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

  it("fails closed, warning once, when the test client is missing: never the live service", async () => {
    delete process.env.HMRC_SANDBOX_CLIENT_ID;
    resetHmrcConfig();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getHmrcConfigForUser(USER_ID)).toBeNull();
    expect(getHmrcConfigForUser(USER_ID)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    // Everyone else is untouched.
    expect(getHmrcConfigForUser(OTHER_ID)?.environment).toBe("production");

    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("production") as never);
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    expect((await app.inject({ method: "GET", url: "/hmrc/status", headers: auth })).statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/hmrc/authorize", headers: auth })).statusCode).toBe(503);

    // Year-end writes and the balance card stay shut.
    delete process.env.HMRC_BALANCE;
    const write = await app.inject({ method: "POST", url: "/hmrc/tax-return/2025-26/submit", payload: {}, headers: auth });
    expect(write.statusCode).toBe(403);
    expect(write.json().code).toBe("YEAR_END_NOT_LIVE");
    const balance = await app.inject({ method: "GET", url: "/hmrc/balance", headers: auth });
    expect(balance.json().data).toEqual({ available: false, balance: null });

    // And nothing is sent to HMRC at all.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      hmrcCall({ userId: USER_ID, method: "GET", path: "/x", apiVersion: "2.0", client: {} as never, server: {} as never }),
    ).rejects.toBeInstanceOf(HmrcNotConnectedError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    warn.mockRestore();
  });

  it("treats a blank or whitespace list as nobody listed", () => {
    process.env.HMRC_SANDBOX_USER_IDS = " , ,  ";
    resetHmrcConfig();
    expect(getHmrcConfigForUser(USER_ID)).toMatchObject({ environment: "production", clientId: "live-client-id" });
    process.env.HMRC_SANDBOX_USER_IDS = "   ";
    resetHmrcConfig();
    expect(getHmrcConfigForUser(USER_ID)?.environment).toBe("production");
  });

  describe("on the wire", () => {
    const tokenBody = JSON.stringify({
      access_token: "new-a",
      refresh_token: "new-r",
      expires_in: 14400,
      scope: "read:self-assessment",
      token_type: "bearer",
    });
    const json = (body: string) =>
      new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    const client = { connectionMethod: "MOBILE_APP_VIA_SERVER", deviceModel: "iPhone15,2", signInIdentifier: "x@example.com" };

    async function run(userId: string, environment: "sandbox" | "production") {
      vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue({
        ...connection(environment),
        userId,
        expiresAt: new Date(Date.now() + 5_000), // expiring: forces a refresh first
      } as never);
      vi.mocked(prisma.hmrcConnection.update).mockResolvedValue({ id: "conn-1", expiresAt: new Date(Date.now() + 3_600_000) } as never);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
        String(input).endsWith("/oauth/token") ? json(tokenBody) : json("{}"),
      );
      await hmrcCall({ userId, method: "GET", path: "/individuals/test", apiVersion: "1.0", client: client as never, server: {} as never });
      const calls = fetchSpy.mock.calls.map(([u, init]) => ({ url: String(u), body: String((init as RequestInit)?.body ?? "") }));
      fetchSpy.mockRestore();
      return calls;
    }

    it("sends a listed account's refresh and API call to the test service with the test client", async () => {
      const calls = await run(USER_ID, "sandbox");
      expect(calls).toHaveLength(2);
      expect(calls[0].url).toBe("https://test-api.service.hmrc.gov.uk/oauth/token");
      expect(calls[0].body).toContain("client_id=test-service-client-id");
      expect(calls[0].body).toContain("client_secret=test-service-client-secret");
      expect(calls[1].url).toBe("https://test-api.service.hmrc.gov.uk/individuals/test");
    });

    it("sends everyone else's refresh and API call to the real service with the real client", async () => {
      const calls = await run(OTHER_ID, "production");
      expect(calls).toHaveLength(2);
      expect(calls[0].url).toBe("https://api.service.hmrc.gov.uk/oauth/token");
      expect(calls[0].body).toContain("client_id=live-client-id");
      expect(calls[1].url).toBe("https://api.service.hmrc.gov.uk/individuals/test");
    });
  });

  it("keep-alive pings the test-service app only when its credentials are set", async () => {
    const spy = () =>
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
        String(input).endsWith("/oauth/token")
          ? new Response(JSON.stringify({ access_token: "t" }), { status: 200 })
          : new Response("{}", { status: 200 }),
      );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    let f = spy();
    await runHmrcKeepAliveJob();
    expect(f.mock.calls.some(([u]) => String(u).startsWith("https://test-api."))).toBe(true);
    expect(f.mock.calls.some(([u]) => String(u).startsWith("https://api.service."))).toBe(true);
    f.mockRestore();

    delete process.env.HMRC_SANDBOX_CLIENT_SECRET;
    resetHmrcConfig();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    f = spy();
    await runHmrcKeepAliveJob();
    expect(f.mock.calls.length).toBeGreaterThan(0);
    expect(f.mock.calls.every(([u]) => String(u).startsWith("https://api.service."))).toBe(true);
    f.mockRestore();
    warn.mockRestore();
    log.mockRestore();
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

    // The listed account gets past both gates (the real success paths are in
    // hmrcTaxReturn.test.ts, where HMRC calls are mocked).
    const listed = await app.inject({ method: "POST", url: "/hmrc/tax-return/2025-26/submit", payload: {}, headers: auth });
    expect(listed.json().code).not.toBe("YEAR_END_NOT_LIVE");
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(null as never);
    const listedBalance = await app.inject({ method: "GET", url: "/hmrc/balance", headers: auth });
    expect(listedBalance.json().data).not.toEqual({ available: false, balance: null });
  });
});

describe("HMRC callback error page", () => {
  it("escapes what HMRC (or anyone) puts in the query and locks the page down", async () => {
    process.env.HMRC_CLIENT_ID = "test-client-id";
    process.env.HMRC_CLIENT_SECRET = "test-client-secret";
    process.env.HMRC_ENVIRONMENT = "production";
    resetHmrcConfig();
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const evil = `<script>alert(1)</script><img src=x onerror="a('b')">&`;
    for (const q of [`error=access_denied&error_description=${encodeURIComponent(evil)}`, `error=${encodeURIComponent(evil)}`]) {
      const res = await app.inject({ method: "GET", url: `/hmrc/callback?${q}` });
      expect(res.statusCode).toBe(400);
      expect(res.body).not.toContain("<script>");
      expect(res.body).not.toContain("<img");
      expect(res.body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(res.body).toContain("&amp;");
      expect(res.headers["content-security-policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'");
    }
  });
});
