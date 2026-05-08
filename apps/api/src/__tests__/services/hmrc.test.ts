import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateStateToken,
  buildAuthorizationUrl,
  buildFraudPreventionHeaders,
  getHmrcConfig,
  resetHmrcConfig,
  normaliseObligation,
  HMRC_SCOPES,
  pickPrimarySelfEmployment,
  isValidHmrcTaxYear,
} from "../../services/hmrc/index.js";

const originalEnv = { ...process.env };

function setHmrcEnv(overrides: Record<string, string | undefined> = {}): void {
  process.env.HMRC_CLIENT_ID = "test-client-id";
  process.env.HMRC_CLIENT_SECRET = "test-client-secret";
  process.env.HMRC_ENVIRONMENT = "sandbox";
  process.env.HMRC_REDIRECT_URI = "https://api.mileclear.com/hmrc/callback";
  process.env.HMRC_VENDOR_PRODUCT_NAME = "MileClear";
  process.env.HMRC_VENDOR_VERSION = "1.2.0";
  process.env.HMRC_VENDOR_LICENSE_IDS = "";
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetHmrcConfig();
}

beforeEach(() => {
  setHmrcEnv();
});

afterEach(() => {
  process.env = { ...originalEnv };
  resetHmrcConfig();
});

describe("getHmrcConfig", () => {
  it("returns null when HMRC_CLIENT_ID is missing", () => {
    setHmrcEnv({ HMRC_CLIENT_ID: undefined });
    expect(getHmrcConfig()).toBeNull();
  });

  it("returns null when HMRC_CLIENT_SECRET is missing", () => {
    setHmrcEnv({ HMRC_CLIENT_SECRET: undefined });
    expect(getHmrcConfig()).toBeNull();
  });

  it("uses sandbox base URL when env=sandbox", () => {
    const config = getHmrcConfig();
    expect(config?.apiBaseUrl).toBe("https://test-api.service.hmrc.gov.uk");
    expect(config?.environment).toBe("sandbox");
  });

  it("uses production base URL when env=production", () => {
    setHmrcEnv({ HMRC_ENVIRONMENT: "production" });
    const config = getHmrcConfig();
    expect(config?.apiBaseUrl).toBe("https://api.service.hmrc.gov.uk");
    expect(config?.environment).toBe("production");
  });

  it("throws on invalid environment", () => {
    setHmrcEnv({ HMRC_ENVIRONMENT: "staging" });
    expect(() => getHmrcConfig()).toThrow(/HMRC_ENVIRONMENT/);
  });

  it("computes the correct authorize and token URLs", () => {
    const config = getHmrcConfig();
    expect(config?.authorizeUrl).toBe("https://test-api.service.hmrc.gov.uk/oauth/authorize");
    expect(config?.tokenUrl).toBe("https://test-api.service.hmrc.gov.uk/oauth/token");
  });
});

describe("generateStateToken", () => {
  it("returns a non-empty base64url string", () => {
    const token = generateStateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(20);
  });

  it("returns different tokens on each call", () => {
    const a = generateStateToken();
    const b = generateStateToken();
    expect(a).not.toBe(b);
  });
});

