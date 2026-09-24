/**
 * Vehicle reminders: the DVLA refresh (24 Sep 2026).
 *
 * Two faults this pins down. A "too many requests" from the DVLA was treated
 * like a bad plate, so a real plate refused for our pace waited a whole week
 * for fresh MOT and tax dates. And a plate the DVLA does not know (a typo, a
 * foreign plate) was retried weekly forever with the driver never told, so
 * they silently got no reminders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    vehicle: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("../../lib/push.js", () => ({
  sendPushToUser: vi.fn().mockResolvedValue({ id: "ticket" }),
}));

vi.mock("../../services/appEvents.js", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../../services/dvla.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../services/dvla.js")>();
  return { ...real, fetchDvlaVehicleInfo: vi.fn() };
});

import { runVehicleRemindersJob } from "../../jobs/vehicleReminders.js";
import { prisma } from "../../lib/prisma.js";
import { sendPushToUser } from "../../lib/push.js";
import { logEvent } from "../../services/appEvents.js";
import { fetchDvlaVehicleInfo, DvlaError, type DvlaVehicleInfo } from "../../services/dvla.js";

const findMany = prisma.vehicle.findMany as unknown as ReturnType<typeof vi.fn>;
const update = prisma.vehicle.update as unknown as ReturnType<typeof vi.fn>;
const fetchDvla = fetchDvlaVehicleInfo as unknown as ReturnType<typeof vi.fn>;
const push = sendPushToUser as unknown as ReturnType<typeof vi.fn>;

const WEEK_AGO = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

function vehicle(over: Record<string, unknown> = {}) {
  return {
    id: "v1",
    userId: "u1",
    make: "Toyota",
    model: "Prius",
    registrationPlate: "AB12CDE",
    motExpiryDate: null,
    taxDueDate: null,
    lastDvlaCheckAt: WEEK_AGO,
    dvlaPlateProblem: null,
    dvlaPlateSuggestion: null,
    motReminderSentAt: null,
    taxReminderSentAt: null,
    ...over,
  };
}

const info = (over: Partial<DvlaVehicleInfo> = {}): DvlaVehicleInfo => ({
  registrationNumber: "AB12CDE",
  make: "TOYOTA",
  yearOfManufacture: 2015,
  fuelType: "HYBRID ELECTRIC",
  colour: "SILVER",
  engineCapacity: 1798,
  co2Emissions: 70,
  taxStatus: "Taxed",
  motStatus: "Valid",
  motExpiryDate: "2027-03-01",
  taxDueDate: "2027-04-01",
  euroStatus: "EURO 6",
  monthOfFirstRegistration: "2015-03",
  ...over,
});

const notFound = () => new DvlaError("Vehicle not found at DVLA", 404, undefined, "not_found");
const invalid = () => new DvlaError("DVLA rejected the registration", 400, undefined, "invalid");
const rateLimited = () => new DvlaError("DVLA rate limit reached", 429, undefined, "rate_limited");
const upstream = () => new DvlaError("DVLA API error: 500", 502, undefined, "upstream");

/** Every data object passed to prisma.vehicle.update for a vehicle id. */
const updatesFor = (id: string) =>
  update.mock.calls.filter(([a]) => a.where.id === id).map(([a]) => a.data);

