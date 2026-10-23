// Sending New Zealand visitors from the homepage to /nz (23 Oct 2026).
//
// Off unless NZ_HOME_REDIRECT=on. Only "/" redirects, always with a 307 so
// nothing is cached as permanent; deep links never move. Crawlers, anyone who
// has picked a site (the mc_region cookie) and ?region=uk are left alone.
// The decision is a pure function so the rules are testable without a server.

export const REGION_COOKIE = "mc_region";
export const REGION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export type RegionChoice = "uk" | "nz";

/** The switch. Read per call so the middleware sees the running env. */
export function nzHomeRedirectOn(): boolean {
  return process.env.NZ_HOME_REDIRECT === "on";
}

const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|slack|linkedin|pinterest|lighthouse|pagespeed|headless|curl|wget|python-requests|go-http-client/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}

/** The visitor's address. Apache proxies to Next ([P]) and adds
 *  X-Forwarded-For; the first entry is the client, the same address Fastify
 *  uses for the API (trustProxy: true, e.g. the sign-up country). A visitor
 *  can put their own value first, but all that changes is whether they get
 *  redirected, so it's not worth guarding. */
export function clientIp(forwardedFor: string | null | undefined, realIp?: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  const ip = first || realIp?.trim() || "";
  return ip ? ip.replace(/^::ffff:/, "") : null;
}

export interface HomeRequest {
  pathname: string;
  region: string | null; // ?region=
  cookie: string | null; // mc_region
  userAgent: string | null;
}

/** Whether a request might be redirected at all, before any geo lookup. */
export type PreCheck = { kind: "stay" } | { kind: "nz" } | { kind: "lookup" };

export function preCheck(req: HomeRequest): PreCheck {
  if (req.pathname !== "/") return { kind: "stay" };
  if (req.region) return { kind: "stay" };
  if (req.cookie === "uk") return { kind: "stay" };
  if (isBot(req.userAgent)) return { kind: "stay" };
  if (req.cookie === "nz") return { kind: "nz" };
  if (req.cookie) return { kind: "stay" };
  return { kind: "lookup" };
}

export function shouldRedirectToNz(req: HomeRequest, country: string | null): boolean {
  const pre = preCheck(req);
  if (pre.kind === "nz") return true;
  return pre.kind === "lookup" && country === "NZ";
}
