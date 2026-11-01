import { describe, it, expect } from "vitest";
import { oemGroupFor, oemGuideFor, oemBrandName, oemFirstScreen, verificationMessage, batteryRowTap, doneStateWrites, BATTERY_SNOOZE_KEY, OEM_GUIDE_DONE_KEY } from "../oemBatteryGuide";

describe("oemGroupFor", () => {
  it("maps the makers with high silent-day rates", () => {
    expect(oemGroupFor("OPPO")).toBe("oppo_realme");
    expect(oemGroupFor("realme")).toBe("oppo_realme");
    expect(oemGroupFor("OnePlus")).toBe("oneplus");
    expect(oemGroupFor("motorola")).toBe("motorola");
    expect(oemGroupFor("HONOR")).toBe("honor_huawei");
    expect(oemGroupFor("HUAWEI")).toBe("honor_huawei");
    expect(oemGroupFor("vivo")).toBe("vivo");
  });
  it("leaves Samsung, Google, Xiaomi and unknown on today's flow", () => {
    for (const m of ["samsung", "Google", "Xiaomi", "", null, undefined, "Nokia"]) {
      expect(oemGroupFor(m)).toBeNull();
      expect(oemGuideFor(m)).toBeNull();
    }
  });
});

describe("oemGuideFor", () => {
  it("names the real labels, with no em dashes", () => {
    const honor = oemGuideFor("HONOR")!;
    const text = [honor.title, honor.intro, ...honor.steps, honor.closing].join(" ");
    expect(text).toContain("Manage automatically");
    expect(text).toContain("Secondary launch");
    expect(text).not.toContain("—");
    expect(oemGuideFor("OnePlus")!.steps.join(" ")).toContain("Allow background activity");
    expect(oemGuideFor("motorola")!.steps.join(" ")).toContain("Adaptive battery");
    expect(oemGuideFor("oppo")!.steps.join(" ")).toContain("Allow auto launch");
  });
  it("uses the right brand casing", () => {
    expect(oemBrandName("REALME")).toBe("realme");
    expect(oemGuideFor("realme")!.title).toContain("realme");
  });
  it("keeps every guide short", () => {
    for (const m of ["oppo", "realme", "oneplus", "motorola", "honor", "huawei", "vivo"]) {
      const g = oemGuideFor(m)!;
      expect(g.steps.length).toBeGreaterThanOrEqual(2);
      expect(g.steps.length).toBeLessThanOrEqual(4);
    }
  });
});

describe("oemFirstScreen", () => {
  it("starts Motorola and ColorOS at the app page", () => {
    expect(oemFirstScreen("motorola")).toBe("app");
    expect(oemFirstScreen("oppo_realme")).toBe("app");
  });
});

describe("first step matches the screen the button opens", () => {
  const cases: Array<[string, RegExp]> = [
    ["OPPO", /App info/],
    ["realme", /App info/],
    ["OnePlus", /App info/],
    ["motorola", /App info/],
    ["HONOR", /App launch/],
    ["HUAWEI", /App launch/],
    ["vivo", /background start-up list/],
  ];
  it.each(cases)("%s", (maker, re) => {
    expect(oemGuideFor(maker)!.steps[0]).toMatch(re);
  });
  it("opens the vendor list only where the steps start there", () => {
    expect(oemFirstScreen(oemGroupFor("OnePlus")!)).toBe("app");
    expect(oemFirstScreen(oemGroupFor("HONOR")!)).toBe("vendor");
    expect(oemFirstScreen(oemGroupFor("vivo")!)).toBe("vendor");
  });
});

describe("per-group verification wording", () => {
  it("HONOR points at Special access", () => {
    expect(verificationMessage(false, "honor_huawei").detail).toContain("Special access");
  });
  it("Motorola mentions Adaptive battery on yes", () => {
    expect(verificationMessage(true, "motorola").detail).toContain("Adaptive battery");
    expect(verificationMessage(true, "motorola").detail).not.toContain("auto launch");
  });
});

describe("batteryRowTap (the Home and Settings branch)", () => {
  it("sends OEM makers to the guide with the maker", () => {
    expect(batteryRowTap("OPPO")).toEqual({ kind: "oem_guide", maker: "OPPO" });
  });
  it("leaves everyone else on the default flow", () => {
    for (const m of ["samsung", "Google", "Xiaomi", null, undefined, ""]) {
      expect(batteryRowTap(m)).toEqual({ kind: "default" });
    }
  });
});

describe("Done", () => {
  it("writes the done time and the Home snooze", () => {
    const writes = doneStateWrites(1234);
    expect(writes).toContainEqual([OEM_GUIDE_DONE_KEY, "1234"]);
    expect(writes).toContainEqual([BATTERY_SNOOZE_KEY, "1234"]);
    expect(BATTERY_SNOOZE_KEY).toBe("battery_opt_nudge_dismissed_at");
  });
});

describe("verificationMessage", () => {
  it("confirms, denies or admits it cannot tell", () => {
    expect(verificationMessage(true).result).toBe("yes");
    expect(verificationMessage(false).result).toBe("no");
    expect(verificationMessage(null).result).toBe("unknown");
    expect(verificationMessage(true).detail).toContain("can't be checked");
  });
});
