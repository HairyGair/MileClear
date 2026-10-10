import { describe, it, expect } from "vitest";
import {
  carSummary,
  placesSummary,
  workHoursSummary,
  homeScreenSummary,
  planSummary,
  downloadsSummary,
  shortDate,
  type SlotLike,
} from "../summaries";

const prius = { make: "Toyota", model: "Prius", fuelType: "hybrid", vehicleType: "car", isPrimary: true };

describe("carSummary", () => {
  it("names the main car, its fuel and the rate it earns", () => {
    expect(carSummary([prius])).toEqual({ text: "Toyota Prius · Hybrid · car rate", tone: "plain" });
  });
  it("asks to add a car when there is none", () => {
    expect(carSummary([])).toEqual({ text: "Add your car", tone: "add" });
  });
  it("picks the main car and counts the others", () => {
    const van = { make: "Ford", model: "Transit", fuelType: "diesel", vehicleType: "van", isPrimary: false };
    expect(carSummary([van, prius]).text).toBe("Toyota Prius · Hybrid · car rate · and 1 more");
  });
  it("motorbike rate", () => {
    expect(carSummary([{ ...prius, vehicleType: "motorbike", fuelType: "petrol" }]).text).toBe(
      "Toyota Prius · Petrol · motorbike rate"
    );
  });
  it("company car reads as one", () => {
    expect(carSummary([{ ...prius, make: "Ford", model: "Transit", fuelType: "diesel" }], { companyCar: true }).text).toBe(
      "Company car: Ford Transit · Diesel"
    );
  });
});

describe("placesSummary", () => {
  it("lists up to three", () => {
    expect(placesSummary(["Home", "Depot", "Office"])).toBe("3 places: Home, Depot, Office");
    expect(placesSummary(["Home"])).toBe("1 place: Home");
    expect(placesSummary(["A", "B", "C", "D", "E"])).toBe("5 places: A, B, C and 2 more");
    expect(placesSummary([])).toContain("None yet");
  });
});

describe("workHoursSummary", () => {
  const slot = (d: number, s = "08:00", e = "18:00", enabled = true): SlotLike => ({
    dayOfWeek: d, startTime: s, endTime: e, enabled,
  });
  it("Mon to Fri when the days run on", () => {
    expect(workHoursSummary([1, 2, 3, 4, 5].map((d) => slot(d)))).toBe("Mon to Fri, 08:00 to 18:00");
  });
  it("lists gaps", () => {
    expect(workHoursSummary([slot(1), slot(3), slot(5)])).toBe("Mon, Wed, Fri, 08:00 to 18:00");
  });
  it("Sunday sits at the end of the week", () => {
    expect(workHoursSummary([slot(6), slot(0)])).toBe("Sat to Sun, 08:00 to 18:00");
  });
  it("says so when hours vary, and when not set", () => {
    expect(workHoursSummary([slot(1), slot(2, "09:00", "17:00")])).toBe("2 days a week, hours vary");
    expect(workHoursSummary([slot(1, "08:00", "18:00", false)])).toBe("Not set");
    expect(workHoursSummary([])).toBe("Not set");
  });
});

describe("homeScreenSummary", () => {
  it("names what shows", () => {
    expect(homeScreenSummary([{ label: "Tax", shown: true }, { label: "Insights", shown: true }, { label: "Earnings", shown: false }])).toBe(
      "Showing Tax, Insights"
    );
    expect(homeScreenSummary([{ label: "Tax", shown: false }])).toBe("No shortcuts showing");
  });
});

describe("planSummary", () => {
  it("free", () => expect(planSummary({ isPremium: false })).toBe("Free plan · see what Pro adds"));
  it("App Store renewal", () => {
    expect(planSummary({ isPremium: true, platform: "apple", currentPeriodEnd: "2026-11-03T00:00:00Z" })).toBe(
      "Pro · renews 3 Nov (App Store)"
    );
  });
  it("cancelling shows when it ends", () => {
    expect(planSummary({ isPremium: true, platform: "stripe", currentPeriodEnd: "2026-11-03T12:00:00Z", cancelAtPeriodEnd: true })).toBe(
      "Pro · ends 3 Nov (website)"
    );
  });
  it("team, referral and complimentary Pro have nothing to renew", () => {
    expect(planSummary({ isPremium: true, source: "team" })).toBe("Pro through your team");
    expect(planSummary({ isPremium: true, source: "referral", referralProUntil: "2027-01-05T12:00:00Z" })).toBe(
      "Pro from referrals, until 5 Jan"
    );
    expect(planSummary({ isPremium: true, platform: "none" })).toBe("Pro is on for your account");
  });
});

describe("misc", () => {
  it("downloads", () => {
    expect(downloadsSummary("2026-27", false)).toBe("Spreadsheet and PDF for 2026-27");
    expect(downloadsSummary("2026-27", true)).toBe("Your mileage log for 2026-27");
  });
  it("short dates", () => expect(shortDate("2026-11-03T12:00:00Z")).toBe("3 Nov"));
});
