// HMRC MTD HTTP client.
//
// Wraps fetch with:
//   - automatic Bearer token injection from the user's HmrcConnection
//   - automatic token refresh on 401 (one retry, then prompt re-OAuth)
//   - mandatory fraud-prevention headers (Gov-Client-* / Gov-Vendor-*)
//   - HMRC version header (Accept: application/vnd.hmrc.X.0+json)
//   - structured error mapping onto our ApiError taxonomy
//   - audit logging of every call as an app_event for compliance
//
// Phase 2 of the MTD ITSA build. Used by every MTD endpoint downstream
// (Obligations, Individual Calculations, Self Employment Business, BSAS,
// Test Fraud Prevention Headers).

import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../appEvents.js";
import { encrypt, decryptIfEncrypted } from "../../lib/encryption.js";
import { getHmrcConfig, type HmrcEnvironment } from "./config.js";
import {
  refreshAccessToken,
  expiryFromExpiresIn,
  isTokenExpiringSoon,
} from "./oauth.js";
import {
  buildFraudPreventionHeaders,
  type ClientContext,
  type ServerContext,
} from "./fraudPreventionHeaders.js";

export interface HmrcCallOptions {
  userId: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path under the chosen environment's base URL, e.g. "/individuals/business/obligations". */
  path: string;
  /** Query string parameters, will be URL-encoded. */
  query?: Record<string, string | number | undefined>;
  /** JSON body for POST/PUT. */
  body?: unknown;
  /** HMRC API version, e.g. "3.0" for Obligations, "5.0" for Self Employment Business. */
  apiVersion: string;
  /** Client context for fraud-prevention headers. Caller extracts from inbound request. */
  client: ClientContext;
  /** Server context (our public IP, etc). */
  server: ServerContext;
}

export class HmrcError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly hmrcCode: string | null,
    public readonly detail: unknown
  ) {
    super(message);
    this.name = "HmrcError";
  }
}

export class HmrcNotConnectedError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} has no active HMRC connection`);
    this.name = "HmrcNotConnectedError";
  }
}

export class HmrcReauthRequiredError extends Error {
  constructor(public readonly userId: string) {
    super(`HMRC refresh token rejected for user ${userId}; user must re-OAuth`);
    this.name = "HmrcReauthRequiredError";
  }
}

interface ConnectionTokens {
  id: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  environment: HmrcEnvironment;
}

async function loadActiveConnection(userId: string): Promise<ConnectionTokens> {
  const conn = await prisma.hmrcConnection.findUnique({
    where: { userId },
  });
  if (!conn || conn.disconnectedAt) {
    throw new HmrcNotConnectedError(userId);
  }
  if (conn.environment !== "sandbox" && conn.environment !== "production") {
    throw new Error(`Invalid HMRC environment on connection: ${conn.environment}`);
  }
  // Decrypt access/refresh tokens at the read boundary. Any row written
  // before the encryption migration is still in plaintext on disk —
  // decryptIfEncrypted handles both cases transparently. Once the
  // migration script confirms zero plaintext rows remain, swap to
  // decrypt() directly so plaintext can never silently be accepted.
  const accessToken = decryptIfEncrypted(conn.accessToken) ?? "";
  const refreshToken = decryptIfEncrypted(conn.refreshToken) ?? "";
  return {
    id: conn.id,
    accessToken,
    refreshToken,
    expiresAt: conn.expiresAt,
    environment: conn.environment,
  };
}

async function refreshAndPersist(
  conn: ConnectionTokens
): Promise<ConnectionTokens> {
  const config = getHmrcConfig();
  if (!config) throw new Error("HMRC integration not configured");

  let tokens;
  try {
    tokens = await refreshAccessToken({
      config,
      refreshToken: conn.refreshToken,
    });
  } catch (err) {
    // Refresh failed — most likely invalid_grant (refresh token revoked).
    // Mark the connection disconnected so the user is prompted to re-OAuth.
    await prisma.hmrcConnection.update({
      where: { id: conn.id },
      data: { disconnectedAt: new Date() },
    });
    logEvent("hmrc.refresh_rejected", null, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new HmrcReauthRequiredError(conn.id);
  }

  const updated = await prisma.hmrcConnection.update({
    where: { id: conn.id },
    data: {
      // Encrypt at the write boundary. Pairs with decryptIfEncrypted in
      // loadActiveConnection. Both paths share the same key (MTD_TOKEN_KEY).
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt: expiryFromExpiresIn(tokens.expires_in),
      scope: tokens.scope,
    },
  });

  return {
    id: updated.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: updated.expiresAt,
    environment: conn.environment,
  };
}

function buildQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? "?" + parts.join("&") : "";
}

async function performRequest(args: {
  conn: ConnectionTokens;
  options: HmrcCallOptions;
}): Promise<Response> {
  const config = getHmrcConfig();
  if (!config) throw new Error("HMRC integration not configured");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.conn.accessToken}`,
    Accept: `application/vnd.hmrc.${args.options.apiVersion}+json`,
    ...buildFraudPreventionHeaders({
      config,
      client: args.options.client,
      server: args.options.server,
    }),
  };
  if (args.options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const url =
    config.apiBaseUrl + args.options.path + buildQueryString(args.options.query);

  return fetch(url, {
    method: args.options.method,
    headers,
    body: args.options.body !== undefined ? JSON.stringify(args.options.body) : undefined,
  });
}

/**
 * Make an authenticated MTD API call. Auto-refreshes the token if it's
 * expiring soon or if the first attempt returns 401. Returns parsed JSON
 * on success; throws HmrcError on HMRC error responses.
 */
export async function hmrcCall<T = unknown>(opts: HmrcCallOptions): Promise<T> {
  let conn = await loadActiveConnection(opts.userId);

  // Pre-emptive refresh if the cached token expires within 60s.
  if (isTokenExpiringSoon(conn.expiresAt)) {
    conn = await refreshAndPersist(conn);
  }

  let response = await performRequest({ conn, options: opts });

  // Reactive refresh on 401 — token may have been revoked early.
  if (response.status === 401) {
    conn = await refreshAndPersist(conn);
    response = await performRequest({ conn, options: opts });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON response, leave as text
    }
    const code =
      parsed && typeof parsed === "object" && parsed !== null && "code" in parsed
        ? String((parsed as { code: unknown }).code)
        : null;
    const message =
      parsed && typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : `HMRC API error: HTTP ${response.status}`;

    logEvent("hmrc.api_error", opts.userId, {
      path: opts.path,
      httpStatus: response.status,
      hmrcCode: code,
    });

    throw new HmrcError(message, response.status, code, parsed);
  }

  logEvent("hmrc.api_call", opts.userId, {
    path: opts.path,
    method: opts.method,
    httpStatus: response.status,
    apiVersion: opts.apiVersion,
  });

  return (await response.json()) as T;
}
