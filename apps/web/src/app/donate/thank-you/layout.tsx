import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thank You",
  robots: { index: false, follow: true },
};

export default function DonateThankYouLayout({ children }: { children: React.ReactNode }) {
  return children;
}
