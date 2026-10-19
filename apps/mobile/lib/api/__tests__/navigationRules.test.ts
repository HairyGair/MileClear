import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMissingEndpoint, NavigationError, ROUTE_TIMEOUT, routeBody, searchBody, toNavigationError } from "../navigationRules";

describe("request bodies (places never in a URL)", () => {
  it("route: from and to as lat,lng strings, heading 0-359 when known", () => {
    expect(routeBody({ from: { lat: 51.4543, lng: -0.9781 }, to: { lat: 51.5, lng: -0.1 } })).toEqual({
      from: "51.454300,-0.978100",
      to: "51.500000,-0.100000",
    });
    expect(routeBody({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 }, headingDeg: 359.7 }).heading).toBe(0);
    expect(routeBody({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 }, headingDeg: -90 }).heading).toBe(270);
    expect(routeBody({ from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 }, headingDeg: null })).not.toHaveProperty("heading");
  });
  it("search: q, and near as lat,lng when known", () => {
    expect(searchBody("sage", { lat: 54.9675, lng: -1.6008 })).toEqual({ q: "sage", near: "54.96750,-1.60080" });
    expect(searchBody("sage", null)).toEqual({ q: "sage" });
  });
  it("the client POSTs both, with nothing after a ? in the path", () => {
    const src = readFileSync(join(__dirname, "..", "navigation.ts"), "utf8");
    expect(src).toMatch(/apiRequest<NavigationRouteResponse>\("\/navigation\/route", \{\s*method: "POST"/);
    expect(src).toMatch(/"\/navigation\/search", \{\s*method: "POST"/);
    expect(src).not.toMatch(/\/navigation\/(route|search)\?/);
  });
});

describe("an older server without the POST forms", () => {
  it("Fastify's own 404 or a 405 is 'not available', never 'no route', and never retried as GET", () => {
    expect(isMissingEndpoint({ statusCode: 404, message: "Not Found" })).toBe(true);
    expect(isMissingEndpoint({ statusCode: 405, message: "Method Not Allowed" })).toBe(true);
    expect(isMissingEndpoint({ statusCode: 404, message: "No route found between those places." })).toBe(false);
    expect(toNavigationError(new Error("x"), { statusCode: 404, code: "NOT_FOUND", message: "Not Found" }).kind).toBe("ROUTING_UNAVAILABLE");
    expect(toNavigationError(new Error("x"), { statusCode: 404, code: "NOT_FOUND", message: "No route found between those places." }).kind).toBe("NO_ROUTE");
  });
});

describe("toNavigationError", () => {
  it("the contract's codes, from the status the server sends them with", () => {
    expect(toNavigationError(new Error("x"), { statusCode: 403, code: "FORBIDDEN" }).kind).toBe("NAVIGATION_NOT_ENABLED");
    expect(toNavigationError(new Error("x"), { statusCode: 404, code: "NOT_FOUND" }).kind).toBe("NO_ROUTE");
    expect(toNavigationError(new Error("x"), { statusCode: 503, code: "INTERNAL" }).kind).toBe("ROUTING_UNAVAILABLE");
    expect(toNavigationError(new Error("x"), { statusCode: 400, code: "BAD_REQUEST" }).kind).toBe("BAD_INPUT");
    expect(toNavigationError(new Error("x"), { statusCode: 429, code: "TOO_MANY_REQUESTS" }).kind).toBe("TOO_MANY_REQUESTS");
  });
  it("a code the client already understood wins", () => {
    expect(toNavigationError(new Error("x"), { statusCode: 500, code: "NO_ROUTE" }).kind).toBe("NO_ROUTE");
  });
  it("offline, no answer in 10 s, and anything else", () => {
    expect(toNavigationError(new Error("Network error"), null).kind).toBe("OFFLINE");
    expect(toNavigationError(new Error(ROUTE_TIMEOUT), null).kind).toBe("ROUTING_UNAVAILABLE");
    expect(toNavigationError("weird", null).kind).toBe("UNKNOWN");
  });
  it("passes a NavigationError through", () => {
    const e = new NavigationError("NO_ROUTE", "msg");
    expect(toNavigationError(e, null)).toBe(e);
  });
});
