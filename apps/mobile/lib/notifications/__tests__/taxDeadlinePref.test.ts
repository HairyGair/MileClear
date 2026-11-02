import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("../preferences", () => ({
  getNotificationPreferences: mocks.get,
  setNotificationPreferences: mocks.set,
}));
vi.mock("../scheduler", () => ({
  scheduleTaxYearDeadlineReminder: mocks.schedule,
  cancelTaxDeadlineReminders: mocks.cancel,
}));

import { setTaxDeadlinePref } from "../taxDeadlinePref";

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.get.mockResolvedValue({ taxDeadline: true });
  mocks.set.mockResolvedValue(undefined);
  mocks.schedule.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
});

describe("setTaxDeadlinePref", () => {
  it("off: waits for the server save, then cancels this phone's tax reminders", async () => {
    await setTaxDeadlinePref(false);
    expect(mocks.set).toHaveBeenCalledWith({ taxDeadline: false }, { awaitServer: true, throwOnServerError: true });
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("on: saves, then schedules the reminder again", async () => {
    mocks.get.mockResolvedValue({ taxDeadline: false });
    await setTaxDeadlinePref(true);
    expect(mocks.set).toHaveBeenCalledWith({ taxDeadline: true }, { awaitServer: true, throwOnServerError: true });
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("server save fails: puts the phone back, touches no reminders, and throws", async () => {
    mocks.set.mockRejectedValueOnce(new Error("offline"));
    await expect(setTaxDeadlinePref(false)).rejects.toThrow("offline");
    expect(mocks.set).toHaveBeenLastCalledWith({ taxDeadline: true });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("a scheduling hiccup after a good save doesn't report failure", async () => {
    mocks.cancel.mockRejectedValue(new Error("no permission"));
    await expect(setTaxDeadlinePref(false)).resolves.toBeUndefined();
  });
});
