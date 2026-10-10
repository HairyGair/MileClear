// A screen file with no <Stack.Screen> line in app/_layout.tsx opens with NO
// header and no back button (the root stack defaults to headerShown: false),
// and typecheck, lint and every other test stay green. That trapped drivers on
// Preferences and Profile until 10 Oct 2026. This test fails the build instead.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..", "app");
const layout = readFileSync(join(APP, "_layout.tsx"), "utf8");

function registered(name: string): boolean {
  return layout.includes(`<Stack.Screen name="${name}"`);
}

describe("every settings screen is registered with a header", () => {
  const files = readdirSync(join(APP, "settings")).filter((f) => f.endsWith(".tsx"));

  it("finds the settings screens", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  for (const f of files) {
    const route = `settings/${f.replace(/\.tsx$/, "")}`;
    it(`${route} has a Stack.Screen line`, () => {
      expect(registered(route)).toBe(true);
    });
    // A legacy stub only redirects (old links must never land on a missing
    // screen), so it has no header of its own; every real screen needs one.
    const isRedirect = readFileSync(join(APP, "settings", f), "utf8").includes("<Redirect");
    it(`${route} ${isRedirect ? "is a redirect with no header of its own" : "shows its header"}`, () => {
      const line = layout.split("\n").find((l) => l.includes(`<Stack.Screen name="${route}"`)) ?? "";
      if (isRedirect) {
        expect(line).toContain("headerShown: false");
      } else {
        expect(line).toContain("headerShown: true");
        expect(line).toMatch(/title: "[^"]+"/);
      }
    });
  }
});

describe("every top-level screen in app/ is registered", () => {
  const files = readdirSync(APP)
    .filter((f) => f.endsWith(".tsx") && !f.startsWith("_") && f !== "index.tsx");
  for (const f of files) {
    const name = f.replace(/\.tsx$/, "");
    it(`${name} has a Stack.Screen line`, () => {
      expect(registered(name)).toBe(true);
    });
  }
});
