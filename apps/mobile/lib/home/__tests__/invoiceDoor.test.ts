import { describe, it, expect } from "vitest";
import { selectDoorRows, availableDoorRows, usesInvoicesRecently, type DoorInputs, type DoorTexts } from "../doors";
import { invoicesDoorText, doorKeyFigure } from "../doorText";
import { parseHiddenDoorRows } from "../doorPrefs";
import { doorSwitches } from "../doorSettings";

const texts = (over: Partial<DoorTexts> = {}): DoorTexts => ({
  road: null,
  tax: { text: "Tax line", route: "/(tabs)/tax" },
  insights: { text: "Insights line", route: "/insights" },
  earnings: "Earnings line",
  invoices: "Invoices line",
  badges: "Badges line",
  fuel: "Fuel line",
  ...over,
});
const base = (over: Partial<DoorInputs> = {}): DoorInputs => ({
  mode: "work",
  persona: "gig",
  totalTrips: 24,
  hasFuelLogs: false,
  endOfWeek: false,
  hidden: [],
  texts: texts(),
  ...over,
});
const ids = (i: DoorInputs) => selectDoorRows(i).map((r) => r.id);

describe("Invoices shortcut", () => {
  it("drivers with no recent invoices see exactly what they saw before", () => {
    expect(ids(base())).toEqual(["tax", "insights", "earnings"]);
    expect(ids(base({ usesInvoices: false }))).toEqual(["tax", "insights", "earnings"]);
    expect(ids(base({ persona: "employee" }))).toEqual(["tax", "insights", "badges"]);
  });
  it("a gig, Both or employee driver who invoices gets it straight after Tax", () => {
    expect(ids(base({ usesInvoices: true }))).toEqual(["tax", "invoices", "insights"]);
    expect(ids(base({ persona: "both", usesInvoices: true }))).toEqual(["tax", "invoices", "insights"]);
    expect(ids(base({ persona: "employee", usesInvoices: true }))).toEqual(["tax", "invoices", "insights"]);
  });
  it("never pushes Tax out, even with a road alert", () => {
    const rows = selectDoorRows(base({ usesInvoices: true, texts: texts({ road: { text: "A19" } }) }));
    expect(rows.map((r) => r.id)).toEqual(["road", "tax", "invoices"]);
  });
  it("Insights still leads at the end of the week", () => {
    expect(ids(base({ usesInvoices: true, endOfWeek: true }))).toEqual(["insights", "tax", "invoices"]);
  });
  it("not for Personal mode or company-car drivers", () => {
    expect(ids(base({ mode: "personal", persona: "personal", usesInvoices: true }))).not.toContain("invoices");
    expect(ids(base({ persona: "company", usesInvoices: true }))).not.toContain("invoices");
  });
  it("skipped when there is nothing to say yet", () => {
    expect(ids(base({ usesInvoices: true, texts: texts({ invoices: null }) }))).toEqual(["tax", "insights", "earnings"]);
  });
  it("can be hidden like the others", () => {
    expect(ids(base({ usesInvoices: true, hidden: ["invoices"] }))).toEqual(["tax", "insights", "earnings"]);
    expect(parseHiddenDoorRows(JSON.stringify(["invoices"]))).toEqual(["invoices"]);
    expect(doorSwitches(["invoices"]).find((r) => r.id === "invoices")).toMatchObject({
      label: "Invoices",
      icon: "receipt-outline",
      shown: false,
    });
  });
  it("goes to the Invoices screen", () => {
    const row = selectDoorRows(base({ usesInvoices: true })).find((r) => r.id === "invoices");
    expect(row).toMatchObject({ route: "/invoices", text: "Invoices line" });
  });
  it("Settings lists it only for a driver who invoices", () => {
    expect(availableDoorRows({ mode: "work", persona: "gig" })).not.toContain("invoices");
    expect(availableDoorRows({ mode: "work", persona: "gig", usesInvoices: true })).toContain("invoices");
    expect(availableDoorRows({ mode: "personal", persona: "personal", usesInvoices: true })).not.toContain("invoices");
  });
});

describe("usesInvoicesRecently", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it("true for an invoice made in the last 90 days", () => {
    expect(usesInvoicesRecently("2026-10-01T09:00:00Z", now)).toBe(true);
    expect(usesInvoicesRecently("2026-07-19T12:00:00Z", now)).toBe(true);
  });
  it("false when older, never, unknown or unreadable", () => {
    expect(usesInvoicesRecently("2026-07-18T11:00:00Z", now)).toBe(false);
    expect(usesInvoicesRecently(null, now)).toBe(false);
    expect(usesInvoicesRecently(undefined, now)).toBe(false);
    expect(usesInvoicesRecently("not a date", now)).toBe(false);
  });
});

describe("invoicesDoorText", () => {
  it("counts sent and overdue as unpaid", () => {
    expect(
      invoicesDoorText({ sent: { count: 3, totalPence: 43350 }, overdue: { count: 0, totalPence: 0 } })
    ).toBe("3 unpaid · £433.50");
    expect(
      invoicesDoorText({ sent: { count: 1, totalPence: 12000 }, overdue: { count: 1, totalPence: 8000 } })
    ).toBe("2 unpaid · £200.00");
  });
  it("says All paid when nothing is waiting", () => {
    expect(invoicesDoorText({ sent: { count: 0, totalPence: 0 }, overdue: { count: 0, totalPence: 0 } })).toBe(
      "All paid"
    );
  });
  it("null when the figures are not known", () => {
    expect(invoicesDoorText(null)).toBeNull();
  });
  it("bolds the amount on Home", () => {
    expect(doorKeyFigure("3 unpaid · £433.50")?.figure).toBe("£433.50");
  });
});
