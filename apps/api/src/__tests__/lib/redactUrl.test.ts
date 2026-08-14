import { describe, it, expect } from "vitest";
import { redactUrlSecrets } from "../../lib/redactUrl.js";

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
