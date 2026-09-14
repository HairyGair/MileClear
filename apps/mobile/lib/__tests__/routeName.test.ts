import { describe, it, expect } from "vitest";
import {
  ID_PLACEHOLDER,
  MAX_ROUTE_LENGTH,
  routeNameFromSegments,
  sanitiseSegment,
} from "../events/routeName";

describe("routeNameFromSegments", () => {
  it("builds a leading-slash route from plain segments", () => {
    expect(routeNameFromSegments(["(tabs)", "dashboard"])).toBe("/(tabs)/dashboard");
  });

  it("reports the root route as /", () => {
    expect(routeNameFromSegments([])).toBe("/");
  });

  it("keeps route groups, which distinguish a tab from a modal", () => {
    expect(routeNameFromSegments(["(auth)", "login"])).toBe("/(auth)/login");
  });

  it("keeps a dynamic segment as its file pattern", () => {
    expect(routeNameFromSegments(["trips", "[id]"])).toBe("/trips/[id]");
  });

  it("keeps a catch-all segment", () => {
    expect(routeNameFromSegments(["docs", "[...rest]"])).toBe("/docs/[...rest]");
  });

  it("keeps long hyphenated route names that carry no digits", () => {
    expect(routeNameFromSegments(["drive-detection-diagnostics"])).toBe(
      "/drive-detection-diagnostics"
    );
    expect(routeNameFromSegments(["saved-locations-suggest"])).toBe(
      "/saved-locations-suggest"
    );
    expect(routeNameFromSegments(["admin-user-detail"])).toBe("/admin-user-detail");
  });

  it("truncates an absurdly long route", () => {
    const route = routeNameFromSegments([("x").repeat(400)]);
    expect(route.length).toBe(MAX_ROUTE_LENGTH);
  });

  it("ignores non-string segments without throwing", () => {
    const segments = ["trips", undefined, 7, null, "[id]"] as unknown as string[];
    expect(routeNameFromSegments(segments)).toBe("/trips/[id]");
  });

  it("returns / for a non-array input", () => {
    expect(routeNameFromSegments(undefined as unknown as string[])).toBe("/");
  });
});

describe("no identifier can reach the event log", () => {
  it("replaces a resolved UUID with the placeholder", () => {
    expect(
      routeNameFromSegments(["trips", "9f2c8b14-3d5a-4f7b-9c1e-2a4b6d8e0f13"])
    ).toBe(`/trips/${ID_PLACEHOLDER}`);
  });

  it("replaces a dashless hex id", () => {
    expect(routeNameFromSegments(["trips", "9f2c8b143d5a4f7b"])).toBe(
      `/trips/${ID_PLACEHOLDER}`
    );
  });

  it("replaces a numeric row id", () => {
    expect(routeNameFromSegments(["invoices", "80421"])).toBe(
      `/invoices/${ID_PLACEHOLDER}`
    );
  });

  it("replaces a long opaque token that carries a digit", () => {
    expect(sanitiseSegment("aGVsbG8gdGhlcmUgMTIz")).toBe(ID_PLACEHOLDER);
  });

  it("strips a query string rather than recording its value", () => {
    expect(sanitiseSegment("refer?code=ANTHONY123")).toBe("refer");
  });

  it("strips a hash fragment", () => {
    expect(sanitiseSegment("login#apple_token=abc")).toBe("login");
  });

  it("never lets an email survive as a segment", () => {
    // 21 chars with a digit: caught by the generic opaque-token rule.
    expect(sanitiseSegment("driver1@example.co.uk")).toBe(ID_PLACEHOLDER);
  });
});
