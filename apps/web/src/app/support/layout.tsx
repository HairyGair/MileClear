import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support & Help Centre",
  description:
    "Get help with MileClear. Find answers to common questions about mileage tracking, HMRC exports, subscriptions, and account management.",
  alternates: {
    canonical: "https://mileclear.com/support",
  },
};

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