describe("runVehicleRemindersJob: DVLA refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.DVLA_API_KEY = "test";
    findMany.mockReset();
    update.mockClear();
    fetchDvla.mockReset();
    push.mockClear();
    (logEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Run the job, letting the 1 s pacing sleeps elapse. */
  async function run() {
    const p = runVehicleRemindersJob();
    await vi.runAllTimersAsync();
    await p;
  }

  it("stores fresh dates and clears any old plate warning on success", async () => {
    findMany.mockResolvedValue([vehicle({ dvlaPlateProblem: "not_found" })]);
    fetchDvla.mockResolvedValue(info());
    await run();
    const [data] = updatesFor("v1");
    expect(data.motExpiryDate).toEqual(new Date("2027-03-01"));
    expect(data.dvlaPlateProblem).toBeNull();
    expect(data.dvlaPlateSuggestion).toBeNull();
    expect(data.lastDvlaCheckAt).toBeInstanceOf(Date);
  });

  it("a rate limit stops the run and leaves the refused plate for the next run, not a week", async () => {
    findMany.mockResolvedValue([
      vehicle({ id: "v1" }),
      vehicle({ id: "v2", registrationPlate: "KN04JAR" }),
      vehicle({ id: "v3", registrationPlate: "SB65WNV" }),
    ]);
    fetchDvla.mockResolvedValueOnce(info()).mockRejectedValueOnce(rateLimited());
    await run();
    expect(fetchDvla).toHaveBeenCalledTimes(2); // v3 not even asked
    expect(updatesFor("v2")).toEqual([]); // lastDvlaCheckAt untouched -> retried next run
    expect(updatesFor("v3")).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it("a DVLA outage (5xx) is retried next run and stops after three in a row", async () => {
    findMany.mockResolvedValue(
      ["v1", "v2", "v3", "v4", "v5"].map((id) => vehicle({ id }))
    );
    fetchDvla.mockRejectedValue(upstream());
    await run();
    expect(fetchDvla).toHaveBeenCalledTimes(3);
    expect(update).not.toHaveBeenCalled();
  });

  it("paces calls one second apart", async () => {
    findMany.mockResolvedValue([vehicle({ id: "v1" }), vehicle({ id: "v2" })]);
    fetchDvla.mockResolvedValue(info());
    const p = runVehicleRemindersJob();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchDvla).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchDvla).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchDvla).toHaveBeenCalledTimes(2);
    await p;
  });

  it("an unknown plate with a look-alike the DVLA knows: stores the suggestion and tells the driver once", async () => {
    findMany.mockResolvedValue([vehicle({ registrationPlate: "DL740NT" })]);
    fetchDvla.mockImplementation(async (plate: string) => {
      if (plate === "DL74ONT") return info({ registrationNumber: "DL74ONT" });
      throw invalid();
    });
    await run();
    expect(fetchDvla.mock.calls.map(([p]) => p)).toEqual(["DL740NT", "DL74ONT"]);
    const [data] = updatesFor("v1");
    expect(data).toMatchObject({ dvlaPlateProblem: "invalid", dvlaPlateSuggestion: "DL74ONT" });
    expect(data.lastDvlaCheckAt).toBeInstanceOf(Date);
    expect(push).toHaveBeenCalledTimes(1);
    const [, title, body, pushData] = push.mock.calls[0];
    expect(title).toBe("Check your number plate");
    expect(body).toContain("DL740NT");
    expect(body).toContain("Did you mean DL74 ONT?");
    expect(pushData).toEqual({ action: "open_vehicle", vehicleId: "v1" });
  });

  it("does not suggest a look-alike the DVLA does not know either", async () => {
    findMany.mockResolvedValue([vehicle({ registrationPlate: "DL740NT" })]);
    fetchDvla.mockRejectedValue(notFound());
    await run();
    const [data] = updatesFor("v1");
    expect(data).toMatchObject({ dvlaPlateProblem: "not_found", dvlaPlateSuggestion: null });
    expect(push.mock.calls[0][2]).toContain("The DVLA has no record of DL740NT");
    expect(push.mock.calls[0][2]).not.toContain("Did you mean");
  });

  it("an unknown plate already flagged is re-checked weekly but the driver is not told again", async () => {
    findMany.mockResolvedValue([
      vehicle({ registrationPlate: "YL65JCJ", dvlaPlateProblem: "not_found" }),
    ]);
    fetchDvla.mockRejectedValue(notFound());
    await run();
    expect(updatesFor("v1")[0]).toMatchObject({ dvlaPlateProblem: "not_found" });
    expect(push).not.toHaveBeenCalled();
  });

  it("a rate limit while checking the suggestion stores nothing and stops the run", async () => {
    findMany.mockResolvedValue([
      vehicle({ id: "v1", registrationPlate: "DL740NT" }),
      vehicle({ id: "v2" }),
    ]);
    fetchDvla.mockRejectedValueOnce(invalid()).mockRejectedValueOnce(rateLimited());
    await run();
    expect(updatesFor("v1")).toEqual([]);
    expect(fetchDvla).toHaveBeenCalledTimes(2); // v2 left for next run
    expect(push).not.toHaveBeenCalled();
  });

  it("still sends an MOT reminder from stored dates when the refresh is rate limited", async () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    findMany.mockResolvedValue([vehicle({ motExpiryDate: soon })]);
    fetchDvla.mockRejectedValue(rateLimited());
    await run();
    expect(push).toHaveBeenCalledWith("u1", "MOT due soon", expect.any(String), {
      action: "open_vehicle",
      vehicleId: "v1",
    });
  });
});
