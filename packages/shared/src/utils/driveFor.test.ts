import { describe, it, expect } from "vitest";
import { driveForOf, driveForPatch, driveForSummary, isEmployedOnly, DRIVE_FOR_OPTIONS } from "./driveFor";

describe("driveForOf", () => {
  it("reads the existing work types", () => {
    expect(driveForOf({ workType: "gig", dashboardMode: "both" })).toBe("gig");
    expect(driveForOf({ workType: "employee", dashboardMode: "work" })).toBe("employee");
    expect(driveForOf({ workType: "both", dashboardMode: "both" })).toBe("both");
  });
  it("company car is its own answer", () => {
    expect(driveForOf({ workType: "company", dashboardMode: "both" })).toBe("company");
  });
  it("a driver who had picked Personal becomes Just me, whatever their work type", () => {
    expect(driveForOf({ workType: "gig", dashboardMode: "personal" })).toBe("personal");
    expect(driveForOf({ workType: "both", dashboardMode: "personal" })).toBe("personal");
  });
  it("defaults to gig", () => {
    expect(driveForOf(null)).toBe("gig");
    expect(driveForOf({})).toBe("gig");
    expect(driveForOf({ workType: "weird" })).toBe("gig");
  });
});

describe("driveForPatch", () => {
  it("Just me only touches the mode, so the work type comes back if they switch", () => {
    expect(driveForPatch("personal", "both")).toEqual({ dashboardMode: "personal" });
  });
  it("leaving Just me restores work reminders", () => {
    expect(driveForPatch("gig", "personal")).toEqual({ workType: "gig", dashboardMode: "both" });
    expect(driveForPatch("company", "personal")).toEqual({ workType: "company", dashboardMode: "both" });
  });
  it("keeps an existing work or both mode", () => {
    expect(driveForPatch("employee", "work")).toEqual({ workType: "employee", dashboardMode: "work" });
    expect(driveForPatch("both", "both")).toEqual({ workType: "both", dashboardMode: "both" });
  });
  it("every answer round-trips", () => {
    for (const o of DRIVE_FOR_OPTIONS) {
      const p = driveForPatch(o.value, "both");
      expect(driveForOf({ workType: p.workType ?? "gig", dashboardMode: p.dashboardMode })).toBe(o.value);
    }
  });
});

describe("helpers", () => {
  it("employer-only answers", () => {
    expect(isEmployedOnly("employee")).toBe(true);
    expect(isEmployedOnly("company")).toBe(true);
    expect(isEmployedOnly("both")).toBe(false);
    expect(isEmployedOnly("gig")).toBe(false);
  });
  it("summaries", () => {
    expect(driveForSummary("both", { employerRatePence: 45 })).toBe("Deliveries and an employer · employer pays 45p");
    expect(driveForSummary("employee")).toBe("An employer");
    expect(driveForSummary("company", { teamName: "Acme Ltd" })).toBe("A company car · Acme Ltd");
    expect(driveForSummary("personal")).toBe("Just me, not for work");
  });
});
