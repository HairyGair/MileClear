import { describe, it, expect } from "vitest";
import { createAdminReadThrottle, describeAdminRead } from "../../services/adminReadAudit.js";

// GDPR audit H7 (14 Aug 2026): admin reads of a driver's GPS, diagnostics and
// events left no trail.
const base = { method: "GET", statusCode: 200, params: {}, query: {} };

describe("describeAdminRead", () => {
  it("logs a read of one driver's trip paths", () => {
    expect(
      describeAdminRead({
        ...base,
        routeUrl: "/admin/users/:userId/trip-paths",
        params: { userId: "u1" },
      })
    ).toEqual({ targetUserId: "u1", what: "/admin/users/:userId/trip-paths", ref: null });
  });

  it("logs the support thread and screenshot screens, which carry no userId", () => {
    expect(
      describeAdminRead({ ...base, routeUrl: "/admin/support-inbox/thread", query: { key: "app-1" } })
    ).toEqual({ targetUserId: null, what: "/admin/support-inbox/thread", ref: "app-1" });
    expect(
      describeAdminRead({
        ...base,
        routeUrl: "/admin/support-inbox/attachments/:id",
        params: { id: "a1" },
      })?.ref
    ).toBe("a1");
    expect(describeAdminRead({ ...base, routeUrl: "/admin/users/export" })).not.toBeNull();
  });

  it("ignores aggregate screens, writes and failed requests", () => {
    expect(describeAdminRead({ ...base, routeUrl: "/admin/analytics" })).toBeNull();
    expect(
      describeAdminRead({ ...base, method: "PATCH", routeUrl: "/admin/users/:userId/notes", params: { userId: "u1" } })
    ).toBeNull();
    expect(
      describeAdminRead({ ...base, statusCode: 404, routeUrl: "/admin/users/:userId", params: { userId: "u1" } })
    ).toBeNull();
  });
});

describe("createAdminReadThrottle", () => {
  it("logs the same admin + driver + screen once per window", () => {
    const should = createAdminReadThrottle(1000);
    const d = { targetUserId: "u1", what: "/admin/users/:userId", ref: null };
    expect(should("admin", d, 0)).toBe(true);
    expect(should("admin", d, 500)).toBe(false);
    expect(should("admin", { ...d, what: "/admin/users/:userId/events" }, 500)).toBe(true);
    expect(should("other-admin", d, 500)).toBe(true);
    expect(should("admin", d, 1500)).toBe(true);
  });
});
