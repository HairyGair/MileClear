import { describe, it, expect } from "vitest";
import {
  daysUntil,
  dueDay,
  pillFor,
  quarterLabel,
  quarterlyCardModel,
  type QuarterlySummary,
} from "./quarterlyCard";

const quarters = (statuses: Array<"Open" | "Fulfilled">) =>
  [
    { start: "2026-04-06", end: "2026-07-05", due: "2026-08-07" },
    { start: "2026-07-06", end: "2026-10-05", due: "2026-11-07" },
    { start: "2026-10-06", end: "2027-01-05", due: "2027-02-07" },
    { start: "2027-01-06", end: "2027-04-05", due: "2027-05-07" },
  ].map((q, i) => ({ ...q, status: statuses[i] }));

const connected = (statuses: Array<"Open" | "Fulfilled">): QuarterlySummary => ({
  connected: true,
  ready: true,
  taxYear: "2026-27",
  quarters: quarters(statuses),
});
const notConnected: QuarterlySummary = { connected: false, ready: false, taxYear: null, quarters: [] };

describe("labels", () => {
  it("names a quarter and a due day in plain words", () => {
    expect(quarterLabel({ start: "2026-07-06", end: "2026-10-05" })).toBe("July to October");
    expect(quarterLabel({ start: "2026-10-06", end: "2027-01-05" })).toBe("October to January");
    expect(dueDay("2026-11-07")).toBe("7 November");
  });
  it("counts days and picks the pill", () => {
    expect(daysUntil("2026-11-01", "2026-11-07")).toBe(6);
    expect(pillFor(6)).toEqual({ text: "6 days", tone: "amber" });
    expect(pillFor(1).text).toBe("1 day");
    expect(pillFor(0).text).toBe("Today");
    expect(pillFor(-2)).toEqual({ text: "Late", tone: "red" });
  });
});

describe("quarterlyCardModel", () => {
  it("shows the due card with progress when a finished quarter is still open", () => {
    const m = quarterlyCardModel({ summary: connected(["Fulfilled", "Open", "Open", "Open"]), scope: "later", todayIso: "2026-11-01" });
    expect(m).toMatchObject({
      kind: "card",
      title: "Quarterly update due",
      sub: "July to October · by 7 November",
      pill: { text: "6 days", tone: "amber" },
      segments: ["sent", "due", "later", "later"],
      progress: "1 of 4 sent for 2026-27",
      link: "Review and send",
    });
  });

  it("goes red and says Late after the due date", () => {
    const m = quarterlyCardModel({ summary: connected(["Fulfilled", "Open", "Open", "Open"]), scope: null, todayIso: "2026-11-09" });
    expect(m.kind === "card" && m.pill).toEqual({ text: "Late", tone: "red" });
  });

  it("is up to date when the next quarter has not ended", () => {
    const m = quarterlyCardModel({ summary: connected(["Fulfilled", "Fulfilled", "Open", "Open"]), scope: null, todayIso: "2026-11-20" });
    expect(m).toMatchObject({
      title: "Quarterly updates",
      sub: "Next: October to January, by 7 February",
      pill: { text: "Up to date", tone: "green" },
      segments: ["sent", "sent", "later", "later"],
    });
  });

  it("says all sent when nothing is open", () => {
    const m = quarterlyCardModel({ summary: connected(["Fulfilled", "Fulfilled", "Fulfilled", "Fulfilled"]), scope: null, todayIso: "2027-05-01" });
    expect(m).toMatchObject({ sub: "All 4 sent for 2026-27", pill: { text: "Up to date" } });
  });

  it("asks a connected driver with no saved business to finish setup", () => {
    const m = quarterlyCardModel({ summary: { ...connected(["Open", "Open", "Open", "Open"]), ready: false }, scope: null, todayIso: "2026-11-01" });
    expect(m).toMatchObject({ link: "Continue setup" });
  });

  it("offers Connect to HMRC to a driver who is in scope", () => {
    const now = quarterlyCardModel({ summary: notConnected, scope: "now", todayIso: "2026-11-01" });
    expect(now).toMatchObject({ link: "Connect to HMRC", sub: "HMRC needs these from you now" });
    const later = quarterlyCardModel({ summary: notConnected, scope: "later", scopeStartsLabel: "April 2027", todayIso: "2026-11-01" });
    expect(later).toMatchObject({ link: "Connect to HMRC", sub: "HMRC needs these from you from 6 April 2027" });
  });

  it("hides the card for a driver who does not need updates yet and keeps one line", () => {
    const m = quarterlyCardModel({ summary: notConnected, scope: "not_yet", todayIso: "2026-11-01" });
    expect(m).toEqual({ kind: "line", text: "Quarterly updates to HMRC: not needed for you yet.", link: "See why" });
  });

  it("never claims 'not needed' when it could not find out", () => {
    expect(quarterlyCardModel({ summary: notConnected, scope: null, todayIso: "2026-11-01" }).kind).toBe("card");
    expect(quarterlyCardModel({ summary: null, scope: "not_yet", todayIso: "2026-11-01" }).kind).toBe("card");
    const noQuarters: QuarterlySummary = { connected: true, ready: true, taxYear: null, quarters: [] };
    expect(quarterlyCardModel({ summary: noQuarters, scope: null, todayIso: "2026-11-01" }).kind).toBe("card");
  });
});
