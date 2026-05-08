// HMRC MTD ITSA configuration. Loaded from env at boot, validates the
// required vars and exposes the right base URLs for the chosen environment.
//
// Sandbox vs Production: HMRC uses two completely separate hostnames
// (test-api.service.hmrc.uk vs api.service.hmrc.uk). Credentials are also
// distinct. Phase 1-3 of the build runs entirely in sandbox; production
// access is gated by HMRC's Software Application Review (~3-4 weeks).

export type HmrcEnvironment = "sandbox" | "production";

export interface HmrcConfig {
  clientId: string;
  clientSecret: string;
  environment: HmrcEnvironment;
  // Where HMRC sends the user back after they approve OAuth. Must match
  // the redirect URI registered on the developer hub for the app.
  redirectUri: string;
  // Vendor identification for fraud-prevention headers. Sent on every
  // API call as Gov-Vendor-Product-Name / Gov-Vendor-Version.
  vendorProductName: string;
  vendorVersion: string;
  vendorLicenseIds: string;
  // Computed base URLs.
  apiBaseUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
}

// HMRC base hostnames live on the .gov.uk subdomain. Earlier values
// here omitted ".gov" — `test-api.service.hmrc.uk` does not resolve,
// so any production call would have failed at DNS lookup. Verified
// 8 May 2026 against the HMRC Developer Hub during MTD ITSA Phase 2
// day 2 work.
const SANDBOX_BASE = "https://test-api.service.hmrc.gov.uk";
const PRODUCTION_BASE = "https://api.service.hmrc.gov.uk";

let cached: HmrcConfig | null = null;

/**
 * Load + validate HMRC config. Returns null if the API isn't configured
 * yet (env vars empty during Phase 1 setup). Routes that need a real
 * config check this and return 503 with a clear error rather than
 * crashing on a missing var.
 */
export function getHmrcConfig(): HmrcConfig | null {
  if (cached) return cached;

  const clientId = process.env.HMRC_CLIENT_ID?.trim();
  const clientSecret = process.env.HMRC_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const envRaw = (process.env.HMRC_ENVIRONMENT ?? "sandbox").toLowerCase();
  if (envRaw !== "sandbox" && envRaw !== "production") {
    throw new Error(
      `HMRC_ENVIRONMENT must be "sandbox" or "production", got "${envRaw}"`
    );
  }
  const environment: HmrcEnvironment = envRaw;

  const apiBaseUrl = environment === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, "") ?? "https://api.mileclear.com";
  const redirectUri = process.env.HMRC_REDIRECT_URI?.trim() || `${apiBase}/hmrc/callback`;

  cached = {
    clientId,
    clientSecret,
    environment,
    redirectUri,
    vendorProductName: process.env.HMRC_VENDOR_PRODUCT_NAME?.trim() || "MileClear",
    vendorVersion: process.env.HMRC_VENDOR_VERSION?.trim() || "1.2.0",
    vendorLicenseIds: process.env.HMRC_VENDOR_LICENSE_IDS?.trim() || "",
    apiBaseUrl,
    authorizeUrl: `${apiBaseUrl}/oauth/authorize`,
    tokenUrl: `${apiBaseUrl}/oauth/token`,
  };
  return cached;
}

/** Reset the cached config. Test-only — never call in production. */
export function resetHmrcConfig(): void {
  cached = null;
}

/**
 * Full set of OAuth scopes the MTD ITSA build needs across phases. Every
 * scope here is paired with an API subscribed on the developer hub. We
 * request all of them at first connect so users only OAuth once.
 */
export const HMRC_SCOPES = [
  "read:self-assessment",
  "write:self-assessment",
  "read:individual-calculations",
  "read:obligations",
  "write:self-assessment-assist",
  "read:test-fraud-prevention-headers",
] as const;
