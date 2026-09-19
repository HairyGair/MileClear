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
    description: "Free, unlimited mileage tracking for UK drivers, on Android.",
    url: "https://mileclear.com/android",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear for Android",
    description: "Free, unlimited mileage tracking for UK drivers, on Android.",
    images: ["/branding/og-image.png"],
  },
};

const latest = ANDROID_RELEASE_NOTES[0];

const points = [
  {
    title: "Unlimited tracking, free",
    text: "No monthly cap on drives, no trial and no card. MileIQ stops at 40 drives a month unless you pay.",
  },
  {
    title: "It records while the app is closed",
    text: "Put the phone in your pocket and drive. MileClear notices the drive, records the route, and saves it when you stop.",
  },
  {
    title: "HMRC-ready numbers",
    text: "Business miles are priced at the approved rates for 2026-27: 55p a mile to 10,000, then 25p. Your deduction adds up as you drive.",
  },
  {
    title: "One account across phones",
    text: "Sign in on Android and everything you recorded on an iPhone is already there, along with the web dashboard.",
  },
];

export default function AndroidPage() {
  return (
    <>
      <Navbar />
      <BreadcrumbsJsonLd crumbs={[{ name: "Android", path: "/android" }]} />

      <main className="updates">
        <div className="container">
          <header className="updates__header">
            <p className="label">Android</p>
            <h1 className="updates__heading">MileClear for Android</h1>
            <p className="updates__sub">
              {PLAY_LIVE
                ? "MileClear is on Google Play in the UK. Same app as on iPhone: free, unlimited tracking, one account, and your trips follow you between phones."
                : "The Android app is finished, and its public release is with Google now. It appears on Google Play as soon as they approve it."}
            </p>
            <StoreButtons align="center" className="updates__store-btns" />
            {latest && (
              <p className="updates__meta">
                Current build v{latest.version}
                {latest.build ? ` (${latest.build})` : ""}, {latest.date} &middot;{" "}
                <Link href="/android-releases" className="updates__inline-link">
                  Android release notes
                </Link>
              </p>
            )}
          </header>

          <div className="updates__content">
            <ul className="android-grid" aria-label="What MileClear does on Android">
              {points.map((p) => (
                <li key={p.title} className="android-card">
                  <h2 className="android-card__title">{p.title}</h2>
                  <p className="android-card__text">{p.text}</p>
                </li>
              ))}
            </ul>

            {latest && (
              <article className="release-card android-section">
                <header className="release-card__head">
                  <h2 className="release-card__version">
                    In this build
                    <span className="release-card__build">
                      {" "}
                      v{latest.version}
                      {latest.build ? ` (${latest.build})` : ""}
                    </span>
                  </h2>
                  <time className="release-card__date" dateTime={latest.date}>
                    {latest.date}
                  </time>
                </header>
                <ul className="release-card__items" aria-label={`Changes in v${latest.version}`}>
                  {latest.items.slice(0, 6).map((item, i) => (
                    <li key={i} className="release-card__item">
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/android-releases" className="release-card__cta">
                  Every Android build &rarr;
                </Link>
              </article>
            )}

            <article className="release-card android-section">
              <h2 className="release-card__version">Tested it for us?</h2>
              <p className="android-card__text" style={{ marginTop: "0.75rem" }}>
                Thank you. Keep the app you have: it updates from Google Play like any other, and you
                do not need to install it again. Your Pro stays free for six months from the public
                release, as promised.
              </p>
            </article>

            <p className="updates__meta updates__meta--left">
              Something not working? Email{" "}
              <a href="mailto:support@mileclear.com" className="updates__inline-link">
                support@mileclear.com
              </a>{" "}
              with your phone model and we will look at what your phone recorded.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
