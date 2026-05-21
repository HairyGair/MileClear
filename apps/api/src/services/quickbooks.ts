// QuickBooks Online (QBO) integration service.
//
// Two layers:
//   1. OAuth — kick off authorize URL, exchange code, refresh.
//   2. REST client — `qboApi<T>(connection, method, path, body)`
//      with automatic token refresh on 401 + signed retry.
//
// Tokens stored AES-256-GCM-encrypted via lib/encryption. Same
// pattern as Plaid / TrueLayer.
//
// Sandbox-first: every env-derived URL routes to the sandbox base
// URL when QUICKBOOKS_ENVIRONMENT is unset or set to "sandbox".
// Production endpoints unlock when Intuit accredits the app and we
// flip the env var.
//
// Phase A of the QuickBooks roadmap (21 May 2026).

import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/encryption.js";
import type { QuickBooksConnection } from "@prisma/client";

// ── URLs ─────────────────────────────────────────────────────────────

const OAUTH_AUTHORIZE = "https://appcenter.intuit.com/connect/oauth2";
const OAUTH_TOKEN = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const OAUTH_REVOKE = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

// API base differs sandbox vs production. Realm ID is the QBO
// "company file" — appended to the path on every call.
const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";
const PRODUCTION_API_BASE = "https://quickbooks.api.intuit.com";

function currentEnvironment(): "sandbox" | "production" {
  return (process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox") === "production"
    ? "production"
    : "sandbox";
}

function apiBaseFor(env: "sandbox" | "production"): string {
  return env === "production" ? PRODUCTION_API_BASE : SANDBOX_API_BASE;
}

// ── Config ───────────────────────────────────────────────────────────

interface QboConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: "sandbox" | "production";
}

/**
 * Returns the QBO OAuth config from env, or null if any required
 * setting is missing. Every consumer that depends on config should
 * call this and bail with a friendly 503 when null.
 */
export function getQboConfig(): QboConfig | null {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const apiBase = process.env.API_BASE_URL ?? "https://api.mileclear.com";
  const redirectUri =
    process.env.QUICKBOOKS_REDIRECT_URI ?? `${apiBase}/quickbooks/callback`;
  return {
    clientId,
    clientSecret,
    redirectUri,
    environment: currentEnvironment(),
  };
}

// ── OAuth ─────────────────────────────────────────────────────────────

/**
 * Build the Intuit authorize URL with the given state token.
 *
 * Scope `com.intuit.quickbooks.accounting` is the full accounting
 * scope — covers reading + writing every entity we care about
 * (Vehicle, VehicleMileage, Item, Purchase, SalesReceipt, Invoice).
 * Payments + Payroll have separate scopes we don't need.
 */
export function buildAuthorizeUrl(args: {
  config: QboConfig;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.config.clientId,
    redirect_uri: args.config.redirectUri,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    state: args.state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: "bearer";
}

/** Exchange the `code` returned by Intuit for access + refresh tokens. */
export async function exchangeCodeForTokens(args: {
  config: QboConfig;
  code: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.config.redirectUri,
  });
  const basic = Buffer.from(
    `${args.config.clientId}:${args.config.clientSecret}`
  ).toString("base64");
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QBO token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/** Exchange a refresh token for a fresh access + refresh pair. */
export async function refreshAccessToken(args: {
  config: QboConfig;
  refreshToken: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
  });
  const basic = Buffer.from(
    `${args.config.clientId}:${args.config.clientSecret}`
  ).toString("base64");
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QBO token refresh failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/** Tell Intuit to invalidate a refresh token. Best-effort. */
export async function revokeRefreshToken(args: {
  config: QboConfig;
  refreshToken: string;
}): Promise<void> {
  const basic = Buffer.from(
    `${args.config.clientId}:${args.config.clientSecret}`
  ).toString("base64");
  await fetch(OAUTH_REVOKE, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: args.refreshToken }),
  }).catch(() => undefined);
}

// ── Persistence ──────────────────────────────────────────────────────

/**
 * Upsert a connection from a fresh token exchange.
 */
