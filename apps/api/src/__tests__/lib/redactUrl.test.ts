import { describe, it, expect } from "vitest";
import { redactUrlSecrets, redactNinoInPath } from "../../lib/redactUrl.js";

// Accountant links are bearer credentials in a URL path. Before 14 Aug 2026
// they reached the pino request log and the app_events table verbatim, so a
// log reader held working keys to users' tax data.
describe("redactUrlSecrets", () => {
  const token = "a".repeat(128);

  it("redacts an accountant token from a dashboard path", () => {
    expect(redactUrlSecrets(`/accountant/dashboard/${token}`)).toBe(
      "/accountant/dashboard/<redacted>"
    );
  });

  it("redacts it from the export path, query string intact", () => {
    expect(redactUrlSecrets(`/accountant/export/${token}?format=csv&taxYear=2026-27`)).toBe(
      "/accountant/export/<redacted>?format=csv&taxYear=2026-27"
    );
  });

  it("redacts regardless of hex case", () => {
    const mixed = "A1b2C3d4".repeat(8);
    expect(redactUrlSecrets(`/accountant/verify/${mixed}`)).toBe("/accountant/verify/<redacted>");
  });

  it("leaves ordinary paths alone", () => {
    expect(redactUrlSecrets("/trips?page=2")).toBe("/trips?page=2");
    expect(redactUrlSecrets("/user/export")).toBe("/user/export");
  });

  // UUIDs are identifiers we log deliberately (admin routes, trip ids). Each
  // hyphen-separated group is shorter than the threshold, so they survive.
  it("does not redact UUIDs", () => {
    const url = "/admin/users/651c7f44-7959-47d6-84a2-c35cc0b8f2f9/events";
    expect(redactUrlSecrets(url)).toBe(url);
  });
});

describe("redactNinoInPath", () => {
  // Every MTD path shape we actually send that carries a NINO. If a new
  // endpoint is added with the NINO in a position none of these cover, this
  // is the test that should fail.
  const cases: Array<[string, string]> = [
    [
      "/individuals/business/details/AB123456C/list",
      "/individuals/business/details/:nino/list",
    ],
    [
      "/individuals/business/details/AB123456C/XAIS12345678901",
      "/individuals/business/details/:nino/XAIS12345678901",
    ],
    [
      "/individuals/business/self-employment/AB123456C/XAIS12345678901/period",
      "/individuals/business/self-employment/:nino/XAIS12345678901/period",
    ],
    [
      "/individuals/business/self-employment/AB123456C/XAIS12345678901/cumulative/2026-27",
      "/individuals/business/self-employment/:nino/XAIS12345678901/cumulative/2026-27",
    ],
    [
      "/individuals/calculations/AB123456C/self-assessment/2026-27",
      "/individuals/calculations/:nino/self-assessment/2026-27",
    ],
    [
      "/individuals/calculations/AB123456C/self-assessment/2026-27/trigger/in-year",
      "/individuals/calculations/:nino/self-assessment/2026-27/trigger/in-year",
    ],
  ];

  for (const [input, expected] of cases) {
    it(`redacts the NINO in ${input}`, () => {
      expect(redactNinoInPath(input)).toBe(expected);
    });
  }

  it("handles a NINO with no trailing suffix letter", () => {
    expect(redactNinoInPath("/individuals/business/details/AB123456/list")).toBe(
      "/individuals/business/details/:nino/list"
    );
  });

  it("redacts a NINO in the final segment", () => {
    expect(redactNinoInPath("/individuals/whatever/AB123456C")).toBe(
      "/individuals/whatever/:nino"
    );
  });

  it("is case-insensitive, because a lowercase NINO is still a NINO", () => {
    expect(redactNinoInPath("/individuals/business/details/ab123456c/list")).toBe(
      "/individuals/business/details/:nino/list"
    );
  });

  it("leaves paths with no NINO untouched", () => {
    const clean = "/individuals/business/obligations";
    expect(redactNinoInPath(clean)).toBe(clean);
    const bsas = "/individuals/self-assessment/adjustable-summary/self-employment/c75f40a6";
    expect(redactNinoInPath(bsas)).toBe(bsas);
  });

  it("does not eat a business id, which is longer and differently shaped", () => {
    const p = "/individuals/business/self-employment/XAIS12345678901/period";
    expect(redactNinoInPath(p)).toBe(p);
  });

  it("does not match a NINO-shaped substring inside a longer segment", () => {
    // Only a whole path segment is a NINO. A calculation id that happens to
    // contain two letters and six digits must survive intact.
    const p = "/individuals/calculations/AB123456Cxyz/self-assessment";
    expect(redactNinoInPath(p)).toBe(p);
  });

  it("redacts every occurrence, not just the first", () => {
    expect(redactNinoInPath("/a/AB123456C/b/CE654321D/c")).toBe("/a/:nino/b/:nino/c");
  });

  it("is stateless across calls despite the global regex", () => {
    // A /g regex reused via .replace resets lastIndex, but assert it anyway:
    // a stale lastIndex would silently leak a NINO on every other call.
    const p = "/individuals/business/details/AB123456C/list";
    const first = redactNinoInPath(p);
    expect(redactNinoInPath(p)).toBe(first);
    expect(redactNinoInPath(p)).toBe(first);
  });
});
