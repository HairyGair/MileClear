import type { Metadata } from "next";

// The URL carries the approval token: never index it, never send it on as
// a Referer.
export const metadata: Metadata = {
  title: "Approve mileage",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function MilesheetApproveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
