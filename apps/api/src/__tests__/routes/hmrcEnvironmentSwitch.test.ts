/**
 * When the server moves from HMRC's test service to the real one, connections
 * made on the test service can't work: their tokens belong to the other
 * service. They must read as not connected (so the app words itself for the
 * real service and asks the driver to connect again) and must never be used
 * for a call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    hmrcConnection: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

import { hmrcRoutes } from "../../routes/hmrc/index.js";
import { resetHmrcConfig } from "../../services/hmrc/config.js";
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
