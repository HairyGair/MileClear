import { describe, it, expect } from "vitest";
import {
  hubConnectionLabel,
  nextUpTitle,
  lateTitle,
  sendReassurance,
  upToDateTitle,
  upToDateBody,
  sentProgressText,
  yearHeading,
  finishYearSub,
  tripsToMarkText,
  FINISH_YEAR_COPY,
  lateBody,
  sendEarlyText,
} from "./mtdHubCopy";

describe("hub copy", () => {
  it("says which HMRC service the driver is connected to", () => {
    expect(hubConnectionLabel("production", false, "2026-27")).toBe("Connected to HMRC · 2026-27");
    expect(hubConnectionLabel("sandbox", false, "2026-27")).toBe("Connected to HMRC's test service · 2026-27");
    expect(hubConnectionLabel(undefined, false, "2026-27")).toBe("Connected to HMRC · 2026-27");
    expect(hubConnectionLabel("sandbox", true, "2026-27")).toBe("Test connection expired");
    expect(hubConnectionLabel("production", true, "2026-27")).toBe("Connection expired");
  });
  it("titles use plain months", () => {
    expect(nextUpTitle("July to October")).toBe("Send your July to October update");
    expect(lateTitle("July to October")).toBe("Your July to October update is late");
  });
  it("reassurance is honest about the test service", () => {
    expect(sendReassurance("production")).toContain("Nothing goes to HMRC until you tap Send");
    expect(sendReassurance("sandbox")).toContain("test version");
  });
  it("up to date wording", () => {
    expect(upToDateTitle(false, 1, "2026-27")).toBe("You're up to date");
    expect(upToDateTitle(true, 4, "2026-27")).toBe("All 4 updates sent for 2026-27");
    expect(upToDateBody({ label: "October to January", dueText: "7 February" })).toContain(
      "October to January, due 7 February",
    );
    expect(upToDateBody(null)).toContain("Nothing more to send");
  });
  it("progress, heading, trips", () => {
    expect(sentProgressText(1, 4)).toBe("1 of 4 updates sent");
    expect(sentProgressText(0, 1)).toBe("0 of 1 update sent");
    expect(yearHeading("2026-27")).toBe("Your 2026-27 year");
    expect(tripsToMarkText(14)).toBe("14 trips to mark since 6 April");
    expect(tripsToMarkText(1)).toBe("1 trip to mark since 6 April");
  });
  it("late wording is year-aware", () => {
    expect(lateBody("2026-27")).toContain("isn't giving penalty points");
    expect(lateBody("2027-28")).not.toMatch(/penalty/i);
  });
  it("finish the year never promises a button", () => {
    expect(finishYearSub("31 January 2028", "production")).toBe("By 31 January 2028");
    expect(finishYearSub(null, "production")).toBe("Comes after the last update");
    expect(finishYearSub("31 January 2028", "sandbox")).toContain("test version");
  });
  it("no em dashes, no 'approved' or 'recognised'", () => {
    const all = [
      lateBody("2026-27"), lateBody("2027-28"), sendEarlyText("July to October"),
      FINISH_YEAR_COPY.title, FINISH_YEAR_COPY.body, FINISH_YEAR_COPY.pill,
      sendReassurance("production"), sendReassurance("sandbox"), upToDateBody(null),
    ].join(" ");
    expect(all).not.toMatch(/—/);
    expect(all).not.toMatch(/approved|recognised|recognized/i);
  });
});
