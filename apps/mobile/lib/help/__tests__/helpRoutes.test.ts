// Every "Go there" link in the help (packages/shared/src/data/help.ts) must
// open a real screen: a file under app/ (route groups like (tabs) don't
// appear in the URL), or an old route that is now a <Redirect>. A link to a
// screen that was removed would open Expo Router's "Unmatched route" page.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP_ENTRIES } from "@mileclear/shared";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

/** "app/(tabs)/trips.tsx" -> "/trips"; "app/settings/index.tsx" -> "/settings". */
function urlOf(file: string): string {
  const parts = relative(APP, file)
    .replace(/\.tsx$/, "")
    .split("/")
    .filter((s) => !/^\(.*\)$/.test(s) && s !== "index" && !s.startsWith("_"));
  return "/" + parts.join("/");
}

const routes = new Map<string, string>();
for (const f of files(APP)) {
  if (/\/_layout\.tsx$/.test(f) || /\[/.test(f)) continue;
  routes.set(urlOf(f), f);
}

/** Strip the query and the route group the help may write ("/(tabs)/tax"). */
function normalise(goTo: string): string {
  const path = goTo.split("?")[0];
  const clean = "/" + path.split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
  return clean === "/" ? "/" : clean.replace(/\/$/, "");
}

describe("help Go there links", () => {
  const links = HELP_ENTRIES.filter((e) => e.goTo).map((e) => [e.id, e.goTo!] as const);

  it("has links to check", () => {
    expect(links.length).toBeGreaterThan(30);
  });

  it.each(links)("%s -> %s is a real screen", (_id, goTo) => {
    expect(goTo.startsWith("/"), goTo).toBe(true);
    const file = routes.get(normalise(goTo));
    expect(file, `${goTo} has no file under app/`).toBeDefined();
    // A redirect stub is fine only if it lands on a real screen.
    const src = readFileSync(file!, "utf8");
    const redirect = src.match(/<Redirect href="([^"]+)"/);
    if (redirect) expect(routes.has(normalise(redirect[1])), `${goTo} redirects to a missing ${redirect[1]}`).toBe(true);
  });

  it("knows the old Settings routes are redirects", () => {
    // Guards the helper: these exist only as <Redirect> files since 10 Oct.
    for (const old of ["/settings/tracking", "/settings/preferences", "/settings/profile"]) {
      expect(readFileSync(routes.get(old)!, "utf8")).toMatch(/<Redirect href=/);
    }
  });
});
