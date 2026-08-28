import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import AndroidTesterForm from "@/components/android/AndroidTesterForm";
import { ANDROID_RELEASE_NOTES } from "@mileclear/shared";
import { PLAY_STORE_URL, PLAY_TEST_JOIN_URL } from "@/data/android";
import "../updates.css";

export const metadata: Metadata = {
  title: "MileClear for Android",
  description:
    "MileClear for Android is in closed testing on Google Play. Leave your email to join the test.",
  alternates: { canonical: "https://mileclear.com/android" },
  openGraph: {
    title: "MileClear for Android | closed beta",
    description: "Leave your email to join the Android closed test on Google Play.",
    url: "https://mileclear.com/android",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear for Android | closed beta",
    description: "Leave your email to join the Android closed test on Google Play.",
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
            The Android app is in closed testing on Google Play ahead of a public
            release. Same MileClear as the iPhone app, same account, same trips.
            Testers get Pro free while the test runs.
            {latest && (
              <>
                {" "}Current build: v{latest.version}
                {latest.build ? ` (${latest.build})` : ""}, {latest.date}.
              </>
            )}
          </p>
        </header>

        <div className="updates__content">
          <div className="release-card">
            <h2 className="release-card__version">Want to test it?</h2>
            <p className="updates__subtitle" style={{ margin: "0.5rem 0 0" }}>
              Google only lets listed accounts into a closed test, so leave the
              Gmail address your Android phone uses and we&apos;ll add you.
            </p>
            <AndroidTesterForm />
          </div>

          <div className="release-card" style={{ marginTop: "1.5rem" }}>
            <h2 className="release-card__version">Already added?</h2>
            <p className="updates__subtitle" style={{ margin: "0.5rem 0 0" }}>
              On your phone, signed in with that Google account, open{" "}
              <a href={PLAY_TEST_JOIN_URL} className="updates__inline-link" rel="noopener noreferrer">
                the join link
              </a>{" "}
              and tap <strong>Become a tester</strong>, then install from{" "}
              <a href={PLAY_STORE_URL} className="updates__inline-link" rel="noopener noreferrer">
                Google Play
              </a>
              . &ldquo;Not eligible&rdquo; means the email isn&apos;t on the list
              yet or it&apos;s a different account; &ldquo;not found&rdquo; on the
              Play listing means the join step hasn&apos;t been done.
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
