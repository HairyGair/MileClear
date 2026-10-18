import { describe, it, expect } from "vitest";
import { displayRoad, spokenRoad, spokenRoadNumber, spokenStreet, towardsWords } from "../streetSpeech";

describe("road numbers (DESIGN 3.5)", () => {
  it.each([
    ["A1", "A one"],
    ["M62", "M sixty two"],
    ["A19(T)", "A nineteen"],
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

describe("the road of a step", () => {
  it("name first, else the number with the", () => {
    expect(spokenRoad({ streetName: "Durham Road", roadRef: "A690" })).toBe("Durham Road");
    expect(spokenRoad({ streetName: null, roadRef: "A1" })).toBe("the A one");
    expect(spokenRoad({ streetName: null, roadRef: "A189" })).toBe("the A one eight nine");
    expect(spokenRoad({ streetName: null, roadRef: "M62" })).toBe("the M sixty two");
    expect(spokenRoad({ streetName: null, roadRef: "A19(T)" })).toBe("the A nineteen");
    expect(spokenRoad({ streetName: null, roadRef: "A1;A194(M)" })).toBe("the A one");
    expect(spokenRoad({ streetName: null, roadRef: null })).toBeNull();
  });
  it("shown as Name (A189), or just one of them", () => {
    expect(displayRoad({ streetName: "Coast Road", roadRef: "A189" })).toBe("Coast Road (A189)");
    expect(displayRoad({ streetName: "Coast Road (A1058)", roadRef: "A1058" })).toBe("Coast Road (A1058)");
    expect(displayRoad({ streetName: null, roadRef: "A1" })).toBe("A1");
    expect(displayRoad({ streetName: "Park Lane", roadRef: null })).toBe("Park Lane");
  });
  it("towards", () => {
    expect(towardsWords("Sunderland, Washington")).toBe("Sunderland and Washington");
    expect(towardsWords("Sunderland")).toBe("Sunderland");
    expect(towardsWords("")).toBeNull();
  });
});
