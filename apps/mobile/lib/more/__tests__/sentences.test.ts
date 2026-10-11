import { describe, it, expect } from "vitest";
import {
  badgesLine,
  bankLine,
  bankRoute,
  carsLine,
  earningsLine,
  expensesLine,
  fuelLine,
  insightsLine,
  invoicesLine,
  odometerLine,
  planLine,
  roadLine,
  settingsLine,
  shiftsLine,
} from "../sentences";

const oct = new Date(2026, 9, 11, 12);
const prius = { make: "Toyota", model: "Prius", isPrimary: true, fuelType: "hybrid" };

describe("name card plan line", () => {
  it("says the plan in words", () => {
    expect(planLine({ isPremium: true, source: "subscription", currentPeriodEnd: "2026-11-03T10:00:00Z" })).toBe("Pro · renews 3 Nov");
    expect(planLine({ isPremium: true, currentPeriodEnd: "2026-11-03T10:00:00Z", cancelAtPeriodEnd: true })).toBe("Pro · ends 3 Nov");
    expect(planLine({ isPremium: false })).toBe("Free plan · see what Pro adds");
    expect(planLine({ isPremium: true, source: "team" })).toBe("Pro through your team");
    expect(planLine({ isPremium: true })).toBe("Pro");
  });
  it("team drivers see their company, and nothing shows before anything is known", () => {
    expect(planLine(null, { teamName: "Acme Ltd" })).toBe("Company car · Acme Ltd");
    expect(planLine(null)).toBeNull();
  });
  it("never shows the email", () => {
    expect(planLine({ isPremium: false })).not.toMatch(/@/);
  });
});

describe("Your car", () => {
  it("names the main car and the MOT date", () => {
    expect(carsLine([{ ...prius, motExpiryDate: "2027-03-14T00:00:00Z" }], oct).text).toBe("Toyota Prius · MOT due 14 Mar");
  });
  it("says when the MOT has run out", () => {
    expect(carsLine([{ ...prius, motExpiryDate: "2026-10-01T00:00:00Z" }], oct).text).toBe("Toyota Prius · MOT ran out 1 Oct");
  });
  it("amber Add your car when there is none, plain description while loading", () => {
    expect(carsLine([], oct)).toEqual({ text: "Add your car", tone: "add" });
    expect(carsLine(null, oct)).toEqual({ text: "Your cars, MOT and tax dates" });
  });
  it("counts other cars when there is no MOT date", () => {
    const van = { make: "Ford", model: "Transit", isPrimary: false };
    expect(carsLine([van, prius], oct).text).toBe("Toyota Prius · and 1 more");
  });
  it("company car reads as one", () => {
    expect(carsLine([prius], oct, { companyCar: true }).text).toBe("Company car: Toyota Prius");
  });

  it("fuel: last fill-up and the price near you", () => {
    expect(fuelLine({ lastFillUpAt: "2026-10-03T08:00:00Z", cheapestPence: 136.9, electric: false })).toBe(
      "Last fill-up 3 Oct · 136.9p near you"
    );
    expect(fuelLine({ lastFillUpAt: null, cheapestPence: null, electric: false })).toBe("Fill-ups and prices near you");
    expect(fuelLine({ lastFillUpAt: undefined, cheapestPence: 140, electric: true })).toBe("Charging costs and chargers near you");
  });

  it("odometer: the running figure, about when estimated, an add prompt when none", () => {
    expect(odometerLine([{ ...prius, odometer: { miles: 41831, isEstimated: false } }]).text).toBe("41,831 miles now");
    expect(odometerLine([{ ...prius, odometer: { miles: 41831.4, isEstimated: true } }]).text).toBe("About 41,831 miles now");
    expect(odometerLine([{ ...prius, odometer: null }]).text).toBe("Add today's reading");
    expect(odometerLine(null).text).toBe("Start and end readings for each day");
  });

  it("road alerts", () => {
    const on = { enabled: true, available: true, hasUsualRoads: true, current: 0, upcoming: 0 };
    expect(roadLine(null)).toBe("Roadworks and closures on roads you use");
    expect(roadLine({ ...on, enabled: false })).toBe("Turn on alerts for roads you use");
    expect(roadLine({ ...on, current: 2 })).toBe("2 on roads you use now");
    expect(roadLine({ ...on, upcoming: 1 })).toBe("1 planned in the next week");
    expect(roadLine(on)).toBe("Nothing on your usual roads");
    expect(roadLine({ ...on, hasUsualRoads: false })).toBe("Learning the roads you use");
  });
});

