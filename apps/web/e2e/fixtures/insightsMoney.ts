import type { Page, Route } from "@playwright/test";
import { API } from "./api";

type Body = unknown;
type Handler = Body | ((req: { url: URL; method: string; body: unknown }) => Body | { status: number; body: Body });

export interface Calls {
  /** Every request seen by `mockApi`, in order. */
  all: Array<{ method: string; path: string; search: string; body: unknown }>;
  find(method: string, path: string): Array<{ search: string; body: unknown }>;
}

/**
 * Layered on top of mockSession(): answers the endpoints a Package D page needs and
 * records what was sent. Keys are "GET /path". Anything not listed falls through to
 * mockSession's handler (which 404s unknown paths, so a page can never hit a real API).
 */
export async function mockApi(page: Page, handlers: Record<string, Handler>): Promise<Calls> {
  const calls: Calls["all"] = [];
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === "OPTIONS") return route.fallback();
    const key = `${method} ${url.pathname}`;
    const h = handlers[key];
    if (h === undefined) return route.fallback();
    let body: unknown = undefined;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    calls.push({ method, path: url.pathname, search: url.search, body });
    const out = typeof h === "function" ? (h as (r: { url: URL; method: string; body: unknown }) => Body)({ url, method, body }) : h;
    const status = out && typeof out === "object" && "status" in (out as object) && "body" in (out as object) ? (out as { status: number }).status : 200;
    const payload = out && typeof out === "object" && "status" in (out as object) && "body" in (out as object) ? (out as { body: Body }).body : out;
    return route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(payload ?? {}),
    });
  });
  return {
    all: calls,
    find: (method, path) => calls.filter((c) => c.method === method && c.path === path).map(({ search, body }) => ({ search, body })),
  };
}

export const iso = (d: Date) => d.toISOString();
export const thisMonthIso = () => new Date().toISOString();
