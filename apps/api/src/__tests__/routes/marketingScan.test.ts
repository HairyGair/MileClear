/**
 * QR scans are recorded only when the website reports them from this machine.
 * Anything through Apache carries X-Forwarded-For and is refused, so the
 * billboard count can't be inflated from outside (1 Oct 2026).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";

vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

import { marketingRoutes, isLocalDirectCall } from "../../routes/marketing/index.js";
import { logEvent } from "../../services/appEvents.js";

async function createTestApp() {
  const app = await buildApp();
  await app.register(marketingRoutes, { prefix: "/marketing" });
  return app;
}

describe("isLocalDirectCall", () => {
  it("accepts a loopback call with no proxy header", () => {
    expect(isLocalDirectCall({ headers: {}, remoteAddress: "127.0.0.1" })).toBe(true);
    expect(isLocalDirectCall({ headers: {}, remoteAddress: "::ffff:127.0.0.1" })).toBe(true);
  });
  it("refuses anything that came through the proxy, even claiming loopback", () => {
    expect(isLocalDirectCall({ headers: { "x-forwarded-for": "127.0.0.1" }, remoteAddress: "127.0.0.1" })).toBe(false);
  });
  it("refuses a non-local address", () => {
    expect(isLocalDirectCall({ headers: {}, remoteAddress: "203.0.113.5" })).toBe(false);
  });
});

describe("POST /marketing/scan", () => {
  beforeEach(() => vi.mocked(logEvent).mockReset());

  it("records a scan from the website", async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/marketing/scan", payload: { link: "app", store: "android" }, remoteAddress: "127.0.0.1" });
    expect(res.statusCode).toBe(204);
    expect(logEvent).toHaveBeenCalledWith("marketing.qr_scan", null, { link: "app", store: "android" });
    await app.close();
  });

  it("refuses a proxied request", async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/marketing/scan", payload: { link: "app", store: "ios" }, remoteAddress: "127.0.0.1", headers: { "x-forwarded-for": "198.51.100.7" } });
    expect(res.statusCode).toBe(403);
    expect(logEvent).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuses a malformed report", async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/marketing/scan", payload: { link: "elsewhere", store: "ios" }, remoteAddress: "127.0.0.1" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
