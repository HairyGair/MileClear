import { describe, it, expect } from "vitest";
import { oemGroupFor, oemGuideFor, oemBrandName, oemFirstScreen, verificationMessage } from "../oemBatteryGuide";

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
  it("starts Motorola at the app page and the rest at the vendor list", () => {
    expect(oemFirstScreen("motorola")).toBe("app");
    expect(oemFirstScreen("oppo_realme")).toBe("vendor");
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
