import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
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
  buildPeriodSubmission,
  getQuartersForTaxYear,
  penceToPounds,
  poundsToPence,
  isValidCalculationType,
  summariseCalculation,
  isValidBsasBusinessType,
  summariseBsas,
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

describe("penceToPounds / poundsToPence", () => {
  it("converts integer pence to pounds with 2-decimal precision", () => {
    expect(penceToPounds(0)).toBe(0);
    expect(penceToPounds(1)).toBe(0.01);
    expect(penceToPounds(99)).toBe(0.99);
    expect(penceToPounds(100)).toBe(1);
    expect(penceToPounds(12345)).toBe(123.45);
    expect(penceToPounds(1234567)).toBe(12345.67);
  });

  it("guards against NaN / Infinity", () => {
    expect(penceToPounds(NaN)).toBe(0);
    expect(penceToPounds(Infinity)).toBe(0);
    expect(penceToPounds(-Infinity)).toBe(0);
  });

  it("round-trips cleanly through poundsToPence", () => {
    for (const pence of [0, 1, 99, 100, 12345, 999999]) {
      expect(poundsToPence(penceToPounds(pence))).toBe(pence);
    }
  });
});

describe("getQuartersForTaxYear", () => {
  it("returns the four standard MTD quarters for 2025-26", () => {
    const quarters = getQuartersForTaxYear("2025-26");
    expect(quarters).toEqual([
      { quarterIndex: 1, periodStartDate: "2025-04-06", periodEndDate: "2025-07-05" },
      { quarterIndex: 2, periodStartDate: "2025-07-06", periodEndDate: "2025-10-05" },
      { quarterIndex: 3, periodStartDate: "2025-10-06", periodEndDate: "2026-01-05" },
      { quarterIndex: 4, periodStartDate: "2026-01-06", periodEndDate: "2026-04-05" },
    ]);
  });

  it("rolls the year correctly across the tax year boundary (2024-25)", () => {
    const quarters = getQuartersForTaxYear("2024-25");
    expect(quarters[0].periodStartDate).toBe("2024-04-06");
    expect(quarters[3].periodEndDate).toBe("2025-04-05");
  });

  it("rejects invalid tax year formats", () => {
    expect(() => getQuartersForTaxYear("2025-2026")).toThrow();
    expect(() => getQuartersForTaxYear("25-26")).toThrow();
    expect(() => getQuartersForTaxYear("2025-27")).toThrow();
    expect(() => getQuartersForTaxYear("")).toThrow();
  });
});

// ── buildPeriodSubmission ─────────────────────────────────────────────
//
// We mock PrismaClient at the call-site level. The function only touches
// 4 model methods (earning.findMany, vehicle.findFirst, trip.findMany,
// trip.aggregate, expense.findMany), so a hand-rolled stub is cheaper
// than spinning up a real test database here. End-to-end DB tests will
// land alongside the route-level integration tests in Phase 3.

interface MockPrismaCalls {
  earnings: { id: string; platform: string; amountPence: number }[];
  primaryVehicle: { vehicleType: string; make?: string; model?: string } | null;
  trips: { distanceMiles: number }[];
  priorTripsTotal: number;
  expenses: { id: string; category: string; amountPence: number }[];
}

function makeMockPrisma(data: MockPrismaCalls): PrismaClient {
  return {
    earning: {
      findMany: async () => data.earnings,
    },
    vehicle: {
      findFirst: async () => data.primaryVehicle,
    },
    trip: {
      findMany: async () => data.trips,
      aggregate: async () => ({ _sum: { distanceMiles: data.priorTripsTotal } }),
    },
    expense: {
      findMany: async () => data.expenses,
    },
  } as unknown as PrismaClient;
}

