// Helper that turns an inbound Fastify request into the ClientContext +
// ServerContext that the fraud-prevention header builder needs.
//
// Mobile and web both forward device/browser context as conventional
// X-MileClear-* headers (set by the API client wrapper, not by the user).
// On the server we add our own public/local IPs.

import type { FastifyRequest } from "fastify";
import os from "node:os";
import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";

let cachedServerLocalIp: string | null = null;

function getServerLocalIp(): string {
  if (cachedServerLocalIp) return cachedServerLocalIp;
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) {
        cachedServerLocalIp = iface.address;
        return cachedServerLocalIp;
      }
    }
  }
  cachedServerLocalIp = "127.0.0.1";
  return cachedServerLocalIp;
}

let cachedServerPublicIp: string | null = null;
let serverPublicIpFetchedAt = 0;

async function getServerPublicIp(): Promise<string> {
  // Cache for 1 hour. On Pixelish the IP is stable but a refresh is cheap.
  const ONE_HOUR = 60 * 60 * 1000;
  if (cachedServerPublicIp && Date.now() - serverPublicIpFetchedAt < ONE_HOUR) {
    return cachedServerPublicIp;
  }
  // ipify is free + reliable. Fall back to env var if we ever ban it.
  if (process.env.HMRC_SERVER_PUBLIC_IP) {
    cachedServerPublicIp = process.env.HMRC_SERVER_PUBLIC_IP;
    serverPublicIpFetchedAt = Date.now();
    return cachedServerPublicIp;
  }
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const json = (await res.json()) as { ip: string };
    cachedServerPublicIp = json.ip;
    serverPublicIpFetchedAt = Date.now();
    return cachedServerPublicIp;
  } catch {
    // Last resort: known Pixelish IP (per memory).
    return "85.234.151.224";
  }
}

export async function buildServerContext(): Promise<ServerContext> {
  return {
    serverPublicIp: await getServerPublicIp(),
    serverLocalIp: getServerLocalIp(),
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Extract the ClientContext from a Fastify request's headers. Mobile sends
 * X-MileClear-Device-Id, X-MileClear-User-Agent, X-MileClear-Screen-Width
 * etc; web sends a simpler subset. Falls back to sensible defaults when
 * a header is missing so dev/test calls don't crash — production headers
 * are validated by HMRC's Test Fraud Prevention Headers API.
 */
export function buildClientContext(request: FastifyRequest): ClientContext {
  const h = request.headers;
  const get = (k: string): string | undefined => {
    const v = h[k.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };

  const platform = (get("x-mileclear-platform") ?? "").toLowerCase();
  const ip =
    get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.ip ??
    "0.0.0.0";

  if (platform === "ios" || platform === "android") {
    return {
      connectionMethod: "MOBILE_APP_VIA_SERVER",
      deviceId: get("x-mileclear-device-id") ?? "unknown-device",
      publicIp: ip,
      userAgent: get("x-mileclear-user-agent") ?? get("user-agent") ?? "MileClear/1.x",
      osFamily: platform === "ios" ? "iOS" : "Android",
      screenWidth: parseInt(get("x-mileclear-screen-width") ?? "1170", 10),
      screenHeight: parseInt(get("x-mileclear-screen-height") ?? "2532", 10),
      language: get("x-mileclear-language") ?? "en-GB",
      deviceTimezone: get("x-mileclear-timezone") ?? "Europe/London",
      timezoneOffset: get("x-mileclear-timezone-offset") ?? "+0100",
      vendorIdentifier: get("x-mileclear-vendor-id"),
    };
  }

  return {
    connectionMethod: "WEB_APP_VIA_SERVER",
    publicIp: ip,
    userAgent: get("user-agent") ?? "Mozilla/5.0",
    windowWidth: parseInt(get("x-mileclear-window-width") ?? "1440", 10),
    windowHeight: parseInt(get("x-mileclear-window-height") ?? "900", 10),
    language: get("accept-language")?.split(",")[0] ?? "en-GB",
    timezone: get("x-mileclear-timezone") ?? "Europe/London",
  };
}
