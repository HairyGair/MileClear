/**
 * "My bank isn't listed" (24 Oct 2026, Jason Clarke and the Co-operative
 * Bank). Any signed-in driver can send it, Pro or not, as the bank list
 * shows before the paywall. It only records the bank's name.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../middleware/idempotency.js", () => ({ attachIdempotency: vi.fn() }));
vi.mock("../../lib/truelayer.js", () => ({ truelayerEnabled: true }));
vi.mock("../../services/proEntitlement.js", () => ({ isProUser: vi.fn().mockResolvedValue(false) }));
vi.mock("../../services/openBanking.js", () => ({}));

import { earningRoutes } from "../../routes/earnings/index.js";
import { logEvent } from "../../services/appEvents.js";

const USER = "00000000-0000-0000-0000-0000000000b2";

async function send(body: unknown, auth = true) {
  const a = await buildApp();
  await a.register(earningRoutes, { prefix: "/earnings" });
  await a.ready();
  const res = await a.inject({
    method: "POST",
    url: "/earnings/open-banking/missing-bank",
    headers: auth ? { authorization: `Bearer ${makeAccessToken(USER)}` } : {},
    payload: body as object,
  });
  await a.close();
  return res;
}

function missing() {
  return vi.mocked(logEvent).mock.calls.filter((c) => c[0] === "earnings.open_banking_bank_missing");
}

beforeEach(() => vi.clearAllMocks());

describe("POST /earnings/open-banking/missing-bank", () => {
  it("records the bank for a free driver, spaces tidied", async () => {
    const res = await send({ bank: "  Co-operative   Bank " });
    expect(res.statusCode).toBe(200);
    expect(missing()).toEqual([["earnings.open_banking_bank_missing", USER, { bank: "Co-operative Bank" }]]);
  });

  it("refuses a name that is too short or too long", async () => {
    expect((await send({ bank: " a " })).statusCode).toBe(400);
    expect((await send({ bank: "x".repeat(81) })).statusCode).toBe(400);
    expect((await send({})).statusCode).toBe(400);
    expect(missing()).toEqual([]);
  });

  it("needs a signed-in driver", async () => {
    expect((await send({ bank: "Co-operative Bank" }, false)).statusCode).toBe(401);
    expect(missing()).toEqual([]);
  });
});
