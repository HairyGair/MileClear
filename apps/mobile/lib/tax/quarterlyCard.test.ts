import { describe, it, expect } from "vitest";
import {
  daysUntil,
  dueDay,
  pillFor,
  quarterLabel,
  quarterlyCardModel,
  scopeForCard,
  type QuarterlySummary,
} from "./quarterlyCard";

const quarters = (statuses: Array<"Open" | "Fulfilled">) =>
  [
    { start: "2026-04-06", end: "2026-07-05", due: "2026-08-07" },
    { start: "2026-07-06", end: "2026-10-05", due: "2026-11-07" },
    { start: "2026-10-06", end: "2027-01-05", due: "2027-02-07" },
    { start: "2027-01-06", end: "2027-04-05", due: "2027-05-07" },
  ].map((q, i) => ({ ...q, status: statuses[i] }));

const connected = (statuses: Array<"Open" | "Fulfilled">, seenAt = "2026-10-30T10:00:00.000Z"): QuarterlySummary => ({
  seenAt,
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
    const m = quarterlyCardModel({ summary: connected(["Fulfilled", "Fulfilled", "Open", "Open"], "2026-11-18T10:00:00.000Z"), scope: null, todayIso: "2026-11-20" });
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
    expect(m).toEqual({ kind: "line", text: "Going by your MileClear earnings, quarterly updates to HMRC aren't needed for you yet.", link: "See why" });
  });

  it("does not call old HMRC dates late: it says when it last checked", () => {
    const old = connected(["Fulfilled", "Open", "Open", "Open"], "2026-10-10T10:00:00.000Z");
    const m = quarterlyCardModel({ summary: old, scope: null, todayIso: "2026-11-12" });
    expect(m).toMatchObject({ kind: "card", sub: "Last checked 10 October. Open to see what's due", pill: null, link: "Open" });
  });

  it("treats a missing check date as old", () => {
    const m = quarterlyCardModel({ summary: { ...connected(["Open", "Open", "Open", "Open"]), seenAt: null }, scope: null, todayIso: "2026-11-01" });
    expect(m).toMatchObject({ pill: null, link: "Open" });
  });

  it("keeps the Late pill while the check is recent", () => {
    const m = quarterlyCardModel({ summary: connected(["Fulfilled", "Open", "Open", "Open"], "2026-11-05T10:00:00.000Z"), scope: null, todayIso: "2026-11-12" });
    expect(m.kind === "card" && m.pill?.text).toBe("Late");
  });

  it("stays neutral, not 'not needed', when a finished year has no income held", () => {
    const years = [
      { taxYear: "2024-25", complete: true },
      { taxYear: "2025-26", complete: true },
      { taxYear: "2026-27", complete: false },
    ];
    expect(scopeForCard({ answer: "not_yet", years, missingTaxYears: ["2024-25"] })).toBeNull();
    // Only the running year missing: it can only go up, so "not yet" still stands.
    expect(scopeForCard({ answer: "not_yet", years, missingTaxYears: ["2026-27"] })).toBe("not_yet");
    // Income found over a limit stands whatever else is missing.
    expect(scopeForCard({ answer: "later", years, missingTaxYears: ["2024-25"] })).toBe("later");
    const m = quarterlyCardModel({ summary: notConnected, scope: null, todayIso: "2026-11-01" });
    expect(m).toMatchObject({ kind: "card", sub: "Find out if HMRC needs these from you", link: "Check" });
  });

  it("never claims 'not needed' when it could not find out", () => {
    expect(quarterlyCardModel({ summary: notConnected, scope: null, todayIso: "2026-11-01" }).kind).toBe("card");
    expect(quarterlyCardModel({ summary: null, scope: "not_yet", todayIso: "2026-11-01" }).kind).toBe("card");
    const noQuarters: QuarterlySummary = { connected: true, ready: true, taxYear: null, quarters: [] };
    expect(quarterlyCardModel({ summary: noQuarters, scope: null, todayIso: "2026-11-01" }).kind).toBe("card");
  });
});
