import { NextResponse, type NextRequest } from "next/server";
import { PLAY_STORE_URL, PLAY_LIVE } from "@/data/android";
import { storeFor } from "@/lib/storeRedirect";

// One link for every store: mileclear.com/app sends an iPhone or iPad to the
// App Store, an Android phone to Google Play, and anything else to the home
// page. Made for the Tyne Tunnel billboard's QR code (1 Oct 2026), where one
// code has to work whichever phone scans it.

const APP_STORE_URL = "https://apps.apple.com/gb/app/mileclear-mileage-tracker-uk/id6759671005";

export function GET(request: NextRequest) {
  const store = storeFor(request.headers.get("user-agent") ?? "");
  const target =
    store === "ios"
      ? APP_STORE_URL
      : store === "android" && PLAY_LIVE
        ? PLAY_STORE_URL
        : "https://mileclear.com/"; // absolute: behind the proxy request.url is localhost
  const res = NextResponse.redirect(target, 302);
  // The answer depends on the phone, so no cache may reuse it for another.
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "User-Agent");
  return res;
}
