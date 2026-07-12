// Xero integration — OAuth + REST client (12 Jul 2026).
//
//   1. OAuth — authorize URL, code exchange, refresh (standard OAuth2
//      authorization-code flow; Basic auth on the token endpoint).
//   2. Tenant discovery — after exchange, GET /connections returns the
//      org(s) the user authorised; we store the first (MileClear
//      supports one org per user, mirroring QuickBooks' one realm).
//   3. REST client — `xeroApi<T>(connection, method, path, body)` with
//      the `xero-tenant-id` header, automatic refresh, and a single
//      401 retry.
//
// ⚠️ Xero refresh tokens are SINGLE-USE (rotated on every refresh, like
// Intuit's). Both refresh paths sync the in-memory connection object so
// a later call in the same batch can never replay a consumed token —
// the exact bug the QuickBooks smoke test caught on 12 Jul 2026.
//
// Xero has no sandbox environment: development happens against a free
// "Demo Company" org on the connecting Xero account, using the same
// endpoints and credentials as production. Uncertified apps are capped
// at 25 connected orgs, which is plenty until Xero certification.

import type { XeroConnection } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/encryption.js";

const OAUTH_AUTHORIZE = "https://login.xero.com/identity/connect/authorize";
const OAUTH_TOKEN = "https://identity.xero.com/connect/token";
const OAUTH_REVOKE = "https://identity.xero.com/connect/revocation";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API_BASE = "https://api.xero.com/api.xro/2.0";

// offline_access → refresh token; transactions → bank transactions;
// settings → chart of accounts; contacts → the payee contact each
// SPEND transaction names (created implicitly by Name).
const SCOPES =
  "offline_access accounting.transactions accounting.settings accounting.contacts";

// ── Config ───────────────────────────────────────────────────────────

export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Xero OAuth config from env, or null when unset — consumers bail
 *  with a friendly 503, so deploys are inert until the keys land. */
export function getXeroConfig(): XeroConfig | null {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const apiBase = process.env.API_BASE_URL ?? "https://api.mileclear.com";
  const redirectUri = process.env.XERO_REDIRECT_URI ?? `${apiBase}/xero/callback`;
  return { clientId, clientSecret, redirectUri };
}

// ── OAuth ─────────────────────────────────────────────────────────────

export function buildAuthorizeUrl(args: { config: XeroConfig; state: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: args.config.clientId,
    redirect_uri: args.config.redirectUri,
    scope: SCOPES,
    state: args.state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // 1800 (30 min)
  token_type: "Bearer";
}

async function tokenRequest(
  config: XeroConfig,
  body: URLSearchParams,
  label: string
): Promise<TokenResponse> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
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
    throw new Error(`Xero ${label} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function exchangeCodeForTokens(args: {
  config: XeroConfig;
  code: string;
}): Promise<TokenResponse> {
  return tokenRequest(
    args.config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.config.redirectUri,
    }),
    "token exchange"
  );
}

export async function refreshAccessToken(args: {
  config: XeroConfig;
  refreshToken: string;
}): Promise<TokenResponse> {
  return tokenRequest(
    args.config,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: args.refreshToken,
    }),
    "token refresh"
  );
}

/** Tell Xero to invalidate a refresh token. Best-effort. */
export async function revokeRefreshToken(args: {
  config: XeroConfig;
  refreshToken: string;
}): Promise<void> {
  const basic = Buffer.from(`${args.config.clientId}:${args.config.clientSecret}`).toString(
    "base64"
  );
  await fetch(OAUTH_REVOKE, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: args.refreshToken }).toString(),
  });
}

// ── Tenant discovery ─────────────────────────────────────────────────

export interface XeroTenant {
  tenantId: string;
  tenantName: string | null;
  tenantType: string;
}

/** The org(s) this access token is authorised for. */
export async function listTenants(accessToken: string): Promise<XeroTenant[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xero connections lookup failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const rows = (await res.json()) as Array<{
    tenantId: string;
    tenantName: string | null;
    tenantType: string;
  }>;
  return rows.map((r) => ({
    tenantId: r.tenantId,
    tenantName: r.tenantName,
    tenantType: r.tenantType,
  }));
}

// ── Connection persistence ───────────────────────────────────────────

export async function upsertConnection(args: {
  userId: string;
  tenantId: string;
  tenantName: string | null;
  tokens: TokenResponse;
}): Promise<XeroConnection> {
  const data = {
    tenantId: args.tenantId,
    tenantName: args.tenantName,
    accessTokenEncrypted: encrypt(args.tokens.access_token),
    refreshTokenEncrypted: encrypt(args.tokens.refresh_token),
    tokenExpiresAt: new Date(Date.now() + args.tokens.expires_in * 1000),
    status: "active",
  };
  return prisma.xeroConnection.upsert({
    where: { userId: args.userId },
    create: { userId: args.userId, ...data },
    update: data,
  });
}

// ── Authenticated API client ─────────────────────────────────────────

/** Refresh + persist + sync the in-memory connection. Returns the new
 *  access token. */
async function refreshAndSync(connection: XeroConnection): Promise<string> {
  const config = getXeroConfig();
  if (!config) {
    throw new Error("Xero is not configured (missing XERO_CLIENT_ID/SECRET)");
  }
  const refreshToken = decrypt(connection.refreshTokenEncrypted);
  const fresh = await refreshAccessToken({ config, refreshToken });
  const accessTokenEncrypted = encrypt(fresh.access_token);
  const refreshTokenEncrypted = encrypt(fresh.refresh_token);
  const tokenExpiresAt = new Date(Date.now() + fresh.expires_in * 1000);
  await prisma.xeroConnection.update({
    where: { id: connection.id },
    data: { accessTokenEncrypted, refreshTokenEncrypted, tokenExpiresAt },
  });
  connection.accessTokenEncrypted = accessTokenEncrypted;
  connection.refreshTokenEncrypted = refreshTokenEncrypted;
  connection.tokenExpiresAt = tokenExpiresAt;
  return fresh.access_token;
}

async function getValidAccessToken(connection: XeroConnection): Promise<string> {
  const expiresInMs = connection.tokenExpiresAt.getTime() - Date.now();
  if (expiresInMs > 60_000) {
    return decrypt(connection.accessTokenEncrypted);
  }
  return refreshAndSync(connection);
}

/** Issue an authenticated request to the Xero accounting API.
 *  Refreshes the token when stale and retries once on 401. */
export async function xeroApi<T>(
  connection: XeroConnection,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<T> {
  async function attempt(token: string): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "xero-tenant-id": connection.tenantId,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  let res = await attempt(await getValidAccessToken(connection));

  if (res.status === 401) {
    console.warn(`[xero] 401 ${method} ${path} — refreshing token`);
    res = await attempt(await refreshAndSync(connection));
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[xero] ${res.status} ${method} ${path}: ${text.slice(0, 500)}`);
    throw new Error(`Xero API ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}
