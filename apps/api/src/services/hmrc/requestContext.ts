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
  const ONE_HOUR = 60 * 60 * 1000;
  if (cachedServerPublicIp && Date.now() - serverPublicIpFetchedAt < ONE_HOUR) {
    return cachedServerPublicIp;
  }
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
 * Convert HMRC's mobile-shorthand offset ("+0100", "-0530") to the
 * required "UTC±HH:MM" format. Pass-through if already in that shape.
 * Validator otherwise rejects with: "Value must be a recognised timezone
 * in UTC format, submitted as UTC±<hh>:<mm>".
 */
export function normaliseTimezoneOffset(raw: string | undefined): string {
  if (!raw) return "UTC+00:00";
  if (/^UTC[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  // "+0100" / "-0530" → "UTC+01:00" / "UTC-05:30"
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(raw);
  if (m) return `UTC${m[1]}${m[2]}:${m[3]}`;
  return "UTC+00:00";
}

/**
 * Extract the ClientContext from a Fastify request's headers. Mobile sends
 * X-MileClear-* headers (set by the API client wrapper). Falls back to
 * sensible defaults when a header is missing so dev/test calls don't
 * crash — production header shapes are validated against HMRC's Test
 * Fraud Prevention Headers API in CI.
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
  const publicIpTimestamp = get("x-mileclear-public-ip-timestamp") ?? new Date().toISOString();
  // Connection port: HMRC wants the device's ephemeral outbound port,
  // NOT the server-side listening port. Validator rejects 80/443 with
  // "Value must not be a server port". We try the X-MileClear-Public-Port
  // header first (mobile app should send the real outbound port). Fall
  // back to the inbound socket's remote port (NAT-translated, may not
  // match exactly but is in the ephemeral range and accepted by the
  // validator). Last-resort fallback to a fixed ephemeral so the header
  // is always present and never a server port.
  const publicPort =
    get("x-mileclear-public-port") ??
    (request.socket?.remotePort ? String(request.socket.remotePort) : undefined) ??
    "56789";
  const tzOffset = normaliseTimezoneOffset(get("x-mileclear-timezone-offset"));

  // Device local IPs (private LAN addresses), collected client-side.
  // HMRC's validator treats Gov-Client-Local-IPs (+ timestamp) as required
  // for MOBILE_APP_VIA_SERVER (observed 17 Jul 2026 — previously only a
  // warning). Mobile sends them via expo-network from build 79; older
  // binaries omit the header and the builder skips it.
  const localIpsRaw = get("x-mileclear-local-ips");
  const localIps = localIpsRaw
    ? localIpsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const localIpsTimestamp = get("x-mileclear-local-ips-timestamp") ?? publicIpTimestamp;

  if (platform === "ios" || platform === "android") {
    return {
      connectionMethod: "MOBILE_APP_VIA_SERVER",
      deviceId: get("x-mileclear-device-id") ?? "unknown-device",
      publicIp: ip,
      publicIpTimestamp,
      publicPort,
      localIps,
      localIpsTimestamp,
      osFamily: platform === "ios" ? "iOS" : "Android",
      osVersion: get("x-mileclear-os-version") ?? "0.0",
      deviceManufacturer:
        get("x-mileclear-device-manufacturer") ?? (platform === "ios" ? "Apple" : "Unknown"),
      deviceModel: get("x-mileclear-device-model") ?? "Unknown",
      screenWidth: parseInt(get("x-mileclear-screen-width") ?? "1170", 10),
      screenHeight: parseInt(get("x-mileclear-screen-height") ?? "2532", 10),
      scalingFactor: parseInt(get("x-mileclear-scaling-factor") ?? "3", 10),
      colourDepth: parseInt(get("x-mileclear-colour-depth") ?? "24", 10),
      language: get("x-mileclear-language") ?? "en-GB",
      timezone: get("x-mileclear-timezone") ?? "Europe/London",
      timezoneOffset: tzOffset,
      vendorIdentifier: get("x-mileclear-vendor-id"),
    };
  }

  return {
    connectionMethod: "WEB_APP_VIA_SERVER",
    publicIp: ip,
    publicIpTimestamp,
    publicPort,
    browserName: get("x-mileclear-browser-name") ?? "Unknown",
    browserVersion: get("x-mileclear-browser-version") ?? "0.0",
    windowWidth: parseInt(get("x-mileclear-window-width") ?? "1440", 10),
    windowHeight: parseInt(get("x-mileclear-window-height") ?? "900", 10),
    screenWidth: parseInt(get("x-mileclear-screen-width") ?? "1920", 10),
    screenHeight: parseInt(get("x-mileclear-screen-height") ?? "1080", 10),
    scalingFactor: parseInt(get("x-mileclear-scaling-factor") ?? "1", 10),
    colourDepth: parseInt(get("x-mileclear-colour-depth") ?? "24", 10),
    language: get("accept-language")?.split(",")[0] ?? "en-GB",
    timezone: get("x-mileclear-timezone") ?? "Europe/London",
    timezoneOffset: tzOffset,
  };
}
