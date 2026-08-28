import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { ANDROID_RELEASE_NOTES } from "@mileclear/shared";
import { PLAY_STORE_URL, PLAY_TEST_JOIN_URL } from "@/data/android";
import "../updates.css";

export const metadata: Metadata = {
  title: "MileClear for Android",
  description:
    "MileClear for Android is in closed testing on Google Play. How to join the test, install the app, and what to expect.",
  alternates: { canonical: "https://mileclear.com/android" },
  openGraph: {
    title: "MileClear for Android | closed beta",
    description:
      "How to join the Android closed test on Google Play and install MileClear.",
    url: "https://mileclear.com/android",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear for Android | closed beta",
    description: "How to join the Android closed test on Google Play.",
    images: ["/branding/og-image.png"],
  },
};

const latest = ANDROID_RELEASE_NOTES[0];

const steps = [
  {
    title: "Leave your email",
    body: (
      <>
        Google only lets people we have listed into a closed test, so start by
        leaving the Gmail address your phone is signed in with on the{" "}
        <Link href="/#early-access" className="updates__inline-link">
          Android invite form
        </Link>
        . We add new testers most days.
      </>
    ),
  },
  {
    title: "Join the test on your phone",
    body: (
      <>
        Once you are on the list, open{" "}
        <a href={PLAY_TEST_JOIN_URL} className="updates__inline-link" rel="noopener noreferrer">
          the join link
        </a>{" "}
        on your Android phone, signed in with the same Google account, and tap
        <strong> Become a tester</strong>. If Google says you are not eligible,
        the email is not on the list yet, or it is a different account from the
        one you gave us.
      </>
    ),
  },
  {
    title: "Install from Google Play",
    body: (
      <>
        After joining, the{" "}
        <a href={PLAY_STORE_URL} className="updates__inline-link" rel="noopener noreferrer">
          Google Play listing
        </a>{" "}
        opens like any other app. It shows &ldquo;not found&rdquo; until step 2 is
        done; that is Google, not a broken link. Sign in with the same MileClear
        account you use anywhere else and your trips are already there.
      </>
    ),
  },
];

export default function AndroidPage() {
  return (
    <>
      <Navbar />
      <BreadcrumbsJsonLd crumbs={[{ name: "Android", path: "/android" }]} />

      <main className="updates">
        <header className="updates__header">
          <h1 className="updates__title">MileClear for Android</h1>
          <p className="updates__subtitle">
            The Android app is in closed testing on Google Play ahead of a public
            release. It is the same MileClear as the iPhone app, same account,
            same trips, with automatic tracking, Self Assessment tooling and Pro
            through Google Play Billing.
            {latest && (
              <>
                {" "}Current test build: v{latest.version}
                {latest.build ? ` (${latest.build})` : ""}, {latest.date}.
              </>
            )}
          </p>
        </header>

        <div className="updates__content">
          <ol className="release-list" aria-label="How to join the Android test">
            {steps.map((s, i) => (
              <li key={s.title}>
                <article className="release-card">
                  <header className="release-card__head">
                    <h2 className="release-card__version">
                      {i + 1}. {s.title}
                    </h2>
                  </header>
                  <p className="updates__subtitle" style={{ margin: 0 }}>{s.body}</p>
                </article>
              </li>
            ))}
          </ol>

          <div className="release-card" style={{ marginTop: "1.5rem" }}>
            <header className="release-card__head">
              <h2 className="release-card__version">Already a tester?</h2>
            </header>
            <p className="updates__subtitle" style={{ margin: 0 }}>
              <a href={PLAY_STORE_URL} className="updates__inline-link" rel="noopener noreferrer">
                Open MileClear on Google Play
              </a>{" "}
              to install or update. Build-by-build changes are on the{" "}
              <Link href="/android-releases" className="updates__inline-link">
                Android release notes
              </Link>
              . Found something wrong? Email{" "}
              <a href="mailto:support@mileclear.com" className="updates__inline-link">
                support@mileclear.com
              </a>{" "}
              with your phone model; testers get Pro free while the test runs.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
