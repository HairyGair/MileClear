import { NextResponse, type NextRequest } from "next/server";
import { REGION_COOKIE, clientIp, nzHomeRedirectOn, preCheck } from "@/lib/region/nzHome";

// Homepage only: New Zealand visitors go to /nz when NZ_HOME_REDIRECT=on
// (rules in lib/region/nzHome.ts). Node runtime, because the country lookup
// is geoip-lite (the offline MaxMind data the API already uses), which reads
// its data files from disk and can't run on the edge runtime. With the switch
// off this returns before touching anything, so the UK homepage is unchanged.
export const config = { matcher: "/", runtime: "nodejs" };

type GeoLookup = (ip: string) => { country?: string } | null;
let geoLookup: GeoLookup | null = null;

/** Loaded on first use only, then kept in memory (about 110 MB of lookup
 *  data), so nothing is loaded while the switch is off. */
async function lookupCountry(ip: string): Promise<string | null> {
  if (!geoLookup) {
    const mod = await import("geoip-lite");
    const geoip = (mod.default ?? mod) as { lookup: GeoLookup };
    geoLookup = (addr) => geoip.lookup(addr);
  }
  return geoLookup(ip)?.country ?? null;
}

export async function middleware(request: NextRequest) {
  if (!nzHomeRedirectOn()) return NextResponse.next();

  const pre = preCheck({
    pathname: request.nextUrl.pathname,
    region: request.nextUrl.searchParams.get("region"),
    cookie: request.cookies.get(REGION_COOKIE)?.value ?? null,
    userAgent: request.headers.get("user-agent"),
  });
  if (pre.kind === "stay") return NextResponse.next();

  let toNz = pre.kind === "nz";
  if (pre.kind === "lookup") {
    const ip = clientIp(request.headers.get("x-forwarded-for"), request.headers.get("x-real-ip"));
    toNz = ip ? (await lookupCountry(ip)) === "NZ" : false;
  }
  if (!toNz) return NextResponse.next();

  // nextUrl is Next's view of the public URL (it reads X-Forwarded-Host, which
  // Apache's proxy adds), and Next sends a same-origin redirect as a relative
  // Location, so this never points at the internal port. The query (utm tags
  // and the like) comes along.
  const url = request.nextUrl.clone();
  url.pathname = "/nz";
  return NextResponse.redirect(url, 307);
}
