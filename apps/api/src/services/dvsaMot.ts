// DVSA MOT History API client.
//
// Two-step authentication (separate from DVLA Vehicle Enquiry):
//   1. OAuth client_credentials flow against Microsoft Identity Platform
//      to obtain an access_token (valid ~1 hour).
//   2. Call the MOT History API with both the cached access_token and a
//      static x-api-key header.
//
// Credentials are stashed in env vars (DVSA_MOT_CLIENT_ID/SECRET/API_KEY/
// TENANT_ID). Token is cached in-process to avoid hitting Microsoft on
// every request - sub-second latency for cached lookups.

interface CachedToken {
  accessToken: string;
  expiresAt: number; // ms timestamp
}

let cachedToken: CachedToken | null = null;

// Refresh ~5 minutes before expiry to avoid edge-case 401s mid-request.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.DVSA_MOT_CLIENT_ID;
  const clientSecret = process.env.DVSA_MOT_CLIENT_SECRET;
  const tenantId = process.env.DVSA_MOT_TENANT_ID;
  if (!clientId || !clientSecret || !tenantId) {
    throw new DvsaMotError("DVSA MOT API credentials not configured", 503);
  }

  if (cachedToken && cachedToken.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://tapi.dvsa.gov.uk/.default",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new DvsaMotError(
      `OAuth token fetch failed: ${response.status} ${text.slice(0, 200)}`,
      502
    );
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new DvsaMotError("OAuth token response missing access_token", 502);
  }

  const expiresIn = (data.expires_in ?? 3600) * 1000;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn,
  };
  return cachedToken.accessToken;
}

export interface DvsaMotDefect {
  text: string;
  type: "ADVISORY" | "FAIL" | "MAJOR" | "MINOR" | "DANGEROUS" | "PRS" | "USER ENTERED";
  dangerous: boolean;
}

export interface DvsaMotTestRecord {
  completedDate: string;        // ISO datetime
  testResult: string;           // PASSED, FAILED, ABANDONED, ABORTED
  expiryDate: string | null;    // ISO date - present on PASSED tests
  odometerValue: number | null; // numeric, parsed from string
  odometerUnit: string | null;  // "mi" or "km"
  motTestNumber: string;
  defects: DvsaMotDefect[];
}

export interface DvsaMotHistory {
  registrationNumber: string;
  make: string | null;
  model: string | null;
  firstUsedDate: string | null;
  fuelType: string | null;
  primaryColour: string | null;
  motTests: DvsaMotTestRecord[];
}

export class DvsaMotError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "DvsaMotError";
  }
}

/**
 * Fetch full MOT test history for a UK registration plate.
 * Returns null on 404 (vehicle has no MOT records - e.g. brand new car).
 * Throws DvsaMotError for any other failure mode.
 */
export async function fetchMotHistory(
  registrationNumber: string
): Promise<DvsaMotHistory | null> {
  const apiKey = process.env.DVSA_MOT_API_KEY;
  if (!apiKey) {
    throw new DvsaMotError("DVSA_MOT_API_KEY not configured", 503);
  }

  const accessToken = await getAccessToken();
  const url = `https://history.mot.api.gov.uk/v1/trade/vehicles/registration/${encodeURIComponent(registrationNumber)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json+v6",
      },
    });
  } catch (err) {
    throw new DvsaMotError("DVSA MOT network error", 502, err);
  }

  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    // Invalidate cached token so next call retries auth - covers the case
    // where Microsoft rotated the token early.
    cachedToken = null;
    throw new DvsaMotError("DVSA MOT auth failed", 502);
  }
  if (!response.ok) {
    throw new DvsaMotError(
      `DVSA MOT API error: ${response.status} ${response.statusText}`,
      502
    );
  }

  const raw = (await response.json()) as Record<string, unknown>;

  const motTests = Array.isArray(raw.motTests) ? raw.motTests : [];
  const tests: DvsaMotTestRecord[] = motTests.map((t: unknown) => {
    const r = t as Record<string, unknown>;
    const odo = typeof r.odometerValue === "string" ? r.odometerValue.trim() : "";
    const odoNum = odo && /^\d+$/.test(odo) ? parseInt(odo, 10) : null;
    const defects = Array.isArray(r.defects)
      ? (r.defects as Array<Record<string, unknown>>).map((d) => ({
          text: String(d.text ?? ""),
          type: String(d.type ?? "ADVISORY") as DvsaMotDefect["type"],
          dangerous: Boolean(d.dangerous),
        }))
      : [];
    return {
      completedDate: String(r.completedDate ?? ""),
      testResult: String(r.testResult ?? ""),
      expiryDate: r.expiryDate ? String(r.expiryDate) : null,
      odometerValue: odoNum,
      odometerUnit: r.odometerUnit ? String(r.odometerUnit) : null,
      motTestNumber: String(r.motTestNumber ?? ""),
      defects,
    };
  });

  // Sort newest-first so the UI can render the latest test prominently.
  tests.sort((a, b) => b.completedDate.localeCompare(a.completedDate));

  return {
    registrationNumber,
    make: raw.make ? String(raw.make) : null,
    model: raw.model ? String(raw.model) : null,
    firstUsedDate: raw.firstUsedDate ? String(raw.firstUsedDate) : null,
    fuelType: raw.fuelType ? String(raw.fuelType) : null,
    primaryColour: raw.primaryColour ? String(raw.primaryColour) : null,
    motTests: tests,
  };
}