describe("buildPeriodSubmission", () => {
  const baseArgs = {
    userId: "user-1",
    taxYear: "2025-26",
    periodStartDate: "2025-04-06",
    periodEndDate: "2025-07-05",
  } as const;

  it("returns zeroed payload when the user has no data", async () => {
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: { vehicleType: "car" },
      trips: [],
      priorTripsTotal: 0,
      expenses: [],
    });

    const result = await buildPeriodSubmission({ prisma, ...baseArgs });

    expect(result.periodDates).toEqual({
      periodStartDate: "2025-04-06",
      periodEndDate: "2025-07-05",
    });
    expect(result.periodIncome.turnover).toBe(0);
    expect(result.periodIncome.other).toBe(0);
    expect(result.periodExpenses).toEqual({}); // all zero, all omitted
    expect(result.breakdown.income.earningCount).toBe(0);
    expect(result.breakdown.mileage.deductionPence).toBe(0);
    expect(result.breakdown.mileage.tripCount).toBe(0);
  });

  it("aggregates earnings by platform", async () => {
    const prisma = makeMockPrisma({
      earnings: [
        { id: "e1", platform: "uber", amountPence: 50_000 },
        { id: "e2", platform: "uber", amountPence: 30_000 },
        { id: "e3", platform: "deliveroo", amountPence: 25_000 },
      ],
      primaryVehicle: { vehicleType: "car" },
      trips: [],
      priorTripsTotal: 0,
      expenses: [],
    });

    const result = await buildPeriodSubmission({ prisma, ...baseArgs });

    expect(result.periodIncome.turnover).toBe(1050); // £1050.00
    expect(result.breakdown.income.earningCount).toBe(3);
    // Sorted by pence descending — uber (£800) before deliveroo (£250)
    expect(result.breakdown.income.perPlatform).toEqual([
      { platform: "uber", pence: 80_000, count: 2 },
      { platform: "deliveroo", pence: 25_000, count: 1 },
    ]);
  });

  it("computes mileage deduction at AMAP rate", async () => {
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: { vehicleType: "car" },
      trips: [{ distanceMiles: 100 }, { distanceMiles: 50 }],
      priorTripsTotal: 0,
      expenses: [],
    });

    const result = await buildPeriodSubmission({ prisma, ...baseArgs });

    // 150 miles at 45p = £67.50, lands in carVanTravelExpenses
    expect(result.breakdown.mileage.businessMilesThisPeriod).toBe(150);
    expect(result.breakdown.mileage.deductionPence).toBe(6750);
    expect(result.breakdown.mileage.crossesTenKThreshold).toBe(false);
    expect(result.periodExpenses.carVanTravelExpenses).toBe(67.5);
  });

  it("crosses the 10,000-mile threshold correctly mid-period", async () => {
    // User did 8,000 miles in Q1; doing 4,000 in Q2 spans the threshold.
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: { vehicleType: "car" },
      trips: [{ distanceMiles: 4000 }],
      priorTripsTotal: 8000,
      expenses: [],
    });

    const result = await buildPeriodSubmission({
      prisma,
      ...baseArgs,
      periodStartDate: "2025-07-06",
      periodEndDate: "2025-10-05",
    });

    // 2,000 miles at 45p (top-up to 10k) + 2,000 at 25p = £900 + £500 = £1,400
    expect(result.breakdown.mileage.deductionPence).toBe(140_000);
    expect(result.breakdown.mileage.crossesTenKThreshold).toBe(true);
  });

  it("uses motorbike flat rate when primary vehicle is a motorbike", async () => {
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: { vehicleType: "motorbike" },
      trips: [{ distanceMiles: 1000 }],
      priorTripsTotal: 0,
      expenses: [],
    });

    const result = await buildPeriodSubmission({ prisma, ...baseArgs });

    // 1,000 miles at 24p flat = £240
    expect(result.breakdown.mileage.deductionPence).toBe(24_000);
    expect(result.breakdown.mileage.vehicleType).toBe("motorbike");
  });

  it("warns + defaults to car when no primary vehicle is set", async () => {
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: null,
      trips: [{ distanceMiles: 100 }],
      priorTripsTotal: 0,
      expenses: [],
    });

    const result = await buildPeriodSubmission({ prisma, ...baseArgs });

    expect(result.breakdown.mileage.vehicleType).toBe("car");
    expect(result.breakdown.warnings.some((w) => w.includes("primary vehicle"))).toBe(true);
  });

  it("buckets expenses by SA103S box and excludes non-AMAP-compatible motor costs", async () => {
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: { vehicleType: "car" },
      trips: [],
      priorTripsTotal: 0,
      expenses: [
        // Box 17, AMAP-compatible — included
        { id: "x1", category: "parking", amountPence: 1500 },
        { id: "x2", category: "tolls", amountPence: 800 },
        // Box 17, AMAP-incompatible — excluded
        { id: "x3", category: "maintenance", amountPence: 50_000 },
        { id: "x4", category: "insurance", amountPence: 80_000 },
        // Box 18 — admin
        { id: "x5", category: "phone", amountPence: 2000 },
        { id: "x6", category: "equipment", amountPence: 4000 },
        // Box 19 — other
        { id: "x7", category: "professional_fees", amountPence: 15_000 },
        { id: "x8", category: "subsistence", amountPence: 3000 },
      ],
    });

    const result = await buildPeriodSubmission({ prisma, ...baseArgs });

    expect(result.periodExpenses.carVanTravelExpenses).toBe(23); // £15 + £8 parking/tolls
    expect(result.periodExpenses.adminCosts).toBe(60); // £20 phone + £40 equipment
    expect(result.periodExpenses.otherExpenses).toBe(180); // £150 prof fees + £30 subsistence
    expect(result.breakdown.expenses.excludedNonAmapPence).toBe(130_000);
    expect(result.breakdown.warnings.some((w) => w.includes("motor running costs"))).toBe(true);
  });

  it("includes mileage deduction inside carVanTravelExpenses alongside parking", async () => {
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: { vehicleType: "car" },
      trips: [{ distanceMiles: 100 }],
      priorTripsTotal: 0,
      expenses: [{ id: "x1", category: "parking", amountPence: 1000 }],
    });

    const result = await buildPeriodSubmission({ prisma, ...baseArgs });

    // £45 mileage + £10 parking = £55.00
    expect(result.periodExpenses.carVanTravelExpenses).toBe(55);
  });

  it("rejects period dates that fall outside the tax year", async () => {
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: { vehicleType: "car" },
      trips: [],
      priorTripsTotal: 0,
      expenses: [],
    });

    await expect(
      buildPeriodSubmission({
        prisma,
        userId: "u1",
        taxYear: "2025-26",
        periodStartDate: "2024-04-06", // before tax year start
        periodEndDate: "2024-07-05",
      })
    ).rejects.toThrow(/before tax year/);
  });

  it("rejects when periodEndDate is not after periodStartDate", async () => {
    const prisma = makeMockPrisma({
      earnings: [],
      primaryVehicle: { vehicleType: "car" },
      trips: [],
      priorTripsTotal: 0,
      expenses: [],
    });

    await expect(
      buildPeriodSubmission({
        prisma,
        userId: "u1",
        taxYear: "2025-26",
        periodStartDate: "2025-07-05",
        periodEndDate: "2025-04-06",
      })
    ).rejects.toThrow();
  });
});

