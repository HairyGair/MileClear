import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../dashboard/tokens.css";
import "../../components/dashboard/kit/kit.css";
import "../../components/dashboard/shell/shell.css";
import "../practice/practice.css";

// Landing pages for a practice's join link and emailed invites. Same look as
// the app's consent sheet; no sign-in needed to read them.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--mc-font",
});

export const metadata: Metadata = {
  title: { absolute: "Share with your accountant · MileClear" },
  robots: { index: false, follow: false },
};

export default function PracticePublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={jakarta.variable}>
      <div className="mc-app pc-app">{children}</div>
    </div>
  );
}