describe("Your work", () => {
  it("last shift with its length", () => {
    const start = new Date(2026, 9, 5, 9, 0).toISOString();
    const end = new Date(2026, 9, 5, 14, 10).toISOString();
    expect(shiftsLine({ startedAt: start, endedAt: end })).toBe("Last shift Mon 5 Oct · 5 h 10 min");
    expect(shiftsLine(null)).toBe("None yet. Start one from Home");
    expect(shiftsLine(undefined)).toBe("Your work sessions");
  });
});

describe("Your money", () => {
  it("earnings this month", () => {
    expect(earningsLine({ pence: 41260, platforms: 2 }, oct)).toBe("£412.60 in October · 2 apps");
    expect(earningsLine({ pence: 1000, platforms: 1 }, oct)).toBe("£10.00 in October · 1 app");
    expect(earningsLine({ pence: 0, platforms: 0 }, oct)).toBe("Add what you were paid");
    expect(earningsLine(null, oct)).toBe("Add what you were paid");
  });
  it("expenses this month", () => {
    expect(expensesLine({ pence: 3650 }, oct)).toBe("£36.50 in October");
    expect(expensesLine(null, oct)).toBe("Parking, tolls and other costs");
  });
  it("invoices waiting, overdue first", () => {
    const f = { total: 3, waitingCount: 1, waitingPence: 12000, overdueCount: 0, overduePence: 0 };
    expect(invoicesLine(f)).toBe("1 waiting to be paid · £120.00");
    expect(invoicesLine({ ...f, overdueCount: 1, overduePence: 8000 })).toBe("1 overdue · £80.00");
    expect(invoicesLine({ ...f, waitingCount: 0 })).toBe("Nothing waiting to be paid");
    expect(invoicesLine(null)).toBe("Bill your clients");
  });
  it("bank: linked with payments to sort, else the offer", () => {
    expect(bankLine({ banks: ["Monzo"], toSort: 4 }, true)).toBe("Monzo linked · 4 payments to sort");
    expect(bankLine({ banks: ["Monzo"], toSort: 0 }, true)).toBe("Monzo linked · nothing to sort");
    expect(bankLine({ banks: ["Monzo", "Starling"], toSort: 1 }, true)).toBe("2 banks linked · 1 payment to sort");
    expect(bankLine({ banks: [], toSort: null }, true)).toBe("Bring in your earnings automatically");
    expect(bankLine(null, false)).toBe("Bring in your earnings automatically");
  });
  it("bank opens the payments once linked, the link screen before", () => {
    expect(bankRoute({ banks: ["Monzo"], toSort: 4 }, true)).toBe("/inbox");
    expect(bankRoute({ banks: [], toSort: null }, true)).toBe("/open-banking");
    expect(bankRoute({ banks: ["Monzo"], toSort: 4 }, false)).toBe("/open-banking");
  });
});

describe("Your progress", () => {
  it("insights week", () => {
    expect(insightsLine({ totalMiles: 36.04, totalTrips: 5 })).toBe("This week: 36 miles, 5 trips");
    expect(insightsLine({ totalMiles: 0, totalTrips: 0 })).toBe("Nothing this week yet");
    expect(insightsLine(null)).toBe("Your week, month and tax year");
  });
  it("badges count and the next one", () => {
    expect(badgesLine({ earned: 12, total: 37, next: { label: "Explorer", progressText: "22 mi to go" } })).toBe(
      "12 of 37 · next: Explorer, 22 mi to go"
    );
    expect(badgesLine({ earned: 0, total: 37, next: { label: "First trip", progressText: "Record your first trip" } })).toBe(
      "Record a trip for your first badge"
    );
    expect(badgesLine({ earned: 37, total: 37, next: null })).toBe("All 37 earned");
    expect(badgesLine(null)).toBe("Your badges");
  });
});

describe("Settings row", () => {
  const ok = { problem: false, recordingNote: null, checking: false, pendingUploads: 0 };
  it("is calm and grey, never the problem itself", () => {
    expect(settingsLine(ok)).toBe("Recording automatically · all saved");
    expect(settingsLine({ ...ok, problem: true })).not.toMatch(/aren't recording|couldn't upload/);
    expect(settingsLine({ ...ok, pendingUploads: 2 })).toBe("Recording automatically · 2 waiting to upload");
    expect(settingsLine({ ...ok, recordingNote: "Paused until 6am" })).toBe("Paused until 6am");
  });
});
