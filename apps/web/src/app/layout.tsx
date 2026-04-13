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
  metadataBase: new URL("https://mileclear.com"),
  title: {
    default: "MileClear — Track every mile. Keep every penny.",
    template: "%s | MileClear",
  },
  description:
    "The mileage tracker that actually works. Built for gig drivers, delivery riders, and anyone who drives for a living. Free to use, offline-first, HMRC ready.",
  icons: {
    icon: "/branding/logo-120x120.png",
    apple: "/branding/logo-120x120.png",
  },
  alternates: {
    canonical: "https://mileclear.com",
    languages: {
      "en-GB": "https://mileclear.com",
    },
  },
  openGraph: {
    title: "MileClear — Track every mile. Keep every penny.",
    description:
      "The mileage tracker that actually works. Built for gig drivers, delivery riders, and anyone who drives for a living.",
    type: "website",
    url: "https://mileclear.com",
    siteName: "MileClear",
    locale: "en_GB",
    images: [
      {
        url: "/branding/og-image.png",
        width: 1200,
        height: 628,
        alt: "MileClear — Mileage Tracker UK. Download on the App Store.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear — Track every mile. Keep every penny.",
    description:
      "The mileage tracker that actually works. Built for gig drivers, delivery riders, and anyone who drives for a living.",
    images: ["/branding/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "theme-color": "#f5a623",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" className={`${sora.variable} ${outfit.variable}`}>
      <body>{children}</body>
    </html>
  );
}
