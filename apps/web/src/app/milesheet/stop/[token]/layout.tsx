import type { Metadata } from "next";

// The URL carries the approval token: never index it, never send it on as
// a Referer.
export const metadata: Metadata = {
  title: "Stop Milesheet emails",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function MilesheetStopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