describe("isValidCalculationType", () => {
  it("accepts the three HMRC-defined types", () => {
    expect(isValidCalculationType("in-year")).toBe(true);
    expect(isValidCalculationType("intent-to-finalise")).toBe(true);
    expect(isValidCalculationType("intent-to-amend")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidCalculationType("inYear")).toBe(false);
    expect(isValidCalculationType("crystallise")).toBe(false);
    expect(isValidCalculationType("")).toBe(false);
    expect(isValidCalculationType("IN-YEAR")).toBe(false);
  });
});

describe("summariseCalculation", () => {
  it("projects headline figures from endOfYearEstimate when present", () => {
    const result = summariseCalculation(
      {
        metadata: { calculationId: "calc-1", taxYear: "2025-26" },
        calculation: {
          endOfYearEstimate: {
            totalEstimatedIncome: 52_000,
            totalAllowancesAndDeductions: 12_570,
            totalTaxableIncome: 39_430,
            incomeTaxAmount: 5772,
            nic2: 179,
            nic4: 2300,
            incomeTaxNicAmount: 8251,
          },
        },
      },
      "calc-1"
    );

    expect(result.calculationId).toBe("calc-1");
    expect(result.taxYear).toBe("2025-26");
    expect(result.totalIncomeReceived).toBe(52_000);
    expect(result.totalTaxableIncome).toBe(39_430);
    expect(result.incomeTaxAmount).toBe(5772);
    expect(result.nic2).toBe(179);
    expect(result.nic4).toBe(2300);
    expect(result.totalIncomeTaxAndNicsDue).toBe(8251);
    expect(result.ready).toBe(true);
  });

  it("falls back to incomeTaxNicsCalculated when endOfYearEstimate is absent", () => {
    const result = summariseCalculation(
      {
        metadata: { calculationId: "calc-2", taxYear: "2025-26" },
        calculation: {
          incomeTaxNicsCalculated: {
            totalIncomeTaxAndNicsDue: 7500,
            incomeTax: { incomeTaxAmount: 5500 },
            nics: { nic2NetOfDeductions: 200, nic4NetOfDeductions: 1800 },
          },
          incomeSummary: { totalIncomeReceived: 50_000 },
          taxableIncome: { totalTaxableIncome: 37_430 },
          allowancesAndDeductions: { totalAllowancesAndDeductions: 12_570 },
        },
      },
      "calc-2"
    );

    expect(result.totalIncomeTaxAndNicsDue).toBe(7500);
    expect(result.incomeTaxAmount).toBe(5500);
    expect(result.nic2).toBe(200);
    expect(result.nic4).toBe(1800);
    expect(result.totalIncomeReceived).toBe(50_000);
    expect(result.ready).toBe(true);
  });

  it("marks ready=false when neither headline figure is present", () => {
    const result = summariseCalculation(
      {
        metadata: { calculationId: "calc-3", taxYear: "2025-26" },
        // calc still running on HMRC's side — empty calculation block
        calculation: {},
      },
      "calc-3"
    );

    expect(result.ready).toBe(false);
    expect(result.totalIncomeTaxAndNicsDue).toBeUndefined();
  });

  it("falls back to the supplied calculationId when metadata omits one", () => {
    const result = summariseCalculation({}, "fallback-id");
    expect(result.calculationId).toBe("fallback-id");
    expect(result.taxYear).toBe("");
    expect(result.ready).toBe(false);
  });

  it("preserves the raw HMRC response under raw", () => {
    const raw = { metadata: { calculationId: "x" }, somethingElse: { weird: true } };
    const result = summariseCalculation(raw, "x");
    expect(result.raw).toBe(raw);
  });
});

