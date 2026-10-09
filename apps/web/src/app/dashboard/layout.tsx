import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import DashboardClientLayout from "./DashboardClientLayout";
import "./tokens.css";
import "../../components/dashboard/kit/kit.css";
import "../../components/dashboard/shell/shell.css";

// Plus Jakarta Sans is the app's font. Loaded here only, so marketing pages
// don't download it. next/font self-hosts it at build time.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--mc-font",
});

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

// viewport-fit=cover lets the tab bar sit on the iPhone home indicator area.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#030712",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={jakarta.variable}>
      <DashboardClientLayout>{children}</DashboardClientLayout>
    </div>
  );
}
