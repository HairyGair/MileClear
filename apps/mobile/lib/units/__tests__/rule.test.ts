import { describe, expect, it } from "vitest";
import { onServerDistanceUnit, parseCachedDistanceUnit } from "../rule";

describe("parseCachedDistanceUnit", () => {
  it("reads km and the pending flag", () => {
    expect(parseCachedDistanceUnit("km", "1")).toEqual({ unit: "km", pending: true });
    expect(parseCachedDistanceUnit("miles", "0")).toEqual({ unit: "miles", pending: false });
  });

  it("treats a missing or junk value as miles, not pending", () => {
    expect(parseCachedDistanceUnit(null, null)).toEqual({ unit: "miles", pending: false });
    expect(parseCachedDistanceUnit("kilometres", "yes")).toEqual({ unit: "miles", pending: false });
  });
});

describe("onServerDistanceUnit", () => {
  it("adopts the server's value when nothing is waiting to be sent", () => {
    expect(onServerDistanceUnit("km", { unit: "miles", pending: false })).toEqual({ kind: "adopt", unit: "km" });
    expect(onServerDistanceUnit("miles", { unit: "km", pending: false })).toEqual({ kind: "adopt", unit: "miles" });
  });

  it("keeps an offline choice and sends it again until the server has it", () => {
    expect(onServerDistanceUnit("miles", { unit: "km", pending: true })).toEqual({ kind: "resend", unit: "km" });
    expect(onServerDistanceUnit(undefined, { unit: "km", pending: true })).toEqual({ kind: "resend", unit: "km" });
  });

  it("clears the pending flag once the server agrees", () => {
    expect(onServerDistanceUnit("km", { unit: "km", pending: true })).toEqual({ kind: "adopt", unit: "km" });
  });

  it("leaves the phone alone when an older server omits the field", () => {
    expect(onServerDistanceUnit(undefined, { unit: "km", pending: false })).toEqual({ kind: "keep" });
  });

  it("reads anything unknown from the server as miles", () => {
    expect(onServerDistanceUnit(null, { unit: "km", pending: false })).toEqual({ kind: "adopt", unit: "miles" });
  });
});
