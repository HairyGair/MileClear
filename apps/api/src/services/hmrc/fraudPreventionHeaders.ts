// HMRC Fraud Prevention Headers (Gov-Client-* / Gov-Vendor-*).
//
// HMRC requires every MTD API call to include 9-15 mandatory headers that
// identify the originating client + the vendor (us). Missing or malformed
// headers cause the call to be rejected with `INVALID_HEADERS` and
// counted against the application's fraud risk score during accreditation.
//
// We have a Test Fraud Prevention Headers API subscribed (sandbox) that
// validates a request's headers without performing any actual MTD action —
// used as a smoke test in CI and during Phase 1 setup.
//
// Reference: https://developer.service.hmrc.uk/api-documentation/docs/fraud-prevention
//
// Connection method types are HMRC-defined enums. We use:
//   - APP_VIA_SERVER_DIRECT: mobile app talks to our backend, our backend
//     talks to HMRC. The vast majority of MileClear's traffic.
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
  /** "iOS/17.4.1 (iPhone15,2)" or similar; what the device reports. */
  userAgent: string;
  /** "iOS" or "Android". */
  osFamily: "iOS" | "Android";
  /** Width and height in physical pixels. */
  screenWidth: number;
  screenHeight: number;
  /** "en-GB" etc. */
  language: string;
  /** Wall-clock at the time the device made its request, ISO. */
  deviceTimezone: string;
  /** Timezone offset in ±HHMM form (e.g. "+0100"). */
  timezoneOffset: string;
  /** Optional Apple Vendor ID (UUID) if available. */
  vendorIdentifier?: string;
}

export interface WebClientContext {
  connectionMethod: "WEB_APP_VIA_SERVER";
  /** Browser-side public IP. */
  publicIp: string;
  /** Full UA string from browser. */
  userAgent: string;
  /** Window size, physical pixels. */
  windowWidth: number;
  windowHeight: number;
  language: string;
  /** Browser-supplied timezone, e.g. "Europe/London". */
  timezone: string;
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

  const headers: Record<string, string> = {
    // Vendor (us) — same on every call.
    "Gov-Vendor-Product-Name": encodeURIComponent(config.vendorProductName),
    "Gov-Vendor-Version": encodeURIComponent(config.vendorVersion),
    "Gov-Vendor-Public-IP": server.serverPublicIp,
    "Gov-Vendor-Local-IP": server.serverLocalIp,

    // Client connection method drives which Gov-Client-* headers HMRC
    // expects to see.
    "Gov-Client-Connection-Method": client.connectionMethod,
  };

  if (config.vendorLicenseIds) {
    headers["Gov-Vendor-License-IDs"] = config.vendorLicenseIds;
  }

  if (client.connectionMethod === "MOBILE_APP_VIA_SERVER") {
    headers["Gov-Client-Device-ID"] = client.deviceId;
    headers["Gov-Client-Public-IP"] = client.publicIp;
    headers["Gov-Client-User-Agent"] = encodeURIComponent(client.userAgent);
    headers["Gov-Client-Multi-Factor"] = "type=AUTH_CODE&timestamp=" + encodeURIComponent(server.receivedAt);
    headers["Gov-Client-Screens"] =
      `width=${client.screenWidth}&height=${client.screenHeight}&scaling-factor=1&colour-depth=24`;
    headers["Gov-Client-Window-Size"] =
      `width=${client.screenWidth}&height=${client.screenHeight}`;
    headers["Gov-Client-Timezone"] = client.timezoneOffset;
    headers["Gov-Client-Local-IPs"] = client.publicIp; // mobile usually only has one
    headers["Gov-Client-Local-IPs-Timestamp"] = server.receivedAt;
    headers["Gov-Client-MAC-Addresses"] = ""; // iOS doesn't expose MAC; HMRC accepts empty
    headers["Gov-Client-User-IDs"] = `mileclear=${encodeURIComponent(client.deviceId)}`;

    if (client.vendorIdentifier) {
      headers["Gov-Client-Device-ID"] = client.vendorIdentifier;
    }
  } else {
    headers["Gov-Client-Public-IP"] = client.publicIp;
    headers["Gov-Client-User-Agent"] = encodeURIComponent(client.userAgent);
    headers["Gov-Client-Multi-Factor"] = "type=AUTH_CODE&timestamp=" + encodeURIComponent(server.receivedAt);
    headers["Gov-Client-Screens"] =
      `width=${client.windowWidth}&height=${client.windowHeight}&scaling-factor=1&colour-depth=24`;
    headers["Gov-Client-Window-Size"] =
      `width=${client.windowWidth}&height=${client.windowHeight}`;
    headers["Gov-Client-Timezone"] = client.timezone;
  }

  // Validate: HMRC rejects empty values. Better to fail at the call site
  // with a clear stack than to send a doomed request.
  for (const [k, v] of Object.entries(headers)) {
    if (v === "" && k !== "Gov-Client-MAC-Addresses") {
      throw new Error(`HMRC fraud-prevention header "${k}" is empty`);
    }
  }

  return headers;
}
