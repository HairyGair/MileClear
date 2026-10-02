/**
 * Road alerts trial (2 Oct 2026): the free-tier guard rails on TomTom (tiles
 * under the bbox limit, the daily request cap that survives a restart) and the
 * Street Manager SNS signature check.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));

import {
  DEFAULT_DAILY_CAP,
  MAX_DAILY_CAP,
  budgetAllows,
  dailyCap,
  restoreBudget,
  rollBudget,
  screenMaxAgeMs,
  tileAreaKm2,
  tileIdFor,
  tilesForCorridor,
  utcDayKey,
} from "../../services/tomtomTraffic.js";
import {
  STREET_MANAGER_TOPIC_ARNS,
  handleSnsBody,
  isAwsSnsUrl,
  snsStringToSign,
  verifySnsSignature,
  type SnsMessage,
} from "../../services/streetManager.js";
import { buildCorridor } from "../../services/roadCorridor.js";

const NOW = new Date("2026-10-05T05:00:00Z");

describe("TomTom tiles", () => {
  it("every tile over Great Britain is under TomTom's 10,000 km2 bbox limit", () => {
    for (let lat = 49.9; lat <= 60.9; lat += 0.5) {
      for (let lng = -8.6; lng <= 1.8; lng += 0.5) {
        expect(tileAreaKm2(tileIdFor(lat, lng))).toBeLessThan(10000);
      }
    }
  });

  it("a corridor maps to a handful of shared tiles, biggest share first, capped", () => {
    const line = (lat0: number, lng0: number, lng1: number) =>
      Array.from({ length: 200 }, (_, i) => ({ lat: lat0, lng: lng0 + ((lng1 - lng0) * i) / 199 }));
    // A long east-west run across several tiles, three days
    const c = buildCorridor(["d1", "d2", "d3"].map((dayKey) => ({ dayKey, points: line(53.4, -3.9, 0.9) })));
    const tiles = tilesForCorridor(c, 3);
    expect(tiles).toHaveLength(3);
    expect(new Set(tiles).size).toBe(3);
  });
});

describe("TomTom daily budget", () => {
  afterEach(() => {
    delete process.env.TOMTOM_DAILY_REQUEST_CAP;
  });

  it("defaults to 2,000 a day and never goes above 2,400 whatever the env says", () => {
    expect(dailyCap()).toBe(DEFAULT_DAILY_CAP);
    process.env.TOMTOM_DAILY_REQUEST_CAP = "1500";
    expect(dailyCap()).toBe(1500);
    process.env.TOMTOM_DAILY_REQUEST_CAP = "100000";
    expect(dailyCap()).toBe(MAX_DAILY_CAP);
    process.env.TOMTOM_DAILY_REQUEST_CAP = "nonsense";
    expect(dailyCap()).toBe(DEFAULT_DAILY_CAP);
  });

  it("resets at 00:00 UTC, not at a restart", () => {
    const s = { day: "2026-10-05", used: 1999, stopped: null };
    expect(rollBudget(s, new Date("2026-10-05T23:59:00Z"))).toBe(s);
    expect(rollBudget(s, new Date("2026-10-06T00:00:00Z"))).toEqual({ day: "2026-10-06", used: 0, stopped: null });
    expect(utcDayKey(new Date("2026-10-05T23:30:00Z"))).toBe("2026-10-05"); // 00:30 UK, still the 5th in UTC
  });

  it("stops at the cap, and for the day after a 403/429", () => {
    expect(budgetAllows({ day: "d", used: 1999, stopped: null }, 2000)).toBe(true);
    expect(budgetAllows({ day: "d", used: 2000, stopped: null }, 2000)).toBe(false);
    expect(budgetAllows({ day: "d", used: 3, stopped: "tomtom_429" }, 2000)).toBe(false);
  });

  it("a restart takes the larger of the state file and the last checkpoint (plus margin)", () => {
    const day = utcDayKey(NOW);
    expect(restoreBudget({ day, used: 700, stopped: null }, { used: 650, stopped: null }, NOW).used).toBe(700);
    expect(restoreBudget(null, { used: 650, stopped: null }, NOW).used).toBe(675);
    expect(restoreBudget({ day: "2026-10-04", used: 1999, stopped: "tomtom_429" }, null, NOW)).toEqual({ day, used: 0, stopped: null });
    expect(restoreBudget(null, { used: 100, stopped: "tomtom_403" }, NOW).stopped).toBe("tomtom_403");
  });

  it("the screen backs off as the budget runs down", () => {
    expect(screenMaxAgeMs(100, 2000)).toBe(10 * 60000);
    expect(screenMaxAgeMs(1400, 2000)).toBe(60 * 60000);
    expect(screenMaxAgeMs(1800, 2000)).toBeNull();
  });
});

describe("Street Manager SNS", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pub = publicKey.export({ type: "spki", format: "pem" }).toString();

  function signed(m: SnsMessage, version: "1" | "2" = "1"): SnsMessage {
    const msg = { ...m, SignatureVersion: version };
    const s = createSign(version === "2" ? "RSA-SHA256" : "RSA-SHA1");
    s.update(snsStringToSign(msg)!, "utf8");
    return { ...msg, Signature: s.sign(privateKey, "base64") };
  }

  const notification: SnsMessage = {
    Type: "Notification",
    MessageId: "id-1",
    TopicArn: STREET_MANAGER_TOPIC_ARNS[0],
    Message: '{"object_type":"PERMIT"}',
    Timestamp: "2026-10-05T05:00:00.000Z",
    SigningCertURL: "https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-abc.pem",
  };

  it("builds the canonical string AWS signs", () => {
    expect(snsStringToSign(notification)).toBe(
      `Message\n{"object_type":"PERMIT"}\nMessageId\nid-1\nTimestamp\n2026-10-05T05:00:00.000Z\nTopicArn\n${STREET_MANAGER_TOPIC_ARNS[0]}\nType\nNotification\n`
    );
    expect(snsStringToSign({ ...notification, Type: "Other" })).toBeNull();
    expect(snsStringToSign({ Type: "SubscriptionConfirmation", Message: "m" })).toBeNull(); // missing fields
  });

  it("accepts a correctly signed message (v1 and v2) and rejects a tampered one", () => {
    expect(verifySnsSignature(signed(notification), pub)).toBe(true);
    expect(verifySnsSignature(signed(notification, "2"), pub)).toBe(true);
    const tampered = { ...signed(notification), Message: '{"object_type":"ACTIVITY"}' };
    expect(verifySnsSignature(tampered, pub)).toBe(false);
    expect(verifySnsSignature({ ...signed(notification), SignatureVersion: "9" }, pub)).toBe(false);
  });

  it("only trusts AWS SNS hosts over HTTPS", () => {
    expect(isAwsSnsUrl("https://sns.eu-west-2.amazonaws.com/x.pem", true)).toBe(true);
    expect(isAwsSnsUrl("http://sns.eu-west-2.amazonaws.com/x.pem", true)).toBe(false);
    expect(isAwsSnsUrl("https://sns.eu-west-2.amazonaws.com.evil.com/x.pem", true)).toBe(false);
    expect(isAwsSnsUrl("https://evil.com/sns.eu-west-2.amazonaws.com/x.pem", true)).toBe(false);
    expect(isAwsSnsUrl("https://sns.eu-west-2.amazonaws.com/x.txt", true)).toBe(false);
    expect(isAwsSnsUrl("https://sns.eu-west-2.amazonaws.com/?Action=ConfirmSubscription", false)).toBe(true);
  });

  it("the receiver is a no-op (404) until STREET_MANAGER_SNS_ENABLED=1, and rejects unknown topics", async () => {
    delete process.env.STREET_MANAGER_SNS_ENABLED;
    expect(await handleSnsBody(JSON.stringify(notification))).toEqual({ status: 404, outcome: "disabled" });
    process.env.STREET_MANAGER_SNS_ENABLED = "1";
    try {
      const other = { ...notification, TopicArn: "arn:aws:sns:eu-west-2:000000000000:someone-else" };
      expect((await handleSnsBody(JSON.stringify(other))).outcome).toBe("unknown_topic");
      expect((await handleSnsBody("{nope")).outcome).toBe("bad_json");
      const badCert = { ...notification, SigningCertURL: "https://example.com/cert.pem" };
      expect((await handleSnsBody(JSON.stringify(badCert))).outcome).toBe("bad_cert_url");
    } finally {
      delete process.env.STREET_MANAGER_SNS_ENABLED;
    }
  });
});
