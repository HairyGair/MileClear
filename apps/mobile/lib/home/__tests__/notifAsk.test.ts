import { describe, it, expect } from "vitest";
import {
  NOTIF_REASK_AFTER_TRIPS,
  notifAskCopy,
  notifAskPending,
  parseNotifAskMemory,
  shouldShowNotifAsk,
} from "../notifAsk";

const never = { asks: 0, atTrips: 0 };

describe("shouldShowNotifAsk", () => {
  it("waits for the first saved trip", () => {
    expect(shouldShowNotifAsk({ permission: "undetermined", trips: 0, memory: never })).toBe(false);
    expect(shouldShowNotifAsk({ permission: "undetermined", trips: 1, memory: never })).toBe(true);
  });

  it("does nothing once the phone has an answer", () => {
    expect(shouldShowNotifAsk({ permission: "granted", trips: 4, memory: never })).toBe(false);
    expect(shouldShowNotifAsk({ permission: "denied", trips: 4, memory: never })).toBe(false);
  });

  it("does nothing until the trips and memory are read", () => {
    expect(shouldShowNotifAsk({ permission: "undetermined", trips: null, memory: never })).toBe(false);
    expect(shouldShowNotifAsk({ permission: "undetermined", trips: 3, memory: null })).toBe(false);
    expect(shouldShowNotifAsk({ permission: null, trips: 3, memory: never })).toBe(false);
  });

  it("after Not now, asks once more a few trips later, then never", () => {
    const once = { asks: 1, atTrips: 1 };
    expect(shouldShowNotifAsk({ permission: "undetermined", trips: 1 + NOTIF_REASK_AFTER_TRIPS - 1, memory: once })).toBe(false);
    expect(shouldShowNotifAsk({ permission: "undetermined", trips: 1 + NOTIF_REASK_AFTER_TRIPS, memory: once })).toBe(true);
    expect(shouldShowNotifAsk({ permission: "undetermined", trips: 50, memory: { asks: 2, atTrips: 6 } })).toBe(false);
  });
});

describe("parseNotifAskMemory", () => {
  it("reads what was stored", () => {
    expect(parseNotifAskMemory('{"asks":1,"atTrips":3}', false)).toEqual({ asks: 1, atTrips: 3 });
  });
  it("counts the old one-time Alert as one ask", () => {
    expect(parseNotifAskMemory(null, true)).toEqual({ asks: 1, atTrips: 0 });
  });
  it("treats nothing, or junk, as never asked", () => {
    expect(parseNotifAskMemory(null, false)).toEqual(never);
    expect(parseNotifAskMemory("nope", false)).toEqual(never);
  });
});

describe("notifAskPending", () => {
  it("holds the setup row back only while the ask is still to come", () => {
    expect(notifAskPending("undetermined", never)).toBe(true);
    expect(notifAskPending("undetermined", { asks: 1, atTrips: 1 })).toBe(true);
    expect(notifAskPending("undetermined", { asks: 2, atTrips: 6 })).toBe(false);
    expect(notifAskPending("denied", never)).toBe(false);
    expect(notifAskPending("granted", never)).toBe(false);
  });
});

describe("notifAskCopy", () => {
  it("explains before the phone asks, in plain words", () => {
    expect(notifAskCopy(1).title).toBe("Your first trip is saved");
    expect(notifAskCopy(6).title).toBe("6 trips saved");
    expect(notifAskCopy(1).body).toBe("Get a nudge when a trip needs sorting, and your weekly recap.");
  });
});
