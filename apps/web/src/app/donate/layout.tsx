import type { Metadata } from "next";

// The donate pages are client components, so their metadata lives here.
// Without it they inherited the homepage title and canonical.
export const metadata: Metadata = {
  title: { absolute: "Buy MileClear a Coffee" },
  description:
    "Mileage tracking in MileClear is free for everyone. If the app has saved you time or money, you can chip in towards keeping it going here.",
  alternates: { canonical: "https://mileclear.com/donate" },
};

export default function DonateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
