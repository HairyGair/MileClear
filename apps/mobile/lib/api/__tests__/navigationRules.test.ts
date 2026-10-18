import { describe, it, expect } from "vitest";
import { NavigationError, routeQuery, toNavigationError } from "../navigationRules";

describe("routeQuery", () => {
  it("from and to as lat,lng, heading 0-359 when known", () => {
    expect(routeQuery({ from: { lat: 51.4543, lng: -0.9781 }, to: { lat: 51.5, lng: -0.1 } })).toBe(
      "from=51.454300%2C-0.978100&to=51.500000%2C-0.100000"
    );
    expect(routeQuery({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 }, headingDeg: 359.7 })).toMatch(/&heading=0$/);
    expect(routeQuery({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 }, headingDeg: -90 })).toMatch(/&heading=270$/);
    expect(routeQuery({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 }, headingDeg: null })).not.toContain("heading");
  });
});

describe("toNavigationError", () => {
  it("the contract's codes, from the status the server sends them with", () => {
    expect(toNavigationError(new Error("x"), { statusCode: 403, code: "FORBIDDEN" }).kind).toBe("NAVIGATION_NOT_ENABLED");
    expect(toNavigationError(new Error("x"), { statusCode: 404, code: "NOT_FOUND" }).kind).toBe("NO_ROUTE");
    expect(toNavigationError(new Error("x"), { statusCode: 503, code: "INTERNAL" }).kind).toBe("ROUTING_UNAVAILABLE");
    expect(toNavigationError(new Error("x"), { statusCode: 400, code: "BAD_REQUEST" }).kind).toBe("BAD_INPUT");
  });
  it("a code the client already understood wins", () => {
    expect(toNavigationError(new Error("x"), { statusCode: 500, code: "NO_ROUTE" }).kind).toBe("NO_ROUTE");
  });
  it("offline and anything else", () => {
    expect(toNavigationError(new Error("Network error"), null).kind).toBe("OFFLINE");
    expect(toNavigationError("weird", null).kind).toBe("UNKNOWN");
  });
  it("passes a NavigationError through, with plain words", () => {
    const e = new NavigationError("NO_ROUTE", "msg");
    expect(toNavigationError(e, null)).toBe(e);
    const w = toNavigationError(new Error("x"), { statusCode: 404, code: "NOT_FOUND" });
    expect(w.message).toMatch(/Great Britain/);
    expect(w.message).not.toContain("—");
  });
});
