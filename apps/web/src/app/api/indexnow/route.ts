import { NextResponse } from "next/server";

const KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const HOST = "mileclear.com";

export async function POST(request: Request) {
  const { urls } = await request.json();
  if (!urls || !Array.isArray(urls)) {
    return NextResponse.json({ error: "urls array required" }, { status: 400 });
  }

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/indexnow-key.txt`,
      urlList: urls,
    }),
  });

  return NextResponse.json({ status: res.status, ok: res.ok });
}
