import { describe, it, expect } from "vitest";
import { featuresFor } from "@mileclear/shared";
import { moreGroups, type MoreDriver } from "../rows";

const base: MoreDriver = {
  driveFor: "gig",
  companyApp: false,
  isWork: true,
  electric: false,
  hasShifts: false,
  hasEarnings: false,
  hasInvoices: false,
  bankLinked: false,
  assistant: true,
  isAdmin: false,
};

function page(d: Partial<MoreDriver>) {
  return moreGroups({ ...base, ...d });
}
function titles(d: Partial<MoreDriver>) {
  return page(d).map((g) => g.title);
}
function rows(d: Partial<MoreDriver>) {
  return page(d).flatMap((g) => g.rows);
}

describe("More rows by driver", () => {
  it("gig driver: car, work, money, progress, tools, help in that order", () => {
    expect(titles({})).toEqual(["Your car", "Your work", "Your money", "Your progress", "Tools", "Help and settings"]);
    expect(page({}).find((g) => g.title === "Your money")!.rows).toEqual(["earnings", "expenses", "invoices", "bank"]);
    expect(page({}).find((g) => g.title === "Your work")!.rows).toEqual(["shifts", "work_hours"]);
    expect(rows({})).toHaveLength(19);
  });

  it("never has Log out, and one Bank row instead of two", () => {
    for (const driveFor of ["gig", "employee", "both", "company", "personal"] as const) {
      const r = rows({ driveFor });
      expect(r.filter((x) => x === "bank").length).toBeLessThanOrEqual(1);
      expect(r as string[]).not.toContain("logout");
    }
  });

  it("both: shifts, work hours and Invite your manager, with all four money rows", () => {
    expect(page({ driveFor: "both" }).find((g) => g.title === "Your work")!.rows).toEqual(["shifts", "work_hours", "manager"]);
    expect(rows({ driveFor: "both" })).toHaveLength(20);
  });

  it("employee: Expenses only, unless they have earnings, invoices or a bank", () => {
    const money = (d: Partial<MoreDriver>) => page({ driveFor: "employee", ...d }).find((g) => g.title === "Your money")!.rows;
    expect(money({})).toEqual(["expenses"]);
    expect(money({ hasEarnings: true, hasInvoices: true, bankLinked: true })).toEqual(["earnings", "expenses", "invoices", "bank"]);
    expect(page({ driveFor: "employee" }).find((g) => g.title === "Your work")!.rows).toEqual(["work_hours", "manager"]);
    expect(rows({ driveFor: "employee" })).toHaveLength(16);
  });

  it("Invite your manager is a Work mode row", () => {
    expect(rows({ driveFor: "employee", isWork: false })).not.toContain("manager");
  });

  it("company car (team or picked): no money group, Expenses under work, no EmSee, no Shifts", () => {
    const p = page({ driveFor: "company", companyApp: true });
    expect(p.map((g) => g.title)).toEqual(["Your car", "Your work", "Your progress", "Tools", "Help and settings"]);
    expect(p.find((g) => g.title === "Your work")!.rows).toEqual(["work_hours", "expenses"]);
    expect(p.find((g) => g.title === "Tools")!.rows).toEqual(["ticket"]);
    expect(rows({ driveFor: "company", companyApp: true })).toHaveLength(14);
  });

  it("a team driver whose answer says gig still gets the company page", () => {
    expect(rows({ driveFor: "gig", companyApp: true })).not.toContain("earnings");
  });

  it("company driver with past shifts keeps Shifts", () => {
    expect(rows({ driveFor: "company", companyApp: true, hasShifts: true })).toContain("shifts");
  });

  it("just me, Personal mode: Records and Drive for work?, no money, work, Shifts or Insights", () => {
    const p = page({ driveFor: "personal", isWork: false });
    expect(p.map((g) => g.title)).toEqual(["Your car", "Your records", "Your progress", "Tools", "Help and settings"]);
    expect(p.find((g) => g.title === "Your records")!.rows).toEqual(["records", "drive_for_work"]);
    const r = rows({ driveFor: "personal", isWork: false, hasShifts: true, hasEarnings: true });
    for (const gone of ["earnings", "invoices", "bank", "shifts", "work_hours", "expenses", "insights"]) {
      expect(r).not.toContain(gone);
    }
    expect(r).toHaveLength(14);
  });

  it("just me in Work mode: Records is on the Tax tab, Insights is a row", () => {
    const r = rows({ driveFor: "personal", isWork: true });
    expect(r).not.toContain("records");
    expect(r).toContain("insights");
    expect(r).toContain("drive_for_work");
  });

  it("Insights is a row in Work mode only (a tab in Personal)", () => {
    expect(rows({ isWork: false })).not.toContain("insights");
  });

  it("Chargers near you only for electric cars", () => {
    expect(rows({})).not.toContain("chargers");
    expect(page({ electric: true })[0].rows).toEqual(["cars", "fuel", "odometer", "places", "road", "chargers"]);
  });

  it("Road alerts is a standing row for everyone", () => {
    for (const driveFor of ["gig", "employee", "both", "company", "personal"] as const) {
      expect(rows({ driveFor, companyApp: driveFor === "company" })).toContain("road");
    }
  });

  it("Ask EmSee only when the server has it; Admin only for admins", () => {
    expect(rows({ assistant: false })).not.toContain("emsee");
    expect(rows({})).not.toContain("admin");
    expect(titles({ isAdmin: true }).at(-1)).toBe("Admin");
  });
});

describe("More rows by country (23 Oct 2026)", () => {
  it("is unchanged for the UK", () => {
    for (const driveFor of ["gig", "employee", "both", "company", "personal"] as const) {
      for (const isWork of [true, false]) {
        expect(page({ driveFor, isWork, features: featuresFor("GB") })).toEqual(page({ driveFor, isWork }));
      }
    }
  });

  it("drops the UK-only rows and gives downloads a row outside the UK", () => {
    for (const driveFor of ["gig", "employee", "both", "company", "personal"] as const) {
      for (const isWork of [true, false]) {
        const r = rows({ driveFor, isWork, features: featuresFor("NZ") });
        for (const gone of ["road", "bank", "ticket", "manager", "drive_for_work", "records"]) {
          expect(r as string[]).not.toContain(gone);
        }
        expect(r.filter((x) => x === "downloads")).toHaveLength(1);
        expect(r).toContain("cars");
        expect(r).toContain("settings");
      }
    }
  });

  it("puts downloads with the money rows when there are some", () => {
    const g = page({ driveFor: "gig", features: featuresFor("AU") }).find((x) => x.title === "Your money")!;
    expect(g.rows).toEqual(["earnings", "expenses", "invoices", "downloads"]);
  });
});
