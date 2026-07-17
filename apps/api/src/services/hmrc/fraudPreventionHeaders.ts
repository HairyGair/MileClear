// HMRC Fraud Prevention Headers (Gov-Client-* / Gov-Vendor-*).
//
// HMRC requires every MTD API call to include 9-15 mandatory headers that
// identify the originating client + the vendor (us). Missing or malformed
// headers cause the call to be rejected with `INVALID_HEADERS` and
// counted against the application's fraud risk score during accreditation.
//
// Validated 8 May 2026 against the Test Fraud Prevention Headers API at
// https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate
// (specVersion 3.3). Findings + fixes captured in
// docs/FRAUD_PREVENTION_VALIDATOR_2026-05-09.md.
//
// Reference: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/
//
// Connection method types are HMRC-defined enums. We use:
//   - MOBILE_APP_VIA_SERVER: mobile app talks to our backend, our backend
//     talks to HMRC. Vast majority of MileClear's traffic.
//   - WEB_APP_VIA_SERVER: web dashboard equivalent.

import type { HmrcConfig } from "./config.js";

export type ConnectionMethod =
  | "WEB_APP_VIA_SERVER"
  | "DESKTOP_APP_VIA_SERVER"
  | "MOBILE_APP_VIA_SERVER"
  | "BATCH_PROCESS_DIRECT"
  | "WEB_APP_DIRECT"
  | "DESKTOP_APP_DIRECT"
  | "MOBILE_APP_DIRECT"
  | "OTHER_DIRECT";

export interface MobileClientContext {
  connectionMethod: "MOBILE_APP_VIA_SERVER";
  /** A stable, opaque per-install device id. NOT the user id. */
  deviceId: string;
  /** Public IP from the device, captured by mobile and forwarded. */
  publicIp: string;
  /** ISO timestamp when the public IP was determined by the client. */
  publicIpTimestamp: string;
  /** TCP port the device used to call our server (typically 443). */
  publicPort: string;
  /** "iOS" or "Android". */
  osFamily: "iOS" | "Android";
  /** OS version, e.g. "17.4.1". */
  osVersion: string;
  /** Device manufacturer, e.g. "Apple". */
  deviceManufacturer: string;
  /** Device model, e.g. "iPhone15,3". */
  deviceModel: string;
  /** Width and height in physical pixels. */
  screenWidth: number;
  screenHeight: number;
  /** Pixel scaling factor (Retina = 2 or 3). */
  scalingFactor?: number;
  /** Colour depth bits (e.g. 24). */
  colourDepth?: number;
  /** "en-GB" etc. */
  language: string;
  /** IANA timezone, e.g. "Europe/London". */
  timezone: string;
  /** UTC offset in HMRC's required format: "UTC+01:00" / "UTC-05:30". */
  timezoneOffset: string;
  /** Local IPs (private, e.g. "192.168.x.y"). Empty array allowed. */
  localIps?: string[];
  /** ISO timestamp when local IPs were determined. */
  localIpsTimestamp?: string;
  /** Optional Apple Vendor ID (UUID) if available. */
  vendorIdentifier?: string;
  /** Optional MFA methods used in this session. Each must include uniqueReference. */
  multiFactor?: Array<{ type: string; uniqueReference: string; timestamp: string }>;
}

export interface WebClientContext {
  connectionMethod: "WEB_APP_VIA_SERVER";
  /** Browser-side public IP. */
  publicIp: string;
  /** ISO timestamp when public IP was determined. */
  publicIpTimestamp: string;
  /** TCP port the browser used. */
  publicPort: string;
  /** Browser UA string broken into components. */
  browserName?: string;
  browserVersion?: string;
  /** Window size, physical pixels. */
  windowWidth: number;
  windowHeight: number;
  /** Screen size and meta. */
  screenWidth?: number;
  screenHeight?: number;
  scalingFactor?: number;
  colourDepth?: number;
  language: string;
  /** IANA timezone, e.g. "Europe/London". */
  timezone: string;
  /** UTC offset, "UTC+01:00" format. */
  timezoneOffset: string;
  /** Optional MFA methods. */
  multiFactor?: Array<{ type: string; uniqueReference: string; timestamp: string }>;
}

export type ClientContext = MobileClientContext | WebClientContext;

export interface ServerContext {
  /** Public IP of OUR server making the upstream HMRC call. */
  serverPublicIp: string;
  /** Local IP of our server. */
  serverLocalIp: string;
  /** When this request hit our server, ISO. */
  receivedAt: string;
}

/**
 * Encode a key-value structured value per HMRC spec. Keys + values are
 * percent-encoded individually but the `=` and `&` separators stay raw.
 */
