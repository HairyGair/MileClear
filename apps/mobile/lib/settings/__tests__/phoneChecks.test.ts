import { describe, it, expect } from "vitest";
import { phoneRows, type PhoneInputs } from "../phoneChecks";

const ok: PhoneInputs = { platform: "ios", tier: "always", bgRefreshOff: false, motion: "granted", lowPower: false };

describe("phoneRows", () => {
  it("is four green ticks when all is well on an iPhone", () => {
    const r = phoneRows(ok);
    expect(r.map((x) => x.id)).toEqual(["location", "background_refresh", "motion", "low_power"]);
    expect(r.every((x) => x.look === "ok")).toBe(true);
  });

  it("While Using location is red with a fix", () => {
    const loc = phoneRows({ ...ok, tier: "foreground" })[0];
    expect(loc.look).toBe("bad");
    expect(loc.title).toBe("Location: While Using");
    expect(loc.fix).toBe("request_location");
  });

  it("no location is red", () => {
    expect(phoneRows({ ...ok, tier: "none" })[0].title).toBe("Location: Off");
  });

  it("Background App Refresh off is red and only exists on iPhone", () => {
    expect(phoneRows({ ...ok, bgRefreshOff: true })[1].look).toBe("bad");
    const android = phoneRows({ ...ok, platform: "android" });
    expect(android.find((x) => x.id === "background_refresh")).toBeUndefined();
  });

  it("motion: asks when not asked, hides when the phone can't say", () => {
    expect(phoneRows({ ...ok, motion: "undetermined" })[2].fix).toBe("request_motion");
    expect(phoneRows({ ...ok, motion: "denied" })[2].fix).toBe("open_phone_settings");
    expect(phoneRows({ ...ok, motion: "unavailable" }).find((x) => x.id === "motion")).toBeUndefined();
  });

  it("uses each phone's own words", () => {
    expect(phoneRows({ ...ok, lowPower: true }).at(-1)!.title).toBe("Low Power Mode: On");
    const a = phoneRows({ ...ok, platform: "android", lowPower: true });
    expect(a.at(-1)!.title).toBe("Battery Saver: On");
    expect(a[0].title).toBe("Location: Allow all the time");
  });
});