describe("isValidBsasBusinessType", () => {
  it("accepts the five HMRC-defined types", () => {
    expect(isValidBsasBusinessType("self-employment")).toBe(true);
    expect(isValidBsasBusinessType("uk-property-fhl")).toBe(true);
    expect(isValidBsasBusinessType("uk-property-non-fhl")).toBe(true);
    expect(isValidBsasBusinessType("foreign-property-fhl-eea")).toBe(true);
    expect(isValidBsasBusinessType("foreign-property")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidBsasBusinessType("selfEmployment")).toBe(false);
    expect(isValidBsasBusinessType("uk-property")).toBe(false); // legacy name
    expect(isValidBsasBusinessType("")).toBe(false);
  });
});

describe("summariseBsas", () => {
  it("projects the headline figures from a normal valid BSAS", () => {
    const result = summariseBsas(
      {
        metadata: {
          calculationId: "bsas-1",
          taxYear: "2025-26",
          summaryStatus: "valid",
        },
        inputs: {
          businessId: "XAIS123",
          typeOfBusiness: "self-employment",
          accountingPeriod: { startDate: "2025-04-06", endDate: "2026-04-05" },
        },
        summaryCalculation: {
          totalIncome: 52_000,
          totalExpenses: 18_000,
          netProfit: 34_000,
        },
      },
      "bsas-1"
    );

    expect(result.bsasId).toBe("bsas-1");
    expect(result.businessId).toBe("XAIS123");
    expect(result.typeOfBusiness).toBe("self-employment");
    expect(result.accountingPeriod.startDate).toBe("2025-04-06");
    expect(result.summaryStatus).toBe("valid");
    expect(result.totalIncome).toBe(52_000);
    expect(result.netProfit).toBe(34_000);
    expect(result.adjustedSummary).toBe(false);
    expect(result.ready).toBe(true);
  });

  it("flags adjustedSummary=true and surfaces adjusted figures", () => {
    const result = summariseBsas(
      {
        metadata: { calculationId: "bsas-2", taxYear: "2025-26", summaryStatus: "valid" },
        inputs: { typeOfBusiness: "self-employment" },
        summaryCalculation: { netProfit: 30_000 },
        adjustedSummaryCalculation: { netProfit: 28_500 },
      },
      "bsas-2"
    );

    expect(result.adjustedSummary).toBe(true);
    expect(result.netProfit).toBe(30_000);
    expect(result.adjustedNetProfit).toBe(28_500);
  });

  it("handles loss-making BSAS (netLoss instead of netProfit)", () => {
    const result = summariseBsas(
      {
        metadata: { calculationId: "bsas-3", taxYear: "2025-26", summaryStatus: "valid" },
        inputs: { typeOfBusiness: "self-employment" },
        summaryCalculation: {
          totalIncome: 12_000,
          totalExpenses: 18_000,
          netLoss: 6_000,
        },
      },
      "bsas-3"
    );

    expect(result.netProfit).toBeUndefined();
    expect(result.netLoss).toBe(6_000);
    expect(result.ready).toBe(true);
  });

  it("marks ready=false when summaryCalculation is empty", () => {
    const result = summariseBsas(
      {
        metadata: { calculationId: "bsas-4", taxYear: "2025-26", summaryStatus: "valid" },
        inputs: { typeOfBusiness: "self-employment" },
        // calc still running
      },
      "bsas-4"
    );

    expect(result.ready).toBe(false);
    expect(result.totalIncome).toBeUndefined();
  });

  it("falls back to the supplied bsasId and self-employment default", () => {
    const result = summariseBsas({}, "fallback-bsas");
    expect(result.bsasId).toBe("fallback-bsas");
    expect(result.typeOfBusiness).toBe("self-employment");
    expect(result.taxYear).toBe("");
    expect(result.summaryStatus).toBe("valid");
    expect(result.ready).toBe(false);
  });
});
