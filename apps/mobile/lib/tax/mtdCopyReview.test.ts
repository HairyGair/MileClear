import { describe, it, expect } from "vitest";
import * as copy from "./mtdCopy";

describe("check and send / sent wording", () => {
  it("never says test on the real service or while unknown", () => {
    for (const env of ["production", null, undefined] as const) {
      expect(copy.sendButtonLabel(env)).toBe("Send to HMRC");
      expect(copy.confirmSendTitle(env)).toBe("Send to HMRC?");
      expect(copy.confirmSendBody(env, "6 April to 5 October 2026")).not.toMatch(/test/i);
      expect(copy.couldntSendTitle(env)).toBe("Couldn't send");
      expect(copy.sentNavTitle(env)).toBe("Sent");
      expect(copy.sentHeading(env)).not.toMatch(/test/i);
      expect(copy.estimateEyebrow("2026-27", env)).toBe("HMRC'S ESTIMATE FOR 2026-27");
      expect(copy.estimateSourcePill(env)).toBe("From HMRC");
      expect(copy.estimateWaitingText(env)).not.toMatch(/test/i);
    }
  });
  it("says HMRC has the update only when the real service is known", () => {
    expect(copy.sentHeading("production")).toBe("HMRC has your update");
    expect(copy.sentHeading(null)).toBe("Update sent");
  });
  it("keeps test wording on the test service", () => {
    expect(copy.sendButtonLabel("sandbox")).toBe("Send test update");
    expect(copy.couldntSendTitle("sandbox")).toBe("Test update failed");
    expect(copy.estimateSourcePill("sandbox")).toMatch(/test/i);
    expect(copy.confirmSendBody("sandbox", "x")).toMatch(/Nothing reaches HMRC/);
  });
  it("has no em dashes, 'approved' or 'recognised'", () => {
    const all = [
      copy.CHECK_AND_SEND_TITLE,
      copy.ESTIMATE_FAILED_TEXT,
      copy.MISTAKE_LATER_TEXT,
      JSON.stringify(copy.NOTHING_TO_PAY_COPY),
      copy.RUNNING_TOTAL_TEXT,
      copy.SENT_SIGNPOST_TEXT,
      copy.confirmSendBody("production", "p"),
      copy.estimateWaitingText("production"),
    ].join(" ");
    expect(all).not.toMatch(/—|approved|recognised/i);
  });
});
