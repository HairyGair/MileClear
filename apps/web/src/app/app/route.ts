import { NextResponse, type NextRequest } from "next/server";
import { PLAY_LIVE } from "@/data/android";
import { clientIp, isCrawlerIp, playUrlFor, sourceFrom, storeFor } from "@/lib/storeRedirect";
import { appStoreUrl, pageForChannel } from "@/data/appStorePages";

// One link for every store: mileclear.com/app sends an iPhone or iPad to the
// App Store, an Android phone to Google Play, and anything else to the home
// page. Made for the Tyne Tunnel billboard's QR code (1 Oct 2026), where one
// code has to work whichever phone scans it.

// The API on this same server, called directly (not through Apache) so the
// scan endpoint can tell it is us. See apps/api/src/routes/marketing.
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || "http://127.0.0.1:3002";

/** Link previews (WhatsApp, iMessage, Slack, search crawlers) are not scans. */
const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|discord|telegram|curl|wget|python/i;

/** Count the scan; never hold the redirect up for more than 800 ms. */
async function reportScan(store: "ios" | "android" | "other", from: string): Promise<void> {
  try {
    await fetch(`${INTERNAL_API_URL}/marketing/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link: "app", store, from }),
      signal: AbortSignal.timeout(800),
      cache: "no-store",
    });
  } catch {
    // A missed count never costs the driver the redirect.
  }
}

export async function GET(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const store = storeFor(ua);
  // One link per channel: mileclear.com/app?from=press, ?from=flex-group...
  // The billboard QR predates this and has no ?from.
  const params = request.nextUrl.searchParams;
  const from = sourceFrom(params.get("from"), ua, params.get("fbclid"));
  // Not counted: link previews and crawlers by user agent, and Meta's, Google's
  // and Bing's own servers by address (they pose as ordinary phones).
  const ip = clientIp(request.headers.get("x-forwarded-for"));
  if (!BOT_UA.test(ua) && !isCrawlerIp(ip)) await reportScan(store, from);
  const target =
    store === "ios"
      ? // The channel picks a custom product page: ?from=flex-group opens the
        // delivery drivers page, ?page=employee forces one (Oct 2026).
        appStoreUrl(pageForChannel(from, params.get("page")))
      : store === "android" && PLAY_LIVE
        ? playUrlFor(from)
        : "https://mileclear.com/"; // absolute: behind the proxy request.url is localhost
  const res = NextResponse.redirect(target, 302);
  // The answer depends on the phone, so no cache may reuse it for another.
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "User-Agent");
  return res;
}
