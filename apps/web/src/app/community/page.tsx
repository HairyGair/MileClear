import type { Metadata } from "next";
import CommunityView from "./CommunityView";
import { fetchCommunityMonthly, monthLabel, summarySentence } from "./data";

// Hourly ISR: the latest month changes once a month, and the API caches each
// finished month for a day. The page still prerenders for crawlers.
export const dynamic = "force-dynamic";

const URL = "https://mileclear.com/community";
const FALLBACK = "What the MileClear community drove each month: drivers, miles, trips and the mileage claims those miles are worth.";

export async function generateMetadata(): Promise<Metadata> {
  const result = await fetchCommunityMonthly();
  const summary = result.status === "ok" ? summarySentence(result.data) : null;
  const title = result.status === "ok" && result.data.published
    ? `MileClear community numbers, ${monthLabel(result.data.month)}`
    : "MileClear community numbers";
  const description = summary ?? FALLBACK;
  return {
    title,
    description,
    alternates: { canonical: URL },
    openGraph: {
      title,
      description,
      url: URL,
      images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/branding/og-image.png"],
    },
  };
}

export default async function CommunityPage() {
  const result = await fetchCommunityMonthly();
  return <CommunityView result={result} path="/community" />;
}
