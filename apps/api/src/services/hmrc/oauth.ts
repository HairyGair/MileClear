// HMRC OAuth 2.0 — authorization-code grant flow against MTD ITSA.
//
// Standard OAuth: we redirect the user to HMRC's authorize endpoint with
// our client ID, scopes, redirect URI, and a CSRF state token. HMRC takes
// them through the gov.uk verify journey, then redirects back to our
// /hmrc/callback with `code` + the state. We exchange the code for an
// access token + refresh token at HMRC's token endpoint.
//
// Tokens live in the HmrcConnection table. Refresh runs lazily — when an
// MTD call gets `INVALID_CREDENTIALS` we refresh and retry once.

import crypto from "node:crypto";
import { HMRC_SCOPES, type HmrcConfig, type HmrcEnvironment } from "./config.js";

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: "bearer";
}

/** Generate a cryptographically random state token for OAuth CSRF protection. */
export function generateStateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Build the URL to redirect the user to for HMRC OAuth. Caller persists
 * the state token against the user's HmrcConnection (or a temporary row
 * if not yet connected) and verifies on callback.
 */
export function buildAuthorizationUrl(args: {
  config: HmrcConfig;
  state: string;
  scopes?: readonly string[];
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: args.config.clientId,
    scope: (args.scopes ?? HMRC_SCOPES).join(" "),
    state: args.state,
    redirect_uri: args.config.redirectUri,
  });
  return `${args.config.authorizeUrl}?${params.toString()}`;
}

/**
 * Exchange the authorization code returned by HMRC for an access + refresh
 * token pair. Throws on non-2xx response.
 */
export async function exchangeCodeForTokens(args: {
  config: HmrcConfig;
  code: string;
}): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    client_id: args.config.clientId,
    client_secret: args.config.clientSecret,
    redirect_uri: args.config.redirectUri,
  });

  const res = await fetch(args.config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/vnd.hmrc.1.0+json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HMRC token exchange failed: HTTP ${res.status} - ${detail}`);
  }

  return (await res.json()) as OAuthTokenResponse;
}

/**
 * Refresh an expired access token. If the refresh token itself is rejected
 * (HMRC returns invalid_grant) the caller should mark the connection as
 * disconnected and prompt the user to re-OAuth.
 */
export async function refreshAccessToken(args: {
  config: HmrcConfig;
  refreshToken: string;
}): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.config.clientId,
    client_secret: args.config.clientSecret,
  });

  const res = await fetch(args.config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/vnd.hmrc.1.0+json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HMRC token refresh failed: HTTP ${res.status} - ${detail}`);
  }

  return (await res.json()) as OAuthTokenResponse;
}

/** Compute the absolute expiry time given an expires_in (seconds) value. */
export function expiryFromExpiresIn(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/** True if the cached token expires within `bufferSeconds` (default 60s). */
export function isTokenExpiringSoon(expiresAt: Date, bufferSeconds = 60): boolean {
  return Date.now() + bufferSeconds * 1000 >= expiresAt.getTime();
}

export type { HmrcEnvironment };