export async function upsertConnection(args: {
  userId: string;
  realmId: string;
  companyName?: string | null;
  tokens: TokenResponse;
  environment: "sandbox" | "production";
}): Promise<QuickBooksConnection> {
  const tokenExpiresAt = new Date(
    Date.now() + args.tokens.expires_in * 1000
  );
  return prisma.quickBooksConnection.upsert({
    where: { userId: args.userId },
    create: {
      userId: args.userId,
      realmId: args.realmId,
      accessTokenEncrypted: encrypt(args.tokens.access_token),
      refreshTokenEncrypted: encrypt(args.tokens.refresh_token),
      tokenExpiresAt,
      environment: args.environment,
      companyName: args.companyName ?? null,
    },
    update: {
      realmId: args.realmId,
      accessTokenEncrypted: encrypt(args.tokens.access_token),
      refreshTokenEncrypted: encrypt(args.tokens.refresh_token),
      tokenExpiresAt,
      environment: args.environment,
      companyName: args.companyName ?? undefined,
      status: "active",
    },
  });
}

// ── REST client ──────────────────────────────────────────────────────

interface RefreshedTokenCache {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Decrypt the stored access token, refreshing automatically if it
 * expires in the next 60 seconds. Persists the new token pair on
 * refresh so the next call short-circuits.
 */
async function getValidAccessToken(
  connection: QuickBooksConnection
): Promise<RefreshedTokenCache> {
  const expiresInMs = connection.tokenExpiresAt.getTime() - Date.now();
  if (expiresInMs > 60_000) {
    return {
      accessToken: decrypt(connection.accessTokenEncrypted),
      expiresAt: connection.tokenExpiresAt,
    };
  }
  const config = getQboConfig();
  if (!config) {
    throw new Error("QuickBooks is not configured (missing CLIENT_ID/SECRET)");
  }
  const refreshToken = decrypt(connection.refreshTokenEncrypted);
  const fresh = await refreshAccessToken({ config, refreshToken });
  const updated = await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEncrypted: encrypt(fresh.access_token),
      refreshTokenEncrypted: encrypt(fresh.refresh_token),
      tokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000),
    },
  });
  return {
    accessToken: fresh.access_token,
    expiresAt: updated.tokenExpiresAt,
  };
}

/**
 * Issue an authenticated request to the QBO API. Automatically:
 *   - refreshes the access token when expired
 *   - retries once on a 401 (token revoked elsewhere → fresh refresh)
 *   - throws a meaningful error on any other non-2xx
 *
 * Path is the part AFTER the realm ID, e.g.
 *   qboApi(conn, "GET", "/query?query=select * from Vehicle")
 *   qboApi(conn, "POST", "/vehiclemileage", body)
 */
export async function qboApi<T>(
  connection: QuickBooksConnection,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const env = (connection.environment === "production" ? "production" : "sandbox") as
    | "sandbox"
    | "production";
  const base = apiBaseFor(env);

  async function attempt(token: string): Promise<Response> {
    const url = `${base}/v3/company/${connection.realmId}${path}${
      path.includes("?") ? "&" : "?"
    }minorversion=70`;
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  const cached = await getValidAccessToken(connection);
  let res = await attempt(cached.accessToken);

  // Force-refresh on 401 — token may have been revoked elsewhere or
  // the cached one is stale despite our expiry math.
  if (res.status === 401) {
    const config = getQboConfig();
    if (config) {
      const refreshToken = decrypt(connection.refreshTokenEncrypted);
      const fresh = await refreshAccessToken({ config, refreshToken });
      await prisma.quickBooksConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenEncrypted: encrypt(fresh.access_token),
          refreshTokenEncrypted: encrypt(fresh.refresh_token),
          tokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000),
        },
      });
      res = await attempt(fresh.access_token);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QBO ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null as unknown as T;
  return (await res.json()) as T;
}

// ── Convenience: fetch CompanyInfo ──────────────────────────────────

interface QboCompanyInfo {
  CompanyInfo: {
    CompanyName: string;
    Country?: string;
    Id: string;
  };
}

/**
 * Hit `/companyinfo/<realm>` right after token exchange so we can
 * store the company name on the connection row + show it in the UI.
 */
export async function fetchCompanyName(
  connection: QuickBooksConnection
): Promise<string | null> {
  try {
    const result = await qboApi<QboCompanyInfo>(
      connection,
      "GET",
      `/companyinfo/${connection.realmId}`
    );
    return result.CompanyInfo?.CompanyName ?? null;
  } catch (err) {
    console.warn("[quickbooks] fetchCompanyName failed:", err);
    return null;
  }
}