describe("buildAuthorizationUrl", () => {
  it("includes the full set of scopes by default", () => {
    const config = getHmrcConfig()!;
    const url = buildAuthorizationUrl({ config, state: "abc" });
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope") ?? "";
    for (const s of HMRC_SCOPES) expect(scope).toContain(s);
  });

  it("includes client_id, redirect_uri, state, response_type", () => {
    const config = getHmrcConfig()!;
    const url = buildAuthorizationUrl({ config, state: "the-state" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://api.mileclear.com/hmrc/callback");
    expect(parsed.searchParams.get("state")).toBe("the-state");
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });
});

describe("buildFraudPreventionHeaders", () => {
  const config = (() => {
    setHmrcEnv();
    return getHmrcConfig()!;
  })();

  const server = {
    serverPublicIp: "1.2.3.4",
    serverLocalIp: "10.0.0.1",
    receivedAt: "2026-05-04T19:30:00.000Z",
  };

  // Spec v3.3 (validated 8 May 2026 against Test Fraud Prevention Headers
  // API). Tests assert the key-value structures HMRC's validator expects;
  // earlier shapes (plain UA strings, "+0100" timezone offsets) are
  // rejected with INVALID_HEADER.

  it("emits the mandatory vendor headers in key-value structure", () => {
    const headers = buildFraudPreventionHeaders({
      config,
      server,
      client: {
        connectionMethod: "MOBILE_APP_VIA_SERVER",
        deviceId: "device-uuid-1",
        publicIp: "5.6.7.8",
        publicIpTimestamp: "2026-05-08T19:30:00.000Z",
        publicPort: "443",
        osFamily: "iOS",
        osVersion: "17.4.1",
        deviceManufacturer: "Apple",
        deviceModel: "iPhone15,2",
        screenWidth: 1170,
        screenHeight: 2532,
        scalingFactor: 3,
        colourDepth: 24,
        language: "en-GB",
        timezone: "Europe/London",
        timezoneOffset: "UTC+01:00",
      },
    });

    expect(headers["Gov-Vendor-Product-Name"]).toBe("MileClear");
    expect(headers["Gov-Vendor-Version"]).toBe("client=1.2.0&server=1.2.0");
    expect(headers["Gov-Vendor-Public-IP"]).toBe("1.2.3.4");
    expect(headers["Gov-Vendor-Forwarded"]).toBe("by=1.2.3.4&for=5.6.7.8");
    // Local-IP no longer sent — validator flags it as UNEXPECTED_HEADER.
    expect(headers["Gov-Vendor-Local-IP"]).toBeUndefined();
    expect(headers["Gov-Client-Connection-Method"]).toBe("MOBILE_APP_VIA_SERVER");
    expect(headers["Gov-Client-Device-ID"]).toBe("device-uuid-1");
    expect(headers["Gov-Client-Public-IP"]).toBe("5.6.7.8");
    expect(headers["Gov-Client-Public-IP-Timestamp"]).toBe("2026-05-08T19:30:00.000Z");
    expect(headers["Gov-Client-Public-Port"]).toBe("443");
    expect(headers["Gov-Client-Screens"]).toBe(
      "width=1170&height=2532&scaling-factor=3&colour-depth=24"
    );
    expect(headers["Gov-Client-Window-Size"]).toBe("width=1170&height=2532");
    expect(headers["Gov-Client-Timezone"]).toBe("UTC+01:00");
  });

  it("encodes user-agent as os-family/version/manufacturer/model key-value", () => {
    const headers = buildFraudPreventionHeaders({
      config,
      server,
      client: {
        connectionMethod: "MOBILE_APP_VIA_SERVER",
        deviceId: "d1",
        publicIp: "5.6.7.8",
        publicIpTimestamp: "2026-05-08T19:30:00.000Z",
        publicPort: "443",
        osFamily: "iOS",
        osVersion: "17.4.1",
        deviceManufacturer: "Apple",
        deviceModel: "iPhone15,2",
        screenWidth: 100,
        screenHeight: 200,
        language: "en-GB",
        timezone: "Europe/London",
        timezoneOffset: "UTC+01:00",
      },
    });
    expect(headers["Gov-Client-User-Agent"]).toBe(
      "os-family=iOS&os-version=17.4.1&device-manufacturer=Apple&device-model=iPhone15%2C2"
    );
  });

  it("emits web-shaped headers when connection method is web", () => {
    const headers = buildFraudPreventionHeaders({
      config,
      server,
      client: {
        connectionMethod: "WEB_APP_VIA_SERVER",
        publicIp: "5.6.7.8",
        publicIpTimestamp: "2026-05-08T19:30:00.000Z",
        publicPort: "443",
        browserName: "Safari",
        browserVersion: "17.4",
        windowWidth: 1440,
        windowHeight: 900,
        language: "en-GB",
        timezone: "Europe/London",
        timezoneOffset: "UTC+01:00",
      },
    });
    expect(headers["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
    expect(headers["Gov-Client-Window-Size"]).toBe("width=1440&height=900");
    expect(headers["Gov-Client-Timezone"]).toBe("UTC+01:00");
    expect(headers["Gov-Client-Device-ID"]).toBeUndefined();
    expect(headers["Gov-Client-User-Agent"]).toBe("browser-name=Safari&browser-version=17.4");
  });

  it("throws when a required header would be empty", () => {
    expect(() =>
      buildFraudPreventionHeaders({
        config,
        server,
        client: {
          connectionMethod: "MOBILE_APP_VIA_SERVER",
          deviceId: "",
          publicIp: "5.6.7.8",
          publicIpTimestamp: "2026-05-08T19:30:00.000Z",
          publicPort: "443",
          osFamily: "iOS",
          osVersion: "17.4.1",
          deviceManufacturer: "Apple",
          deviceModel: "iPhone15,2",
          screenWidth: 100,
          screenHeight: 200,
          language: "en-GB",
          timezone: "Europe/London",
          timezoneOffset: "UTC+01:00",
        },
      })
    ).toThrow(/Gov-Client-Device-ID.*empty/i);
  });

  it("includes Multi-Factor only when methods are provided, with unique-reference each", () => {
    const withoutMfa = buildFraudPreventionHeaders({
      config,
      server,
      client: {
        connectionMethod: "MOBILE_APP_VIA_SERVER",
        deviceId: "d1",
        publicIp: "5.6.7.8",
        publicIpTimestamp: "2026-05-08T19:30:00.000Z",
        publicPort: "443",
        osFamily: "iOS",
        osVersion: "17.4.1",
        deviceManufacturer: "Apple",
        deviceModel: "iPhone15,2",
        screenWidth: 100,
        screenHeight: 200,
        language: "en-GB",
        timezone: "Europe/London",
        timezoneOffset: "UTC+01:00",
      },
    });
    expect(withoutMfa["Gov-Client-Multi-Factor"]).toBeUndefined();

    const withMfa = buildFraudPreventionHeaders({
      config,
      server,
      client: {
        connectionMethod: "MOBILE_APP_VIA_SERVER",
        deviceId: "d1",
        publicIp: "5.6.7.8",
        publicIpTimestamp: "2026-05-08T19:30:00.000Z",
        publicPort: "443",
        osFamily: "iOS",
        osVersion: "17.4.1",
        deviceManufacturer: "Apple",
        deviceModel: "iPhone15,2",
        screenWidth: 100,
        screenHeight: 200,
        language: "en-GB",
        timezone: "Europe/London",
        timezoneOffset: "UTC+01:00",
        multiFactor: [
          {
            type: "TOTP",
            uniqueReference: "user-totp-method-1",
            timestamp: "2026-05-08T19:30:00.000Z",
          },
        ],
      },
    });
    expect(withMfa["Gov-Client-Multi-Factor"]).toContain("type=TOTP");
    expect(withMfa["Gov-Client-Multi-Factor"]).toContain("unique-reference=user-totp-method-1");
  });
});

describe("normaliseObligation", () => {
  const FIXED_NOW = new Date("2026-08-01T12:00:00.000Z");

  it("flags an Open obligation 6 days out as due soon", () => {
    const result = normaliseObligation(
      {
        start: "2026-04-06",
        end: "2026-07-05",
        due: "2026-08-07",
        periodKey: "Q1",
        status: "Open",
      },
      FIXED_NOW
    );
    expect(result.daysUntilDue).toBe(6);
    expect(result.isDueSoon).toBe(true);
    expect(result.isOverdue).toBe(false);
    expect(result.isFulfilled).toBe(false);
  });

  it("flags an Open obligation 30 days out as not due soon", () => {
    const result = normaliseObligation(
      {
        start: "2026-07-06",
        end: "2026-10-05",
        due: "2026-08-31",
        periodKey: "Q2",
        status: "Open",
      },
      FIXED_NOW
    );
    expect(result.isDueSoon).toBe(false);
    expect(result.isOverdue).toBe(false);
  });

  it("flags an Open obligation past its due date as overdue", () => {
    const result = normaliseObligation(
      {
        start: "2026-01-06",
        end: "2026-04-05",
        due: "2026-05-07",
        periodKey: "Q4-prior",
        status: "Open",
      },
      FIXED_NOW
    );
    expect(result.daysUntilDue).toBeLessThan(0);
    expect(result.isOverdue).toBe(true);
    expect(result.isDueSoon).toBe(false);
  });

  it("never flags a Fulfilled obligation as overdue or due-soon", () => {
    const result = normaliseObligation(
      {
        start: "2026-01-06",
        end: "2026-04-05",
        due: "2026-05-07",
        periodKey: "Q4-prior",
        status: "Fulfilled",
        received: "2026-04-30",
      },
      FIXED_NOW
    );
    expect(result.isFulfilled).toBe(true);
    expect(result.isOverdue).toBe(false);
    expect(result.isDueSoon).toBe(false);
  });
});

describe("isValidHmrcTaxYear", () => {
  it("accepts the standard YYYY-YY format with consecutive years", () => {
    expect(isValidHmrcTaxYear("2025-26")).toBe(true);
    expect(isValidHmrcTaxYear("2024-25")).toBe(true);
    expect(isValidHmrcTaxYear("2023-24")).toBe(true);
  });

  it("handles the century boundary correctly", () => {
    // 2099-00 is the last valid pre-2100 tax year per the modulo wrap.
    expect(isValidHmrcTaxYear("2099-00")).toBe(true);
  });

  it("rejects non-consecutive year halves", () => {
    expect(isValidHmrcTaxYear("2025-27")).toBe(false);
    expect(isValidHmrcTaxYear("2025-24")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isValidHmrcTaxYear("2025-2026")).toBe(false);
    expect(isValidHmrcTaxYear("25-26")).toBe(false);
    expect(isValidHmrcTaxYear("2025/26")).toBe(false);
    expect(isValidHmrcTaxYear("")).toBe(false);
    expect(isValidHmrcTaxYear("not a year")).toBe(false);
  });
});

describe("pickPrimarySelfEmployment", () => {
  it("returns the first self-employment business when one exists", () => {
    const result = pickPrimarySelfEmployment([
      { typeOfBusiness: "uk-property", businessId: "X1" },
      { typeOfBusiness: "self-employment", businessId: "X2", tradingName: "Acme" },
      { typeOfBusiness: "self-employment", businessId: "X3" },
    ]);
    expect(result?.businessId).toBe("X2");
  });

  it("returns null when no self-employment business exists", () => {
    const result = pickPrimarySelfEmployment([
      { typeOfBusiness: "uk-property", businessId: "X1" },
      { typeOfBusiness: "foreign-property", businessId: "X2" },
    ]);
    expect(result).toBeNull();
  });

  it("returns null when the list is empty", () => {
    expect(pickPrimarySelfEmployment([])).toBeNull();
  });
});
