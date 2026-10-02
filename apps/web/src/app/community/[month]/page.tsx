import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CommunityView from "../CommunityView";
import { MONTH_RE, fetchCommunityMonthly, monthLabel, summarySentence } from "../data";

// One page per finished month, rendered on first request and refreshed hourly.
export const dynamic = "force-dynamic";
export const dynamicParams = true;

export function generateStaticParams(): Array<{ month: string }> {
  return [];
}

type Params = Promise<{ month: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { month } = await params;
  if (!MONTH_RE.test(month)) return { title: "MileClear community numbers" };
  const result = await fetchCommunityMonthly(month);
  const latest = result.status === "ok" && result.data.months[0] === month;
  const url = latest ? "https://mileclear.com/community" : `https://mileclear.com/community/${month}`;
  const title = `MileClear community numbers, ${monthLabel(month)}`;
  const description =
    (result.status === "ok" ? summarySentence(result.data) : null) ??
    `What the MileClear community drove in ${monthLabel(month)}.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
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

export default async function CommunityMonthPage({ params }: { params: Params }) {
  const { month } = await params;
  if (!MONTH_RE.test(month)) notFound();
  const result = await fetchCommunityMonthly(month);
  if (result.status === "missing") notFound();
  return <CommunityView result={result} path={`/community/${month}`} />;
}
