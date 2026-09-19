import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import StoreButtons from "@/components/StoreButtons";
import { ANDROID_RELEASE_NOTES } from "@mileclear/shared";
import { PLAY_LIVE } from "@/data/android";
import "../updates.css";

export const metadata: Metadata = {
  title: "MileClear for Android",
  description: PLAY_LIVE
    ? "MileClear is on Google Play. Free, unlimited mileage tracking for UK drivers, with the same account as the iPhone app."
    : "MileClear for Android is finished and waiting on Google's approval to appear on Google Play.",
  alternates: { canonical: "https://mileclear.com/android" },
  openGraph: {
    title: "MileClear for Android",
    description: "Free, unlimited mileage tracking for UK drivers, now on Google Play.",
    url: "https://mileclear.com/android",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear for Android",
    description: "Free, unlimited mileage tracking for UK drivers, now on Google Play.",
    images: ["/branding/og-image.png"],
  },
};

const latest = ANDROID_RELEASE_NOTES[0];

export default function AndroidPage() {
  return (
    <>
      <Navbar />
      <BreadcrumbsJsonLd crumbs={[{ name: "Android", path: "/android" }]} />

      <main className="updates">
        <header className="updates__header">
          <h1 className="updates__title">MileClear for Android</h1>
          <p className="updates__subtitle">
            {PLAY_LIVE ? (
              <>
                MileClear is on Google Play in the UK. It is the same app as on
                iPhone: free, unlimited tracking, the same account and the same
                trips, so you can switch phones without losing anything.
              </>
            ) : (
              <>
                The Android app is finished, and its public release is with
                Google now. It appears on Google Play as soon as they approve it.
                Same app as on iPhone: free, unlimited tracking, one account,
                and your trips follow you between phones.
              </>
            )}
            {latest && (
              <>
                {" "}Current build: v{latest.version}
                {latest.build ? ` (${latest.build})` : ""}, {latest.date}.
              </>
            )}
          </p>
          <StoreButtons align="center" className="updates__store-btns" />
        </header>

        <div className="updates__content">
          <div className="release-card">
            <h2 className="release-card__version">Tested it for us?</h2>
            <p className="updates__subtitle" style={{ margin: "0.5rem 0 0" }}>
              Thank you. Keep the app you have: it updates from Google Play like
              any other, and you do not need to install it again. Your Pro stays
              free for six months from the public release, as promised.
            </p>
          </div>

          <p className="updates__subtitle" style={{ marginTop: "1.5rem" }}>
            <Link href="/android-releases" className="updates__inline-link">
              Android release notes
            </Link>
            {" "}&middot;{" "}
            Problems? Email{" "}
            <a href="mailto:support@mileclear.com" className="updates__inline-link">
              support@mileclear.com
            </a>{" "}
            with your phone model.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
