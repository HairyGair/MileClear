/**
 * Open Banking link flow (17 Oct 2026). The callback now exchanges the code
 * itself, trusting only the signed single-use state, and logs every outcome:
 * before this, a driver coming back from their bank's app landed in Safari
 * without the token the page needed, and nothing at all was recorded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: { plaidConnection: { findFirst: vi.fn() } },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../middleware/idempotency.js", () => ({ attachIdempotency: vi.fn() }));
vi.mock("../../lib/truelayer.js", () => ({
  truelayerEnabled: true,
  TRUELAYER_AUTH_BASE: "https://auth.truelayer-sandbox.com",
}));
vi.mock("../../services/proEntitlement.js", () => ({ isProUser: vi.fn() }));
vi.mock("../../services/openBanking.js", () => ({
  buildAuthLink: vi.fn(
    (state: string) => `https://auth.truelayer-sandbox.com/?state=${encodeURIComponent(state)}`
  ),
  exchangeCode: vi.fn(),
  syncTransactions: vi.fn(),
  getConnections: vi.fn(),
  disconnectConnection: vi.fn(),
}));

import { earningRoutes } from "../../routes/earnings/index.js";
import { logEvent } from "../../services/appEvents.js";
import { isProUser } from "../../services/proEntitlement.js";
import { exchangeCode } from "../../services/openBanking.js";
import { prisma } from "../../lib/prisma.js";
import { invalidatePremiumCache } from "../../middleware/premium.js";
import {
  issueOpenBankingState,
  STATE_TTL_MS,
  _resetUsedOpenBankingStates,
} from "../../lib/openBankingState.js";

const USER = "00000000-0000-0000-0000-0000000000a1";

async function app() {
  const a = await buildApp();
  await a.register(earningRoutes, { prefix: "/earnings" });
  await a.ready();
  return a;
}

function events(name: string) {
  return vi.mocked(logEvent).mock.calls.filter((c) => c[0] === name);
}

async function callback(query: string) {
  const a = await app();
  const res = await a.inject({ method: "GET", url: `/earnings/open-banking/callback?${query}` });
  await a.close();
  return res;
}

function q(state: string, code = "auth-code-1") {
  return `code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
}

beforeEach(async () => {
  vi.clearAllMocks();
  _resetUsedOpenBankingStates();
  await invalidatePremiumCache(USER);
  vi.mocked(isProUser).mockResolvedValue(true);
  vi.mocked(exchangeCode).mockResolvedValue({
    id: "conn-1",
    institutionName: "Monzo",
    status: "active",
  });
  vi.mocked(prisma.plaidConnection.findFirst).mockResolvedValue(null as never);
});

describe("POST /open-banking/link-token", () => {
  it("issues a signed state for the signed-in Pro driver", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/earnings/open-banking/link-token?return=web",
      headers: { authorization: `Bearer ${makeAccessToken(USER)}` },
    });
    await a.close();
    expect(res.statusCode).toBe(200);
    const link = new URL(res.json().data.authLink);
    const state = link.searchParams.get("state")!;
    expect(state.startsWith("v1.")).toBe(true);

    // And that state completes the flow for that driver, back to the website.
    const done = await callback(q(state));
    expect(done.body).toContain('data-outcome="connected"');
    expect(done.body).toContain("https://mileclear.com/dashboard/bank");
    expect(vi.mocked(exchangeCode)).toHaveBeenCalledWith(USER, "auth-code-1");
  });

  it("refuses a driver who is not Pro", async () => {
    vi.mocked(isProUser).mockResolvedValue(false);
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/earnings/open-banking/link-token",
      headers: { authorization: `Bearer ${makeAccessToken(USER)}` },
    });
    await a.close();
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /open-banking/callback", () => {
  it("exchanges the code on the server and logs open_banking_connected", async () => {
    const res = await callback(q(issueOpenBankingState(USER, "app")));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toContain('data-outcome="connected"');
    expect(res.body).toContain('href="mileclear://open-banking"');
    expect(res.body).not.toContain("sessionStorage");
    expect(vi.mocked(exchangeCode)).toHaveBeenCalledWith(USER, "auth-code-1");
    expect(events("earnings.open_banking_connected")).toEqual([
      ["earnings.open_banking_connected", USER, { connectionId: "conn-1", institution: "Monzo", via: "callback" }],
    ]);
    expect(events("earnings.open_banking_callback")[0][1]).toBe(USER);
  });

  it("refuses a replayed state and logs state_invalid replayed", async () => {
    const state = issueOpenBankingState(USER, "app");
    await callback(q(state));
    vi.mocked(exchangeCode).mockClear();
    const res = await callback(q(state, "auth-code-2"));
    expect(res.body).toContain('data-outcome="replayed"');
    expect(vi.mocked(exchangeCode)).not.toHaveBeenCalled();
    expect(events("earnings.open_banking_state_invalid")).toEqual([
      ["earnings.open_banking_state_invalid", USER, { reason: "replayed" }],
    ]);
  });

  it("a reload after it worked says the bank is linked, without exchanging again", async () => {
    const state = issueOpenBankingState(USER, "app");
    await callback(q(state));
    vi.mocked(exchangeCode).mockClear();
    vi.mocked(prisma.plaidConnection.findFirst).mockResolvedValue({ id: "conn-1" } as never);
    const res = await callback(q(state));
    expect(res.body).toContain('data-outcome="connected"');
    expect(vi.mocked(exchangeCode)).not.toHaveBeenCalled();
  });

  it("refuses an expired state and logs state_invalid expired", async () => {
    const state = issueOpenBankingState(USER, "app", Date.now() - STATE_TTL_MS - 1000);
    const res = await callback(q(state));
    expect(res.body).toContain('data-outcome="expired"');
    expect(vi.mocked(exchangeCode)).not.toHaveBeenCalled();
    expect(events("earnings.open_banking_state_invalid")).toEqual([
      ["earnings.open_banking_state_invalid", USER, { reason: "expired" }],
    ]);
  });

  it("refuses a tampered state naming another driver, unattributed", async () => {
    const state = issueOpenBankingState(USER, "app");
    const [v, p, sig] = state.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    payload.u = "00000000-0000-0000-0000-0000000000b2";
    const forged = `${v}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    const res = await callback(q(forged));
    expect(res.body).toContain('data-outcome="bad_state"');
    expect(vi.mocked(exchangeCode)).not.toHaveBeenCalled();
    expect(events("earnings.open_banking_state_invalid")).toEqual([
      ["earnings.open_banking_state_invalid", null, { reason: "bad_signature" }],
    ]);
    expect(events("earnings.open_banking_callback")[0][1]).toBeNull();
  });

  it("refuses the old unsigned state", async () => {
    const old = Buffer.from(JSON.stringify({ userId: USER, ts: Date.now() })).toString("base64url");
    const res = await callback(q(old));
    expect(res.body).toContain('data-outcome="bad_state"');
    expect(vi.mocked(exchangeCode)).not.toHaveBeenCalled();
    expect(events("earnings.open_banking_state_invalid")[0][2]).toEqual({ reason: "bad_signature" });
  });

  it("refuses a code with no state and logs state_invalid missing", async () => {
    const res = await callback("code=abc");
    expect(res.body).toContain('data-outcome="bad_state"');
    // Unknown origin: offer both the app and the website.
    expect(res.body).toContain("mileclear://open-banking");
    expect(res.body).toContain("https://mileclear.com/dashboard/bank");
    expect(events("earnings.open_banking_state_invalid")[0][2]).toEqual({ reason: "missing" });
  });

  it("does not exchange for a driver who is no longer Pro, and logs not_premium", async () => {
    vi.mocked(isProUser).mockResolvedValue(false);
    const res = await callback(q(issueOpenBankingState(USER, "app")));
    expect(res.body).toContain('data-outcome="not_premium"');
    expect(vi.mocked(exchangeCode)).not.toHaveBeenCalled();
    expect(events("earnings.open_banking_not_premium")).toEqual([
      ["earnings.open_banking_not_premium", USER],
    ]);
  });

  it("logs exchange_failed with a reason when TrueLayer refuses the code", async () => {
    vi.mocked(exchangeCode).mockRejectedValue(new Error("TrueLayer token exchange failed: 400 invalid_grant"));
    const res = await callback(q(issueOpenBankingState(USER, "web")));
    expect(res.body).toContain('data-outcome="exchange_failed"');
    expect(res.body).toContain("https://mileclear.com/dashboard/bank");
    const failed = events("earnings.open_banking_exchange_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0][1]).toBe(USER);
    expect(failed[0][2]).toMatchObject({ reason: "exchange_error" });
  });

  it("names a bank that belongs to another account", async () => {
    vi.mocked(exchangeCode).mockRejectedValue(new Error("This bank connection belongs to another account"));
    await callback(q(issueOpenBankingState(USER, "app")));
    expect(events("earnings.open_banking_exchange_failed")[0][2]).toMatchObject({ reason: "another_account" });
  });

  it("a cancel at the bank uses nothing up and shows our own words only", async () => {
    const state = issueOpenBankingState(USER, "app");
    const res = await callback(`error=${encodeURIComponent("<script>alert(1)</script>")}&state=${encodeURIComponent(state)}`);
    expect(res.body).toContain('data-outcome="cancelled"');
    expect(res.body).not.toContain("<script>alert(1)");
    expect(vi.mocked(exchangeCode)).not.toHaveBeenCalled();
    expect(events("earnings.open_banking_callback")[0]).toEqual([
      "earnings.open_banking_callback",
      USER,
      { outcome: "error", error: "<script>alert(1)</script>" },
    ]);
    // The same state still works if they then go through with it.
    const done = await callback(q(state));
    expect(done.body).toContain('data-outcome="connected"');
  });

  it("needs no Authorization header", async () => {
    const res = await callback(q(issueOpenBankingState(USER, "app")));
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /open-banking/link (old app builds)", () => {
  it("redirects to TrueLayer and ignores the token old builds send", async () => {
    const authLink = "https://auth.truelayer-sandbox.com/?response_type=code&state=v1.x.y";
    const a = await app();
    const res = await a.inject({
      method: "GET",
      url: `/earnings/open-banking/link?authLink=${encodeURIComponent(authLink)}&token=eyJ.old.jwt`,
    });
    await a.close();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(authLink);
    expect(res.body).not.toContain("eyJ.old.jwt");
  });

  it("also takes the website's old return=web form", async () => {
    const authLink = "https://auth.truelayer-sandbox.com/?state=abc";
    const a = await app();
    const res = await a.inject({
      method: "GET",
      url: `/earnings/open-banking/link?authLink=${encodeURIComponent(authLink)}&token=t&return=web`,
    });
    await a.close();
    expect(res.statusCode).toBe(302);
  });

  it("refuses anything that is not TrueLayer (no open redirect)", async () => {
    const a = await app();
    for (const bad of [
      "https://evil.example/",
      "javascript:alert(1)",
      "http://auth.truelayer-sandbox.com/",
      "https://auth.truelayer-sandbox.com.evil.example/",
      "https://user@evil.example/",
      "",
    ]) {
      const res = await a.inject({
        method: "GET",
        url: `/earnings/open-banking/link?authLink=${encodeURIComponent(bad)}`,
      });
      expect(res.statusCode).toBe(400);
    }
    await a.close();
  });
});
