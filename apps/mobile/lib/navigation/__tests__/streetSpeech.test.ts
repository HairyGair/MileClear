import { describe, it, expect } from "vitest";
import { spokenRoadNumber, spokenStreet } from "../streetSpeech";

describe("road numbers (DESIGN 3.5)", () => {
  it.each([
    ["A1", "A one"],
    ["M62", "M sixty-two"],
    ["A1(M)", "A one M"],
    ["A184", "A one eight four"],
    ["B1301", "B one three oh one"],
    ["A19", "A nineteen"],
    ["M1", "M one"],
    ["A690", "A six nine oh"],
  ])("%s is %s", (n, w) => expect(spokenRoadNumber(n)).toBe(w));

  it("not a road number", () => {
    expect(spokenRoadNumber("Park")).toBeNull();
    expect(spokenRoadNumber("AB12")).toBeNull();
  });
});

describe("street names, North East style", () => {
  it.each([
    ["A19", "the A nineteen"],
    ["A1(M)", "the A one M"],
    ["Coast Road (A1058)", "Coast Road"],
    ["(A1058)", "the A one oh five eight"],
    ["Durham Road", "Durham Road"],
    ["Queen Victoria Road", "Queen Victoria Road"],
    ["Front Street & Church Lane", "Front Street and Church Lane"],
    ["Wessington Way (Sunderland)", "Wessington Way"],
    ["Tyne Tunnel", "Tyne Tunnel"],
    ["  ", null],
    [null, null],
  ])("%s says %s", (n, w) => expect(spokenStreet(n)).toBe(w));
});
