// Helper that turns an inbound Fastify request into the ClientContext +
// ServerContext that the fraud-prevention header builder needs.
//
// Mobile and web both forward device/browser context as conventional
// X-MileClear-* headers (set by the API client wrapper, not by the user).
// On the server we add our own public/local IPs.

import type { FastifyRequest } from "fastify";
import os from "node:os";
import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";

/**
 * Placeholder hardware identifiers that must never reach HMRC. Their Fraud
 * Headers team rejected our July 2026 submissions over `device-model=Unknown`,
 * and a value that is not a real device reads to them as a header we never
 * implemented.
 *
 * Two sources produce these. App binaries before build 83 hardcoded the
 * literal "Unknown" and still transmit it (7 Aug 2026: a device on an older
 * build put three such requests into the rolling 30-day review window).
 * Simulators report the host architecture from uname(), so "arm64" and
 * "x86_64" are equally fake.
 *
 * Treating them as absent is not enough on its own - see the guard in
 * client.ts, which refuses the call outright rather than sending a request
 * with a hole in it while accreditation is in progress.
 */
const PLACEHOLDER_DEVICE_MODELS = new Set([
  "unknown",
  "arm64",
  "x86_64",
  "i386",
  "simulator",
]);

export function realDeviceModel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return PLACEHOLDER_DEVICE_MODELS.has(trimmed.toLowerCase()) ? undefined : trimmed;
}

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
  // Public IP: the LAST entry of X-Forwarded-For is the address our own
  // Apache appended — the one it actually observed. The first entry is
  // whatever the caller sent inbound, i.e. spoofable. (The app never sends
  // XFF, so for real traffic the list has one entry and the two agree.)
  const xff = get("x-forwarded-for");
  const ip =
    xff?.split(",").pop()?.trim() ||
    request.ip ||
    "0.0.0.0";
  const publicIpTimestamp = get("x-mileclear-public-ip-timestamp") ?? new Date().toISOString();
  // Connection port: HMRC wants the device's source port, NOT a server
  // port. X-Client-Source-Port is stamped by our Apache from the actual
  // TCP connection (RequestHeader set, so it cannot arrive from outside).
  // The socket fallback is Apache's proxy-hop port — a measured value on
  // the connection chain, kept only as a fallback. There is deliberately
  // NO constant fallback: the old fixed "56789" was a fabricated value of
  // exactly the class HMRC's review flags, so when nothing is measurable
  // the header is omitted instead (the builder skips absent ports).
  const publicPort =
    get("x-client-source-port") ??
    get("x-mileclear-public-port") ??
    (request.socket?.remotePort ? String(request.socket.remotePort) : undefined);
  const portSource = get("x-client-source-port")
    ? "apache"
    : get("x-mileclear-public-port")
      ? "client"
      : request.socket?.remotePort
        ? "socket"
        : "absent";
  const rawTzOffset = get("x-mileclear-timezone-offset");
  const tzOffset = normaliseTimezoneOffset(rawTzOffset);

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
    // The app sends its context fields as one block (clientContext.ts
    // builds them together), so a genuine MileClear client carries ALL of
    // these. Anything missing one is a hand-crafted request wearing the
    // platform header — and the old defaults (os-version "0.0", a
    // 1170x2532 screen, scaling 3) would have dressed it in fabricated
    // values, which is the placeholder defect HMRC has now flagged three
    // times. No essentials → not our app → refuse downstream.
    const deviceId = get("x-mileclear-device-id");
    const osVersion = get("x-mileclear-os-version");
    const appVersion = get("x-mileclear-app-version");
    const screenWidth = parseInt(get("x-mileclear-screen-width") ?? "", 10);
    const screenHeight = parseInt(get("x-mileclear-screen-height") ?? "", 10);
    const scalingFactor = parseInt(get("x-mileclear-scaling-factor") ?? "", 10);

    if (
      !deviceId ||
      !osVersion ||
      !appVersion ||
      !rawTzOffset ||
      !Number.isFinite(screenWidth) ||
      !Number.isFinite(screenHeight) ||
      !Number.isFinite(scalingFactor)
    ) {
      return {
        connectionMethod: "UNSUPPORTED_CLIENT",
        rawPlatform: platform,
        publicPort,
        portSource,
      };
    }

    return {
      connectionMethod: "MOBILE_APP_VIA_SERVER",
      deviceId,
      publicIp: ip,
      publicIpTimestamp,
      publicPort,
      portSource,
      localIps,
      localIpsTimestamp,
      osFamily: platform === "ios" ? "iOS" : "Android",
      osVersion,
      appVersion,
      // No "Unknown" fallback: HMRC's Fraud Headers team rejected our July
      // 2026 submissions precisely because these arrived as that literal.
      // Clients that cannot report hardware (iOS binaries before the
      // expo-device build) send nothing and the pair is dropped downstream.
      deviceManufacturer:
        get("x-mileclear-device-manufacturer") ?? (platform === "ios" ? "Apple" : undefined),
      deviceModel: realDeviceModel(get("x-mileclear-device-model")),
      rawDeviceModel: get("x-mileclear-device-model"),
      screenWidth,
      screenHeight,
      scalingFactor,
      // The app hardcodes 24 (iOS/Android screens are 24-bit); accept it
      // when sent, mirror the same value when the header is absent from an
      // older build — this one is the app's own constant, not an invention.
      colourDepth: parseInt(get("x-mileclear-colour-depth") ?? "24", 10),
      language: get("x-mileclear-language") ?? "en-GB",
      timezone: get("x-mileclear-timezone") ?? "Europe/London",
      timezoneOffset: tzOffset,
      vendorIdentifier: get("x-mileclear-vendor-id"),
    };
  }

  // Anything else is a caller we cannot describe truthfully. This used to
  // return a WEB_APP_VIA_SERVER context built from hardcoded defaults —
  // browser "Unknown" 0.0, a 1440x900 window, a 1920x1080 screen — none of
  // which came from a real browser, and missing four headers HMRC requires
  // for that method. HMRC's Fraud Headers team flagged exactly those calls
  // on 7 Aug 2026 (our own test tooling hitting the API directly; no user
  // ever produced one). MileClear ships MTD from the mobile app only, so
  // the honest answer is to refuse rather than to describe ourselves as a
  // web app we do not have.
  return {
    connectionMethod: "UNSUPPORTED_CLIENT",
    rawPlatform: get("x-mileclear-platform") ?? undefined,
    publicPort,
    portSource,
  };
}