function kv(pairs: Array<[string, string | undefined]>): string {
  return pairs
    .filter((p): p is [string, string] => p[1] != null && p[1] !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * Build the full set of fraud-prevention headers HMRC requires on every
 * MTD API call. Throws if any required header would be empty - safer to
 * fail fast at the call-site than to send a request HMRC will silently
 * reject and count against our fraud score.
 */
export function buildFraudPreventionHeaders(args: {
  config: HmrcConfig;
  client: ClientContext;
  server: ServerContext;
}): Record<string, string> {
  const { config, client, server } = args;

  // ── Vendor headers (us) — same on every call ──────────────────────────

  const headers: Record<string, string> = {
    // Vendor product name as a single token (HMRC accepts a plain string).
    "Gov-Vendor-Product-Name": config.vendorProductName,
    // Vendor version as a key-value structure: client/server architecture
    // means we must declare both versions.
    "Gov-Vendor-Version": kv([
      ["client", config.vendorVersion],
      ["server", config.vendorVersion],
    ]),
    "Gov-Vendor-Public-IP": server.serverPublicIp,
    // Spec v3.3 requires Gov-Vendor-Forwarded for proxied flows; format is
    // a list of "by=<our-ip>&for=<client-ip>" segments.
    "Gov-Vendor-Forwarded": kv([
      ["by", server.serverPublicIp],
      ["for", client.publicIp],
    ]),
    // License IDs: even if we have none configured, send the header empty
    // is an UNEXPECTED warning per validator. Send only when populated.
    // Connection method drives client-side header expectations.
    "Gov-Client-Connection-Method": client.connectionMethod,
  };

  if (config.vendorLicenseIds && config.vendorLicenseIds.trim() !== "") {
    headers["Gov-Vendor-License-IDs"] = config.vendorLicenseIds;
  }

  // ── Client headers ────────────────────────────────────────────────────

  if (client.connectionMethod === "MOBILE_APP_VIA_SERVER") {
    headers["Gov-Client-Device-ID"] = client.vendorIdentifier ?? client.deviceId;
    headers["Gov-Client-Public-IP"] = client.publicIp;
    headers["Gov-Client-Public-IP-Timestamp"] = client.publicIpTimestamp;
    headers["Gov-Client-Public-Port"] = client.publicPort;
    // User-Agent must be a key-value structure with os family + version,
    // device manufacturer, device model. Plain UA strings are rejected
    // with "Value must be a list of key-value data structures".
    headers["Gov-Client-User-Agent"] = kv([
      ["os-family", client.osFamily],
      ["os-version", client.osVersion],
      ["device-manufacturer", client.deviceManufacturer],
      ["device-model", client.deviceModel],
    ]);
    headers["Gov-Client-Screens"] = kv([
      ["width", String(client.screenWidth)],
      ["height", String(client.screenHeight)],
      ["scaling-factor", String(client.scalingFactor ?? 1)],
      ["colour-depth", String(client.colourDepth ?? 24)],
    ]);
    headers["Gov-Client-Window-Size"] = kv([
      ["width", String(client.screenWidth)],
      ["height", String(client.screenHeight)],
    ]);
    // Timezone: IANA name (rejected as "must be UTC format"), so use offset.
    headers["Gov-Client-Timezone"] = client.timezoneOffset;
    headers["Gov-Client-User-IDs"] = kv([
      ["mileclear", client.deviceId],
    ]);

    if (client.localIps && client.localIps.length > 0) {
      // Spec: comma-separated list of percent-encoded IPs (encoding matters
      // for IPv6 colons; harmless for IPv4).
      headers["Gov-Client-Local-IPs"] = client.localIps
        .map((ip) => encodeURIComponent(ip))
        .join(",");
      if (client.localIpsTimestamp) {
        headers["Gov-Client-Local-IPs-Timestamp"] = client.localIpsTimestamp;
      }
    }

    // Multi-Factor: each method must include uniqueReference. Skip header
    // entirely when no MFA methods are recorded — per spec, header is
    // optional unless MFA was actually used to authenticate the session.
    if (client.multiFactor && client.multiFactor.length > 0) {
      headers["Gov-Client-Multi-Factor"] = client.multiFactor
        .map((mf) =>
          kv([
            ["type", mf.type],
            ["timestamp", mf.timestamp],
            ["unique-reference", mf.uniqueReference],
          ])
        )
        .join(",");
    }
  } else {
    headers["Gov-Client-Public-IP"] = client.publicIp;
    headers["Gov-Client-Public-IP-Timestamp"] = client.publicIpTimestamp;
    headers["Gov-Client-Public-Port"] = client.publicPort;
    headers["Gov-Client-User-Agent"] = kv([
      ["browser-name", client.browserName ?? ""],
      ["browser-version", client.browserVersion ?? ""],
    ]);
    if (client.screenWidth && client.screenHeight) {
      headers["Gov-Client-Screens"] = kv([
        ["width", String(client.screenWidth)],
        ["height", String(client.screenHeight)],
        ["scaling-factor", String(client.scalingFactor ?? 1)],
        ["colour-depth", String(client.colourDepth ?? 24)],
      ]);
    }
    headers["Gov-Client-Window-Size"] = kv([
      ["width", String(client.windowWidth)],
      ["height", String(client.windowHeight)],
    ]);
    headers["Gov-Client-Timezone"] = client.timezoneOffset;

    if (client.multiFactor && client.multiFactor.length > 0) {
      headers["Gov-Client-Multi-Factor"] = client.multiFactor
        .map((mf) =>
          kv([
            ["type", mf.type],
            ["timestamp", mf.timestamp],
            ["unique-reference", mf.uniqueReference],
          ])
        )
        .join(",");
    }
  }

  // Validate: HMRC rejects empty values. Better to fail at the call site
  // with a clear stack than to send a doomed request. Only
  // Gov-Client-Local-IPs is allowed to be absent (handled by skipping
  // the header above when there are no local IPs).
  for (const [k, v] of Object.entries(headers)) {
    if (v === "") {
      throw new Error(`HMRC fraud-prevention header "${k}" is empty`);
    }
  }

  return headers;
}
