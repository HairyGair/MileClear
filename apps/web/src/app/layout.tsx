import type { Metadata } from "next";
import { Sora, Outfit } from "next/font/google";
import "./globals.css";
import ReleaseBanner from "@/components/landing/ReleaseBanner";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import CookieConsent from "@/components/analytics/CookieConsent";

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
    default: "Mileage Tracker UK - Free HMRC-Ready App for Self-Employed | MileClear",
    template: "%s | MileClear",
  },
  description:
    "Free mileage tracker UK app. Auto-track every business mile, generate HMRC-ready self-assessment exports, and keep every penny you're owed. Built for self-employed drivers, gig workers, and delivery riders.",
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
    title: "Mileage Tracker UK - Free HMRC-Ready App | MileClear",
    description:
      "Free mileage tracker UK app. Auto-track every business mile, generate HMRC self-assessment exports, keep every penny you're owed.",
    type: "website",
    url: "https://mileclear.com",
    siteName: "MileClear",
    locale: "en_GB",
    images: [
      {
        url: "/branding/og-image.png",
        width: 1200,
        height: 628,
        alt: "MileClear - Mileage Tracker UK. Download on the App Store.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mileage Tracker UK - Free HMRC-Ready App | MileClear",
    description:
      "Free mileage tracker UK app. Auto-track every business mile, generate HMRC self-assessment exports, keep every penny you're owed.",
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
  // Set NEXT_PUBLIC_GA_ID (a G-XXXXXXXX measurement ID) to enable analytics.
  // Unset = no GA, no cookie banner - a complete no-op.
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en-GB" className={`${sora.variable} ${outfit.variable}`}>
      <body>
        {/* Runs before the rest of the page is parsed, so there is no flash of
            visible-then-hidden content. It does two jobs:
            1. Marks the document as JavaScript-capable, which is what switches
               the scroll reveal on. Without it every .reveal stays visible, so
               a no-JS reader still gets the whole page. The watchdog undoes the
               mark if the app never hydrates, so a failed bundle cannot leave
               the page blank below the hero.
            2. Labels the first <main> so the skip link below has a target. The
               page components own that element and do not set an id. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;d.classList.add("js-reveal");setTimeout(function(){if(!d.hasAttribute("data-reveal-ready")){d.classList.remove("js-reveal");}},3000);function tag(){var m=document.querySelector("main");if(m&&!m.id){m.id="main-content";m.setAttribute("tabindex","-1");}}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",tag);}else{tag();}})();`,
          }}
        />
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <ReleaseBanner />
        {children}
        {gaId && (
          <>
            <GoogleAnalytics gaId={gaId} />
            <CookieConsent />
          </>
        )}
      </body>
    </html>
  );
}
