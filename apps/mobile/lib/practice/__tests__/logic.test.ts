import { describe, it, expect } from "vitest";
import {
  durationLine,
  pickHomePracticeAsk,
  requestActionLabel,
  requestAskTitle,
  requestRoute,
  scopeSummary,
  shortDay,
} from "../logic";
import type { DriverPracticeLink, DriverPracticeRequest } from "../../api/practice";

const practice = {
  id: "p1",
  name: "Smith & Co",
  contactName: "Jane Smith",
  professionalBody: "ICAEW",
  checked: false,
  paused: false,
  initials: "S&C",
  logoPath: null,
};

function link(over: Partial<DriverPracticeLink>): DriverPracticeLink {
  return {
    id: "l1",
    state: "sharing",
    startedBy: "practice",
    practice,
    awaitingSignup: false,
    shareEarnings: true,
    shareExpenses: true,
    sharePersonalTrips: false,
    invitedAt: null,
    consentedAt: null,
    startedAt: null,
    endsAt: "2028-01-31T23:59:59.999Z",
    endedAt: null,
    endedBy: null,
    renewalAskedAt: null,
    renewalDue: false,
    ...over,
  };
}

function request(over: Partial<DriverPracticeRequest>): DriverPracticeRequest {
  return {
    id: "r1",
    type: "sort_trips",
    title: "Please sort your trips (12)",
    note: null,
    dueDate: "2026-10-31",
    periodStart: null,
    periodEnd: null,
    countAtSend: 12,
    status: "open",
    doneHow: null,
    doneAt: null,
    driverReply: null,
    repliedAt: null,
    lastRemindedAt: null,
    createdByName: "Jane Smith",
    createdAt: "2026-10-11T10:00:00Z",
    practiceName: "Smith & Co",
    ...over,
  };
}

describe("Home practice ask", () => {
  it("puts an unanswered ask to share first, then keep sharing, then requests", () => {
    const asking = link({ id: "a", state: "asking" });
    const renew = link({ id: "b", renewalDue: true });
    const r = request({});
    expect(pickHomePracticeAsk([renew, asking], [r])).toEqual({ kind: "consent", link: asking });
    expect(pickHomePracticeAsk([renew], [r])).toEqual({ kind: "renewal", link: renew });
    expect(pickHomePracticeAsk([link({})], [r])).toEqual({ kind: "request", request: r });
  });

  it("ignores done requests and links that need nothing", () => {
    expect(pickHomePracticeAsk([link({})], [request({ status: "done" })])).toBeNull();
    expect(pickHomePracticeAsk([link({ state: "ended", renewalDue: true })], [])).toBeNull();
  });

  it("says who asked for what", () => {
    expect(requestAskTitle(request({}))).toBe("Smith & Co asked you to sort 12 trips");
    expect(requestAskTitle(request({ countAtSend: 1 }))).toBe("Smith & Co asked you to sort 1 trip");
    expect(requestAskTitle(request({ type: "add_earnings", countAtSend: null }))).toBe(
      "Smith & Co asked you to add your earnings"
    );
  });
});

describe("request buttons", () => {
  it("names the action and goes to the right place", () => {
    expect(requestActionLabel("sort_trips")).toBe("Sort trips");
    expect(requestRoute("sort_trips")).toBe("/(tabs)/trips?filter=unclassified");
    expect(requestRoute("add_earnings")).toBe("/earning-form");
    expect(requestRoute("add_expenses")).toBe("/expense-form");
    expect(requestRoute("check_details")).toBe("/vehicles");
    expect(requestRoute("other")).toBeNull();
    expect(requestActionLabel("other")).toBe("Open");
  });
});

describe("wording", () => {
  it("formats dates the UK way", () => {
    expect(shortDay("2026-10-31")).toBe("31 Oct");
    expect(shortDay("2028-01-31T23:59:59.999Z")).toBe("31 Jan");
    expect(durationLine("2028-01-31T23:59:59.999Z")).toBe("Until 31 Jan 2028. We'll ask you before it ends.");
  });

  it("says what is shared", () => {
    expect(scopeSummary({ sharePersonalTrips: false })).toBe("Business only");
    expect(scopeSummary({ sharePersonalTrips: true })).toBe("Business and personal");
  });
});
