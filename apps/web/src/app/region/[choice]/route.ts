import { NextResponse, type NextRequest } from "next/server";
import { REGION_COOKIE, REGION_COOKIE_MAX_AGE } from "@/lib/region/nzHome";

// "Go to the UK site" (/region/uk) and "See MileClear for NZ" (/region/nz):
// remember the choice for a year so the homepage stops (or starts) sending
// this visitor to /nz, then take them there. Relative Location headers, so
// the redirect never depends on the Host header the proxy passes through.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ choice: string }> }) {
  const { choice } = await params;
  if (choice !== "uk" && choice !== "nz") {
    return new NextResponse(null, { status: 307, headers: { Location: "/" } });
  }
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: choice === "nz" ? "/nz" : "/" },
  });
  response.cookies.set(REGION_COOKIE, choice, {
    maxAge: REGION_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
