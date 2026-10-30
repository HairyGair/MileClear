/**
 * The HMRC submission trail (hmrc.submission) and the production error alert.
 *
 * Fake NINO and email only: the repo is public.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    hmrcConnection: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/discord.js", () => ({ postFounderAlert: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { postFounderAlert } from "../../services/discord.js";
import {
  hmrcCall,
  resetHmrcConfig,
  shouldAlertHmrcError,
  endpointLabel,
  alertHmrcError,
  resetHmrcAlertThrottle,
  HMRC_SUBMISSION_EVENT,
  HmrcError,
  type MobileClientContext,
} from "../../services/hmrc/index.js";

const NINO = "AA123456A"; // test value, not a real person
const EMAIL = "driver@example.com";
const USER = "11111111-1111-1111-1111-111111111111";
const PATH = `/individuals/business/self-employment/${NINO}/XAIS12345678901/cumulative/2026-27`;

const client: MobileClientContext = {
  connectionMethod: "MOBILE_APP_VIA_SERVER",
  deviceId: "device-uuid-1",
  appVersion: "1.3.13",
  publicIp: "5.6.7.8",
  publicIpTimestamp: "2026-10-11T10:00:00.000Z",
  publicPort: "54321",
  osFamily: "iOS",
  osVersion: "18.1",
  deviceManufacturer: "Apple",
  deviceModel: "iPhone15,2",
  screenWidth: 1170,
  screenHeight: 2532,
  scalingFactor: 3,
  colourDepth: 24,
  language: "en-GB",
  timezone: "Europe/London",
  timezoneOffset: "UTC+01:00",
};
const server = { serverPublicIp: "1.2.3.4", serverLocalIp: "10.0.0.1", receivedAt: "2026-10-11T10:00:00.000Z" };

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function connection(environment: "sandbox" | "production") {
  return {
    id: "conn-1",
    userId: USER,
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    environment,
    disconnectedAt: null,
  };
}

function respond(status: number, body: unknown, correlationId = "corr-123") {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "X-CorrelationId": correlationId, "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

function submissionEvents() {
  return vi.mocked(logEvent).mock.calls.filter((c) => c[0] === HMRC_SUBMISSION_EVENT);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHmrcAlertThrottle();
  process.env.HMRC_CLIENT_ID = "test-client-id";
  process.env.HMRC_CLIENT_SECRET = "test-client-secret";
  process.env.HMRC_ENVIRONMENT = "production";
  resetHmrcConfig();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: EMAIL } as never);
});

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  resetHmrcConfig();
});

describe("submission trail", () => {
  it("records a rejected update with HMRC's code and correlation id, and no NINO", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("production") as never);
    respond(422, { code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", message: "Bad body" });

    await expect(
      hmrcCall({
        userId: USER,
        method: "PUT",
        path: PATH,
        apiVersion: "5.0",
        body: {},
        client,
        server,
        audit: { operation: "period_submit", taxYear: "2026-27", periodStart: "2026-04-06", periodEnd: "2026-10-05" },
      })
    ).rejects.toBeInstanceOf(HmrcError);

    const rows = submissionEvents();
    expect(rows).toHaveLength(1);
    const [, userId, meta] = rows[0];
    expect(userId).toBe(USER);
    expect(meta).toMatchObject({
      operation: "period_submit",
      taxYear: "2026-27",
      periodEnd: "2026-10-05",
      environment: "production",
      ok: false,
      httpStatus: 422,
      hmrcCode: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
      correlationId: "corr-123",
      appVersion: "1.3.13",
    });
    expect(JSON.stringify(meta)).not.toContain(NINO);

    // Every logged event, not just the trail, is NINO-free.
    for (const call of vi.mocked(logEvent).mock.calls) expect(JSON.stringify(call)).not.toContain(NINO);
  });

  it("records a successful update as ok", async () => {
    // A sandbox connection only works while the server is on the test service.
    process.env.HMRC_ENVIRONMENT = "sandbox";
    resetHmrcConfig();
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("sandbox") as never);
    respond(204, undefined, "corr-ok");

    await hmrcCall({
      userId: USER,
      method: "PUT",
      path: PATH,
      apiVersion: "5.0",
      body: {},
      client,
      server,
      audit: { operation: "period_amend", taxYear: "2026-27" },
    });

    const [, , meta] = submissionEvents()[0];
    expect(meta).toMatchObject({ operation: "period_amend", environment: "sandbox", ok: true, correlationId: "corr-ok" });
    expect(postFounderAlert).not.toHaveBeenCalled();
  });

  it("does not record reads", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("production") as never);
    respond(200, { obligations: [] });
    await hmrcCall({ userId: USER, method: "GET", path: `/obligations/details/${NINO}/income-and-expenditure`, apiVersion: "3.0", client, server });
    expect(submissionEvents()).toHaveLength(0);
  });

  it("records an update refused before it reached HMRC (an old app that can't name the phone)", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("production") as never);
    respond(200, {});
    await expect(
      hmrcCall({
        userId: USER,
        method: "PUT",
        path: PATH,
        apiVersion: "5.0",
        body: {},
        client: { ...client, deviceModel: undefined },
        server,
        audit: { operation: "period_submit", taxYear: "2026-27" },
      })
    ).rejects.toBeInstanceOf(HmrcError);
    const [, , meta] = submissionEvents()[0];
    expect(meta).toMatchObject({ ok: false, hmrcCode: "DEVICE_MODEL_UNAVAILABLE", correlationId: null });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("Discord alert on HMRC errors", () => {
  it("alerts on a production error with no NINO and no email", async () => {
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(connection("production") as never);
    respond(500, { code: "INTERNAL_SERVER_ERROR", message: "boom" });
    await expect(
      hmrcCall({ userId: USER, method: "PUT", path: PATH, apiVersion: "5.0", body: {}, client, server })
    ).rejects.toBeInstanceOf(HmrcError);

    expect(postFounderAlert).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(postFounderAlert).mock.calls[0][0];
    expect(arg.severity).toBe("critical");
    expect(arg.userId).toBe(USER);
    const text = JSON.stringify(arg);
    expect(text).toContain("INTERNAL_SERVER_ERROR");
    expect(text).toContain("corr-123");
    expect(text).not.toContain(NINO);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain("XAIS12345678901");
  });

  it("stays quiet for sandbox errors and for a read that finds nothing", () => {
    expect(shouldAlertHmrcError({ environment: "sandbox", method: "PUT", httpStatus: 422 })).toBe(false);
    expect(shouldAlertHmrcError({ environment: "production", method: "GET", httpStatus: 404 })).toBe(false);
    expect(shouldAlertHmrcError({ environment: "production", method: "PUT", httpStatus: 404 })).toBe(true);
    expect(shouldAlertHmrcError({ environment: "production", method: "GET", httpStatus: 403 })).toBe(true);
  });

  it("posts the same error once per 10 minutes", () => {
    const args = {
      userId: USER,
      environment: "production" as const,
      method: "PUT",
      path: PATH,
      httpStatus: 422,
      hmrcCode: "RULE_X",
      correlationId: "c",
    };
    expect(alertHmrcError({ ...args, now: 0 })).toBe(true);
    expect(alertHmrcError({ ...args, now: 5 * 60 * 1000 })).toBe(false);
    expect(alertHmrcError({ ...args, now: 11 * 60 * 1000 })).toBe(true);
  });

  it("labels the endpoint without the NINO or the business id", () => {
    expect(endpointLabel(PATH)).toBe("/individuals/business/self-employment/:nino/:id/cumulative/2026-27");
  });
});
