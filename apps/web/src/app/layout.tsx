import type { Metadata } from "next";
import { Sora, Outfit } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MileClear — Track every mile. Keep every penny.",
  description:
    "The mileage tracker that actually works. Built for gig drivers, delivery riders, and anyone who drives for a living. Free to use, offline-first, HMRC ready.",
  keywords: [
    "mileage tracker",
    "gig driver",
    "HMRC mileage",
    "delivery driver",
    "tax deduction",
    "mileage log",
    "self assessment",
    "uber driver",
    "deliveroo driver",
  ],
  openGraph: {
    title: "MileClear — Track every mile. Keep every penny.",
    description:
      "The mileage tracker that actually works. Built for gig drivers, delivery riders, and anyone who drives for a living.",
    type: "website",
    url: "https://mileclear.com",
    siteName: "MileClear",
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear — Track every mile. Keep every penny.",
    description:
      "The mileage tracker that actually works. Built for gig drivers, delivery riders, and anyone who drives for a living.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sora.variable} ${outfit.variable}`}>
      <body>{children}</body>
    </html>
  );
}
