import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support & Help Centre",
  description:
    "Get help with MileClear. Find answers to common questions about mileage tracking, HMRC exports, subscriptions, and account management.",
  alternates: {
    canonical: "https://mileclear.com/support",
  },
  openGraph: {
    title: "Support & Help Centre | MileClear",
    description:
      "Get help with MileClear. FAQs, contact support, and guides for UK drivers.",
    url: "https://mileclear.com/support",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Support & Help Centre | MileClear",
    description:
      "Get help with MileClear. FAQs, contact support, and guides for UK drivers.",
    images: ["/branding/og-image.png"],
  },
};

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
