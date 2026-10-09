import type { Page, Route } from "@playwright/test";
import { API, profile, type Profile } from "./api";

// Extra API mocks for the settings, help, feedback, EmSee and invite pages.
// Register AFTER mockSession(): routes added later win, and anything not
// handled here falls through to the shared fixtures.

export interface Recorded {
  method: string;
  path: string;
  query: string;
  body: Record<string, unknown> | null;
}

type Reply = { status?: number; body?: unknown } | undefined;
type Handler = (req: Recorded) => Reply | unknown;

export async function mockRoutes(page: Page, handlers: Record<string, Handler>): Promise<Recorded[]> {
  const seen: Recorded[] = [];
  await page.route(`${API}/**`, async (route: Route) => {
    const r = route.request();
    if (r.method() === "OPTIONS") return route.fallback();
    const url = new URL(r.url());
    const key = `${r.method()} ${url.pathname}`;
    const handler = handlers[key];
    if (!handler) return route.fallback();
    let body: Record<string, unknown> | null = null;
    try {
      body = r.postDataJSON();
    } catch {
      body = null;
    }
    const rec: Recorded = { method: r.method(), path: url.pathname, query: url.search, body };
    seen.push(rec);
    const out = handler(rec) as { status?: number; body?: unknown; __reply?: true } | undefined;
    const isReply = out && typeof out === "object" && "__reply" in out;
    const status = isReply ? (out.status ?? 200) : 200;
    const payload = isReply ? out.body : out;
    return route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(payload ?? {}),
    });
  });
  return seen;
}

/** Return this from a handler to set a status code. */
export function reply(status: number, body: unknown) {
  return { __reply: true as const, status, body };
}

/** GET and PATCH /user/profile backed by one mutable object. */
export function profileStore(initial: Profile = profile()) {
  const state: Profile = { ...initial };
  const handlers: Record<string, Handler> = {
    "GET /user/profile": () => ({ data: state }),
    "PATCH /user/profile": (req) => {
      Object.assign(state, req.body ?? {});
      return { data: state };
    },
  };
  return { state, handlers };
}
