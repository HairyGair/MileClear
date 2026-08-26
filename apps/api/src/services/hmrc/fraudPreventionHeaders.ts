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
// Connection method: MileClear ships MTD from the mobile app ONLY, so
// MOBILE_APP_VIA_SERVER (app talks to our backend, our backend talks to
// HMRC) is the single method we are ever entitled to declare.
//
// There used to be a WEB_APP_VIA_SERVER branch here, built for a web
// dashboard that was never given an MTD client. Because it was the `else`
// of a two-way branch it caught anything without mobile headers — in
// practice our own test tooling — and fabricated a browser identity from
// hardcoded defaults ("Unknown" browser, 1440x900 window, 1920x1080
// screen). HMRC's Fraud Headers team flagged those calls on 7 Aug 2026,
// the same placeholder objection that cost us the July round on
// device-model. It also declared a method whose required headers
// (Gov-Client-Browser-JS-User-Agent, Gov-Client-Device-ID,
// Gov-Client-User-IDs, Gov-Client-Multi-Factor) it never sent.
//
// So the shape is deliberate: a client we cannot describe truthfully is
// UNSUPPORTED_CLIENT — a local sentinel, never an HMRC value — and the
// call is refused upstream in client.ts rather than dressed up as a
// browser. If a web MTD client is ever built, add a real WebClientContext
// populated from the browser, never from defaults.

import type { HmrcConfig } from "./config.js";

export interface MobileClientContext {
  connectionMethod: "MOBILE_APP_VIA_SERVER";
  /** A stable, opaque per-install device id. NOT the user id. */
  deviceId: string;
  /** Public IP from the device, captured by mobile and forwarded. */
  publicIp: string;
  /** ISO timestamp when the public IP was determined by the client. */
  publicIpTimestamp: string;
  /**
   * The device's source port as measured at our edge. Optional because it
   * genuinely may be unmeasurable — and per HMRC's missing-header-data
   * guidance an absent value beats an invented one. The old code fell back
   * to a fixed "56789", which is the placeholder defect wearing a number.
   */
  publicPort?: string;
  /**
   * Where publicPort came from ("apache" = stamped by our edge from the
   * real TCP connection, "client", "socket", "absent"). Telemetry only —
   * never a header. Lets hmrc.api_call events prove, from our own data,
   * that the port pipeline is measuring rather than inventing.
   */
  portSource?: string;
  /**
   * The identifier the user signs into MileClear with (their email) —
   * what the spec says Gov-Client-User-IDs must hold. Set by hmrcCall
   * from the user row, never by the transport layer. The old code sent
   * the device UUID here, duplicating Gov-Client-Device-ID.
   */
  signInIdentifier?: string;
  /** The app's real version (X-MileClear-App-Version), per device. */
  appVersion?: string;
  /** "iOS" or "Android". */
  osFamily: "iOS" | "Android";
  /** OS version, e.g. "17.4.1". */
  osVersion: string;
  /**
   * Device manufacturer, e.g. "Apple". Omitted when the client cannot
   * report it — kv() drops the pair rather than sending a stand-in, since
   * HMRC's Fraud Headers team reads placeholder values as unimplemented.
   */
  deviceManufacturer?: string;
  /** Device model, e.g. "iPhone15,3". Omitted when unreportable — see above. */
  deviceModel?: string;
  /**
   * What the client actually sent, before placeholders were stripped.
   * Diagnostic only — never used to build a header. Without it a blocked
   * request cannot tell us WHY it was blocked ("Unknown" from an old
   * binary vs "arm64" from a simulator), which is the first thing worth
   * knowing when a device is refused.
   */
  rawDeviceModel?: string;
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

/**
 * A caller we cannot describe truthfully to HMRC: any request that did not
 * arrive from the mobile app carrying its X-MileClear-* context.
 *
 * This is NOT an HMRC connection method — the value never reaches a
 * header. It exists so the untrusted case is a distinct state that the
 * type system forces us to handle, rather than the fall-through of an
 * if/else that quietly invented a browser.
 */
export interface UnsupportedClientContext {
  connectionMethod: "UNSUPPORTED_CLIENT";
  /** What the caller claimed to be, for diagnostics only. */
  rawPlatform?: string;
  /**
   * Source port as measured at our edge, diagnostics only — lets a
   * blocked request double as an end-to-end check that Apache is
   * stamping X-Client-Source-Port.
   */
  publicPort?: string;
  /** Where publicPort came from ("apache" | "client" | "socket" | "absent"). */
  portSource?: string;
}

export type ClientContext = MobileClientContext | UnsupportedClientContext;

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

  // Defence in depth. client.ts refuses an unsupported caller before we
  // ever get here, so this is unreachable in practice — but it is the
  // line that makes "invent a plausible client" impossible rather than
  // merely absent, which is the whole point of the 7 Aug 2026 fix.
  if (client.connectionMethod !== "MOBILE_APP_VIA_SERVER") {
    throw new Error(
      "Refusing to build fraud-prevention headers for a non-mobile client: " +
        "MileClear supports MOBILE_APP_VIA_SERVER only"
    );
  }

  // ── Vendor headers (us) — same on every call ──────────────────────────

  // Both of these are required for headers HMRC mandates, and both must be
  // real. Refusing here (not defaulting) keeps the placeholder class of
  // defect — the one HMRC has flagged three times — unrepresentable.
  if (!client.appVersion) {
    throw new Error(
      "Gov-Vendor-Version requires the app's real version; requestContext must pass X-MileClear-App-Version through"
    );
  }
  if (!client.signInIdentifier) {
    throw new Error(
      "Gov-Client-User-IDs requires the user's sign-in identifier; hmrcCall must set it from the user row"
    );
  }

  const headers: Record<string, string> = {
    // Vendor product name as a single token (HMRC accepts a plain string).
    "Gov-Vendor-Product-Name": config.vendorProductName,
    // Vendor version: one pair per software component, named per spec
    // (`<software-name>=<version>`). The client pair is the app's REAL
    // per-device version from X-MileClear-App-Version — the old code sent
    // the same server-side constant for both, so every device on every
    // build reported an identical value, which is the "generic or
    // placeholder" pattern HMRC's review flags.
    "Gov-Vendor-Version": kv([
      [
        client.osFamily === "iOS" ? "mileclear-ios" : "mileclear-android",
        client.appVersion,
      ],
      ["mileclear-api", config.vendorVersion],
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

  headers["Gov-Client-Device-ID"] = client.vendorIdentifier ?? client.deviceId;
  headers["Gov-Client-Public-IP"] = client.publicIp;
  headers["Gov-Client-Public-IP-Timestamp"] = client.publicIpTimestamp;
  // Omitted when unmeasured — never a made-up constant.
  if (client.publicPort) {
    headers["Gov-Client-Public-Port"] = client.publicPort;
  }
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
  // Spec: "the identifier that the user signs into the application with,
  // for example username, email or phone number". The old code sent the
  // device UUID here — the same value as Gov-Client-Device-ID, which to a
  // human reviewer reads as two headers copy-pasted rather than measured.
  headers["Gov-Client-User-IDs"] = kv([
    ["mileclear", client.signInIdentifier],
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
