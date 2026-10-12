import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import PracticeClientLayout from "./PracticeClientLayout";
import "../dashboard/tokens.css";
import "../../components/dashboard/kit/kit.css";
import "../../components/dashboard/shell/shell.css";
import "./practice.css";

// The practice portal sits outside /dashboard on purpose, like the Milesheet
// portal: that shell is built for one sole trader. Same kit and tokens.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--mc-font",
});

export const metadata: Metadata = {
  title: { absolute: "MileClear for practices" },
  robots: { index: false, follow: false },
};

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={jakarta.variable}>
      <PracticeClientLayout>{children}</PracticeClientLayout>
    </div>
  );
}
