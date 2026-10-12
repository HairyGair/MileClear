/**
 * Practice accounts: the rule every practice read goes through.
 * A link is live only when it is active, the driver said yes, it started,
 * and its end date is in the future. Anything else is refused, and a
 * missing end date fails closed.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));

import { linkProblem, visibleClassifications } from "../../services/practice/access.js";
import { renewalStage } from "../../jobs/practiceLinks.js";
import { buildZip, fileSlug } from "../../services/practice/zip.js";
import { inflateRawSync } from "zlib";

const DAY = 86_400_000;
const now = new Date("2026-10-11T12:00:00Z");
const live = {
  status: "active",
  consentedAt: new Date(now.getTime() - 5 * DAY),
  startedAt: new Date(now.getTime() - 5 * DAY),
  endsAt: new Date(now.getTime() + 300 * DAY),
  endedBy: null,
};
const practice = { suspendedAt: null };

describe("linkProblem", () => {
  it("allows a live, consented link", () => {
    expect(linkProblem(live, practice, now)).toBeNull();
  });

  it("refuses with no link", () => {
    expect(linkProblem(null, practice, now)).toBe("no_link");
  });

  it("refuses an invite the driver has not answered", () => {
    expect(linkProblem({ ...live, status: "invited", consentedAt: null, startedAt: null }, practice, now)).toBe(
      "not_answered"
    );
  });

  it("refuses a driver-started link the practice has not accepted", () => {
    expect(linkProblem({ ...live, status: "pending_practice", startedAt: null }, practice, now)).toBe(
      "waiting_for_practice"
    );
  });

  it("refuses once the driver stopped sharing", () => {
    expect(linkProblem({ ...live, status: "ended", endedBy: "driver" }, practice, now)).toBe("stopped");
  });

  it("refuses after the end date, and when there is no end date", () => {
    expect(linkProblem({ ...live, endsAt: new Date(now.getTime() - 1) }, practice, now)).toBe("ended");
    expect(linkProblem({ ...live, endsAt: null }, practice, now)).toBe("ended");
  });

  it("refuses an active row with no recorded consent", () => {
    expect(linkProblem({ ...live, consentedAt: null }, practice, now)).toBe("not_answered");
  });

  it("refuses everything while the practice is paused", () => {
    expect(linkProblem(live, { suspendedAt: now }, now)).toBe("paused");
  });

  it("refuses declined and cancelled links", () => {
    expect(linkProblem({ ...live, status: "declined" }, practice, now)).toBe("declined");
    expect(linkProblem({ ...live, status: "cancelled" }, practice, now)).toBe("declined");
  });
});

describe("visibleClassifications", () => {
  it("is business only unless the driver shares personal trips", () => {
    expect(visibleClassifications({ sharePersonalTrips: false }, "personal")).toEqual(["business"]);
    expect(visibleClassifications({ sharePersonalTrips: false }, "all")).toEqual(["business"]);
    expect(visibleClassifications({ sharePersonalTrips: true }, "personal")).toEqual(["personal"]);
    expect(visibleClassifications({ sharePersonalTrips: true }, "all")).toEqual(["business", "personal"]);
    expect(visibleClassifications({ sharePersonalTrips: true })).toEqual(["business"]);
  });
});

describe("renewal prompts", () => {
  const endsAt = new Date(now.getTime() + 20 * DAY);
  it("asks once inside 30 days, reminds once inside 7", () => {
    expect(renewalStage({ endsAt, renewalAskedAt: null, renewalRemindedAt: null }, now)).toBe("ask");
    expect(renewalStage({ endsAt, renewalAskedAt: now, renewalRemindedAt: null }, now)).toBeNull();
    const soon = new Date(now.getTime() + 5 * DAY);
    expect(renewalStage({ endsAt: soon, renewalAskedAt: now, renewalRemindedAt: null }, now)).toBe("remind");
    expect(renewalStage({ endsAt: soon, renewalAskedAt: now, renewalRemindedAt: now }, now)).toBeNull();
    expect(renewalStage({ endsAt: new Date(now.getTime() + 60 * DAY), renewalAskedAt: null, renewalRemindedAt: null }, now)).toBeNull();
  });
});

describe("zip export", () => {
  it("writes entries a zip reader can find", () => {
    const zip = buildZip([
      { name: "a.csv", data: Buffer.from("Date,Miles\n".repeat(50)) },
      { name: "b.pdf", data: Buffer.from("%PDF-1.4 x") },
    ]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    // First entry is deflated and inflates back.
    const nameLen = zip.readUInt16LE(26);
    const size = zip.readUInt32LE(18);
    const body = zip.subarray(30 + nameLen, 30 + nameLen + size);
    expect(zip.readUInt16LE(8)).toBe(8);
    expect(inflateRawSync(body).toString()).toBe("Date,Miles\n".repeat(50));
  });

  it("makes safe file names from client names", () => {
    expect(fileSlug("Dave Mills")).toBe("dave-mills");
    expect(fileSlug("Zoë O'Brien")).toBe("zoe-o-brien");
    expect(fileSlug("  ")).toBe("client");
  });
});
