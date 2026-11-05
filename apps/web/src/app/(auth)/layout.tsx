import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../dashboard/dashboard.css";
import "./signin.css";

export const metadata: Metadata = {
  // A template, not a plain string: a plain title here would stop the
  // " | MileClear" suffix reaching the create account, reset and verify titles.
  title: { default: "Sign In", template: "%s | MileClear" },
  robots: {
    index: false,
    follow: false,
  },
};

// The account pages use the app's font, like the dashboard they lead to.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--mc-font",
});

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={jakarta.variable}>{children}</div>;
}
