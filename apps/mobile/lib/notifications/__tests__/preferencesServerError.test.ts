import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  db: { getFirstAsync: vi.fn(), runAsync: vi.fn() },
}));

vi.mock("../../db/index", () => ({ getDatabase: async () => mocks.db }));
vi.mock("../../api/index", () => ({ apiRequest: mocks.apiRequest }));

import { setNotificationPreferences } from "../preferences";

beforeEach(() => {
  mocks.apiRequest.mockReset().mockRejectedValue(new Error("server down"));
  mocks.db.getFirstAsync.mockReset().mockResolvedValue(null);
  mocks.db.runAsync.mockReset().mockResolvedValue(undefined);
});

describe("setNotificationPreferences server errors", () => {
  it("existing callers are unchanged: no flags never throws", async () => {
    await expect(setNotificationPreferences({ taxDeadline: false })).resolves.toBeUndefined();
  });

  it("awaitServer alone still swallows the error (road alerts)", async () => {
    await expect(setNotificationPreferences({ roadAlerts: true }, { awaitServer: true })).resolves.toBeUndefined();
  });

  it("awaitServer with throwOnServerError lets it through", async () => {
    await expect(
      setNotificationPreferences({ taxDeadline: false }, { awaitServer: true, throwOnServerError: true }),
    ).rejects.toThrow("server down");
  });
});
