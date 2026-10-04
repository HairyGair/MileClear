/**
 * Milesheet waiting list (MILESHEET_NEW_TEAMS): the two public creation
 * paths, self-serve and a driver nominating their manager, park the request
 * in team_interest instead of creating a team, and answer in a shape both
 * current and older app builds handle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    orgMembership: { findFirst: vi.fn(), create: vi.fn() },
    organisation: { create: vi.fn(), count: vi.fn(), delete: vi.fn() },
    teamInterest: { findMany: vi.fn(), create: vi.fn() },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../services/email.js", () => ({
  sendManagerNominationEmail: vi.fn(),
  sendMilesheetWaitlistEmail: vi.fn(),
}));

import { nominateManagerRoutes } from "../../routes/team/nominate.js";
import { teamSelfServeRoutes } from "../../routes/team/selfServe.js";
import { prisma } from "../../lib/prisma.js";
import { sendManagerNominationEmail, sendMilesheetWaitlistEmail } from "../../services/email.js";

const USER_ID = "00000000-0000-0000-0000-0000000000a1";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };
const p = prisma as any;

async function app() {
  const a = await buildApp();
  await a.register(nominateManagerRoutes, { prefix: "/team" });
  await a.register(teamSelfServeRoutes, { prefix: "/team" });
  return a;
}

let savedMode: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  savedMode = process.env.MILESHEET_NEW_TEAMS;
  delete process.env.MILESHEET_NEW_TEAMS;
  p.user.findUnique.mockResolvedValue({ email: "driver@example.com", displayName: "Dee" });
  p.orgMembership.findFirst.mockResolvedValue(null);
  p.teamInterest.findMany.mockResolvedValue([]);
  p.teamInterest.create.mockResolvedValue({ id: "ti-1" });
  p.organisation.count.mockResolvedValue(0);
});
afterEach(() => {
  if (savedMode === undefined) delete process.env.MILESHEET_NEW_TEAMS;
  else process.env.MILESHEET_NEW_TEAMS = savedMode;
});

describe("POST /team/nominate-manager on the waiting list (the default)", () => {
  it("stores the nomination, creates no team, emails nobody, answers 409 MILESHEET_WAITLISTED", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/team/nominate-manager",
      headers: auth,
      payload: { managerEmail: "Boss@Firm.co.uk", companyName: "Firm Ltd" },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.waitlisted).toBe(true);
    expect(body.error.code).toBe("MILESHEET_WAITLISTED");
    expect(body.error.retryable).toBe(false);
    // Older builds show exactly this string in their error box.
    expect(body.error.message).toBe(
      "Milesheet is in a small pilot at the moment. We've added your company to the waiting list and will contact boss@firm.co.uk when places open."
    );
    expect(p.teamInterest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "boss@firm.co.uk",
        company: "Firm Ltd",
        waitlistSource: "driver_nomination",
        nominatedByUserId: USER_ID,
      }),
      select: { id: true },
    });
    expect(p.organisation.create).not.toHaveBeenCalled();
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(sendManagerNominationEmail).not.toHaveBeenCalled();
  });

  it("a repeat adds no second row and still answers the same way", async () => {
    p.teamInterest.findMany.mockResolvedValue([
      {
        id: "ti-0",
        email: "boss@firm.co.uk",
        waitlistSource: "driver_nomination",
        nominatedByUserId: USER_ID,
        admittedAt: null,
        createdAt: new Date(),
      },
    ]);
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/team/nominate-manager",
      headers: auth,
      payload: { managerEmail: "boss@firm.co.uk", companyName: "Firm Ltd" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().waitlisted).toBe(true);
    expect(p.teamInterest.create).not.toHaveBeenCalled();
  });

  it("still refuses nominating your own address before anything is stored", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/team/nominate-manager",
      headers: auth,
      payload: { managerEmail: "driver@example.com", companyName: "Firm Ltd" },
    });
    expect(res.statusCode).toBe(400);
    expect(p.teamInterest.create).not.toHaveBeenCalled();
  });
});

describe("POST /team/nominate-manager when new teams are open", () => {
  it("creates the team with a 30-day trial and emails the manager", async () => {
    process.env.MILESHEET_NEW_TEAMS = "open";
    const tx = { organisation: { create: vi.fn().mockResolvedValue({ id: "org-1", name: "Firm Ltd" }) }, orgMembership: { create: vi.fn() } };
    p.$transaction.mockImplementation(async (fn: any) => fn(tx));
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/team/nominate-manager",
      headers: auth,
      payload: { managerEmail: "boss@firm.co.uk", companyName: "Firm Ltd" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { ok: true } });
    const data = tx.organisation.create.mock.calls[0][0].data;
    expect(data.pilotFree).toBe(false);
    expect(data.seatCap).toBe(20);
    const days = (data.trialEndsAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(sendManagerNominationEmail).toHaveBeenCalledTimes(1);
    expect(p.teamInterest.create).not.toHaveBeenCalled();
  });
});

describe("POST /team/self-serve", () => {
  it("on the waiting list: stores the request, confirms by email, creates no team", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/team/self-serve",
      headers: auth,
      payload: { name: "Hartley Ltd", contactName: "Sam Hartley", drivers: "6-20" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.waitlisted).toBe(true);
    expect(p.teamInterest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "driver@example.com",
        company: "Hartley Ltd",
        contactName: "Sam Hartley",
        drivers: "6-20",
        waitlistSource: "self_serve",
        nominatedByUserId: null,
      }),
      select: { id: true },
    });
    expect(sendMilesheetWaitlistEmail).toHaveBeenCalledWith("driver@example.com", "Sam Hartley", "Hartley Ltd");
    expect(p.organisation.create).not.toHaveBeenCalled();
  });

  it("when open: creates the team with a trial, one trial per person", async () => {
    process.env.MILESHEET_NEW_TEAMS = "open";
    p.organisation.create.mockResolvedValue({ id: "org-2", name: "Hartley Ltd" });
    const a = await app();
    let res = await a.inject({ method: "POST", url: "/team/self-serve", headers: auth, payload: { name: "Hartley Ltd" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.waitlisted).toBe(false);
    expect(p.organisation.create.mock.calls[0][0].data.trialEndsAt).toBeInstanceOf(Date);

    p.organisation.count.mockResolvedValue(1); // already started a trial team once
    res = await a.inject({ method: "POST", url: "/team/self-serve", headers: auth, payload: { name: "Hartley Two" } });
    expect(res.statusCode).toBe(201);
    expect(p.organisation.create.mock.calls[1][0].data.trialEndsAt).toBeNull();
    expect(p.organisation.create.mock.calls[1][0].data.seatCap).toBeNull();
  });
});

describe("POST /team/waitlist (signed out)", () => {
  it("stores the request and confirms by email", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/team/waitlist",
      payload: { company: "Hartley Ltd", email: "Sam@Hartley.co.uk", contactName: "Sam" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.waitlisted).toBe(true);
    expect(p.teamInterest.create).toHaveBeenCalledTimes(1);
    expect(sendMilesheetWaitlistEmail).toHaveBeenCalledWith("sam@hartley.co.uk", "Sam", "Hartley Ltd");
  });

  it("a filled honeypot is thanked and ignored", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/team/waitlist",
      payload: { company: "Spam Co", email: "x@spam.test", website: "http://spam" },
    });
    expect(res.statusCode).toBe(200);
    expect(p.teamInterest.create).not.toHaveBeenCalled();
    expect(sendMilesheetWaitlistEmail).not.toHaveBeenCalled();
  });

  it("GET /team/availability reports the mode", async () => {
    const a = await app();
    expect((await a.inject({ method: "GET", url: "/team/availability" })).json()).toEqual({ data: { newTeams: "waitlist" } });
    process.env.MILESHEET_NEW_TEAMS = "open";
    expect((await a.inject({ method: "GET", url: "/team/availability" })).json()).toEqual({ data: { newTeams: "open" } });
  });
});
