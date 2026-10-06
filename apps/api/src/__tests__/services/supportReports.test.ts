/**
 * In-app problem reports (feedback redesign, 6 Oct 2026): screenshot checks,
 * subjects, which feedback goes private, and who may read a thread.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_SCREENSHOT_BYTES,
  decodeScreenshots,
  isPrivateFeedbackCategory,
  reportSubject,
  sniffImageMime,
  threadBelongsTo,
} from "../../services/supportReports.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const b64 = (b: Buffer) => b.toString("base64");

describe("sniffImageMime", () => {
  it("knows JPEG and PNG by their first bytes", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(PNG)).toBe("image/png");
  });
  it("rejects anything else", () => {
    expect(sniffImageMime(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("decodeScreenshots", () => {
  it("accepts none", () => {
    expect(decodeScreenshots(undefined)).toEqual({ ok: true, images: [] });
  });
  it("stores the sniffed type, not the claimed one", () => {
    const r = decodeScreenshots([{ mime: "image/jpeg", base64: b64(PNG) }]);
    expect(r.ok && r.images[0].mime).toBe("image/png");
  });
  it("strips a data: prefix", () => {
    const r = decodeScreenshots([{ mime: "image/jpeg", base64: `data:image/jpeg;base64,${b64(JPEG)}` }]);
    expect(r.ok && r.images[0].data.equals(JPEG)).toBe(true);
  });
  it("refuses more than three", () => {
    const one = { mime: "image/jpeg", base64: b64(JPEG) };
    expect(decodeScreenshots([one, one, one, one]).ok).toBe(false);
  });
  it("refuses a file that isn't an image", () => {
    expect(decodeScreenshots([{ mime: "image/png", base64: b64(Buffer.from("<script>")) }]).ok).toBe(false);
  });
  it("refuses one over the size cap", () => {
    const big = Buffer.alloc(MAX_SCREENSHOT_BYTES + 1, 0);
    JPEG.copy(big);
    expect(decodeScreenshots([{ mime: "image/jpeg", base64: b64(big) }]).ok).toBe(false);
  });
});

describe("reportSubject", () => {
  it("uses the driver's subject when given", () => {
    expect(reportSubject("  Missing trip  ", "body")).toBe("Missing trip");
  });
  it("falls back to the first line, trimmed to about 60 characters", () => {
    expect(reportSubject(undefined, "Short line\nmore")).toBe("Short line");
    const long = "a".repeat(80);
    const s = reportSubject("", long);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("...")).toBe(true);
  });
});

describe("isPrivateFeedbackCategory", () => {
  it("makes bug reports private and leaves ideas public", () => {
    expect(isPrivateFeedbackCategory("bug_report")).toBe(true);
    expect(isPrivateFeedbackCategory("feature_request")).toBe(false);
    expect(isPrivateFeedbackCategory("improvement")).toBe(false);
    expect(isPrivateFeedbackCategory("other")).toBe(false);
  });
});

describe("threadBelongsTo", () => {
  const me = "u-1";
  const mail = "Driver@Example.com";
  const msg = (o: Partial<{ userId: string | null; isSpam: boolean; direction: string; toEmail: string | null }>) => ({
    userId: null,
    isSpam: false,
    direction: "in",
    toEmail: null,
    ...o,
  });

  it("is theirs when a message carries their account", () => {
    expect(threadBelongsTo([msg({ userId: me }), msg({ direction: "out", userId: me })], me, mail)).toBe(true);
  });
  it("is theirs when we wrote to their address in an unlinked email thread", () => {
    expect(threadBelongsTo([msg({}), msg({ direction: "out", toEmail: "driver@example.com" })], me, mail)).toBe(true);
  });
  it("is not theirs when another account appears in it", () => {
    expect(threadBelongsTo([msg({ userId: me }), msg({ userId: "u-2" })], me, mail)).toBe(false);
  });
  it("is not theirs when spam, empty, or nothing links it to them", () => {
    expect(threadBelongsTo([msg({ userId: me, isSpam: true })], me, mail)).toBe(false);
    expect(threadBelongsTo([], me, mail)).toBe(false);
    expect(threadBelongsTo([msg({ direction: "out", toEmail: "someone@else.com" })], me, mail)).toBe(false);
  });
});
