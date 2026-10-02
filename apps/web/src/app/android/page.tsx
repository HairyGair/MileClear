import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import StoreButtons from "@/components/StoreButtons";
import AndroidNotifyForm from "@/components/android/AndroidNotifyForm";
import { ANDROID_RELEASE_NOTES } from "@mileclear/shared";
import { PLAY_LIVE, PLAY_STORE_URL } from "@/data/android";
import "../updates.css";

const PAGE_URL = "https://mileclear.com/android";

export const metadata: Metadata = {
  title: {
    absolute: "Mileage Tracker App for Android (UK): Free and Automatic | MileClear",
  },
  description: PLAY_LIVE
    ? "MileClear is a free mileage tracker app for Android, on Google Play in the UK. Automatic trip tracking with no monthly drive cap, the approved HMRC rates, and the same account as the iPhone app."
    : "MileClear for Android is finished and waiting on Google's approval to appear on Google Play.",
  keywords: [
    "mileage tracker app android",
    "best free mileage tracker app for android",
    "free mileage tracker android uk",
    "android mileage tracker",
    "automatic mileage tracker android",
    "mileclear android",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Mileage Tracker App for Android (UK) | MileClear",
    description: "Free, automatic mileage tracking for UK drivers on Android, on Google Play.",
    url: PAGE_URL,
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mileage Tracker App for Android (UK) | MileClear",
    description: "Free, automatic mileage tracking for UK drivers on Android, on Google Play.",
    images: ["/branding/og-image.png"],
  },
};

const CTA_HREF = "/app?from=seo-android";


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
    title: "The approved rates, worked out for you",
    text: "Business miles are priced at the rate for the tax year each trip falls in: 55p a mile up to 10,000 from 6 April 2026, then 25p. Your deduction adds up as you drive.",
  },
  {
    title: "One account across phones",
    text: "Sign in on Android and everything you recorded on an iPhone is already there, along with the web dashboard.",
  },
];

const sameAsIphone = [
  "Automatic trip detection in the background, plus Start Trip when you want to record by hand",
  "Work or personal for every trip, with suggestions from routes you have marked before",
  "Saved places such as Home and the depot, which name your stops",
  "Shifts, earnings by platform, expenses and fuel logs",
  "Mileage worked out at the approved rate for each tax year",
  "Add a missed trip from its start and end address, with the distance from road routing",
  "Pro through Google Play: PDF and CSV exports, schedule rules and business insights",
  "The web dashboard at mileclear.com, with the same account",
];

const setupSteps = [
  {
    title: "Location: Allow all the time",
    text: "Settings, Apps, MileClear, Permissions, Location. Choose Allow all the time and switch on Use precise location. With \"Allow only while using the app\", trips only record while MileClear is open on screen.",
  },
  {
    title: "Physical activity: Allow",
    text: "Settings, Apps, MileClear, Permissions, Physical activity. This is how the phone tells MileClear you are in a vehicle, so it spots the start of a drive sooner. MileClear uses it only to start and stop recording.",
  },
  {
    title: "Battery: Unrestricted",
    text: "Settings, Apps, MileClear, Battery, Unrestricted. On \"Optimised\", Android can pause MileClear when the screen is off and drives go unrecorded. MileClear shows a prompt with the steps if it spots this.",
  },
  {
    title: "Your phone maker's sleeping-apps list",
    text: "On Samsung, look under Battery, Background usage limits, and make sure MileClear is not in Sleeping apps or Deep sleeping apps. Xiaomi, Huawei, Honor, Oppo and OnePlus have similar auto-start or app launch settings.",
  },
  {
    title: "Notifications: Allow",
    text: "Android shows a notification while a trip is recording, and MileClear uses notifications to ask whether a trip was work or personal.",
  },
];

const faqs = [
  {
    q: "What is the best free mileage tracker app for Android in the UK?",
    a: "It depends what you need. If you want automatic tracking with no monthly limit, MileClear is free on Google Play and records every drive without a cap, and it works out your mileage at the approved UK rates. MileIQ's free plan stops at 40 drives a month. MileClear's Pro (£4.99 a month) is for exports and extras, not for tracking.",
  },
  {
    q: "Is MileClear free on Android?",
    a: "Yes. Download it free from Google Play. Automatic tracking, classification, the mileage deduction, saved places and fuel prices are free. Pro, bought through Google Play, adds PDF and CSV exports and a few extras, and you can cancel it in Google Play under Payments and subscriptions.",
  },
  {
    q: "Does the Android app work the same as the iPhone app?",
    a: "Very nearly. Tracking, trips, shifts, earnings, expenses and Pro are the same, and one account works on both. The differences come from Android itself: the Lock Screen Live Activity is an iPhone feature, so Android shows a recording notification instead, and Android needs the battery setting changed so the phone does not put MileClear to sleep.",
  },
  {
    q: "Why does my Android phone miss trips?",
    a: "Almost always a setting. Check location is on Allow all the time with precise location, Physical activity is allowed, MileClear's battery use is Unrestricted, and it is not on your phone maker's sleeping-apps list. Battery saver modes can also delay background location. You can add any missed trip by hand from its start and end address.",
  },
  {
    q: "Does automatic tracking drain an Android battery?",
    a: "It uses some, mainly while you drive, because full GPS only runs during a recording. When you are still, MileClear relies on the motion sensor and low-power location. A long day of driving uses a noticeable share, similar to a sat nav, so keep a charger in the vehicle if you drive for a living.",
  },
  {
    q: "Can I move from iPhone to Android, or the other way?",
    a: "Yes. Sign in with the same account and your trips, vehicles and history are there. If you pay for Pro, manage it in the store you bought it from.",
  },
];

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MileClear",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Android",
  downloadUrl: PLAY_STORE_URL,
  url: PAGE_URL,
  description:
    "Free automatic mileage tracker for UK drivers on Android. Records drives in the background with no monthly drive cap and works out business mileage at the approved rates.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "GBP",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function AndroidPage() {
  return (
    <>
      <Navbar />
      <BreadcrumbsJsonLd crumbs={[{ name: "Android", path: "/android" }]} />
      {PLAY_LIVE && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <main className="updates">
        <div className="container">
          <header className="updates__header">
            <p className="label">Android</p>
            <h1 className="updates__heading">Mileage Tracker App for Android</h1>
            <p className="updates__sub">
              {PLAY_LIVE
                ? "MileClear is a free mileage tracker app for Android, on Google Play in the UK. It records your drives on its own with no monthly drive cap, and it is the same app and the same account as on iPhone."
                : "The Android app is finished, and its public release is with Google now. It appears on Google Play as soon as they approve it."}
            </p>
            <StoreButtons align="center" className="updates__store-btns" />
            {PLAY_LIVE && (
              <p className="updates__meta">
                Reading this on your phone?{" "}
                <a href={CTA_HREF} className="updates__inline-link">
                  Get MileClear free
                </a>
              </p>
            )}
            {latest && (
              <p className="updates__meta">
                Current build v{latest.version}
                {latest.build ? ` (${latest.build})` : ""}, {latest.date} &middot;{" "}
                <Link href="/android-releases" className="updates__inline-link">
                  Android release notes
                </Link>{" "}
                &middot; Last updated: October 2026
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

            <article className="release-card android-section">
              <h2 className="release-card__version">What works the same as on iPhone</h2>
              <ul
                className="release-card__items"
                aria-label="Features on Android"
                style={{ marginTop: "1rem", padding: 0 }}
              >
                {sameAsIphone.map((item) => (
                  <li key={item} className="release-card__item">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="android-card__text" style={{ marginTop: "1rem" }}>
                The one visible difference: the Lock Screen Live Activity is an iPhone feature, so
                on Android a recording shows as a notification instead.
              </p>
            </article>

            <article className="release-card android-section">
              <h2 className="release-card__version">Set up automatic tracking on Android</h2>
              <p className="android-card__text" style={{ marginTop: "0.75rem" }}>
                Android lets apps run in the background, but most phone makers add battery
                management that puts apps to sleep. These five settings are the difference between
                a tracker that catches every drive and one that misses them. MileClear asks for
                each one when you set it up.
              </p>
              <ol
                className="release-card__items"
                aria-label="Android setup steps"
                style={{ marginTop: "1rem", padding: 0 }}
              >
                {setupSteps.map((step) => (
                  <li key={step.title} className="release-card__item">
                    <span className="release-card__item-text">
                      <strong>{step.title}.</strong> {step.text}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="android-card__text" style={{ marginTop: "1rem" }}>
                How the detection works, and what to expect on accuracy and battery, is in{" "}
                <Link href="/automatic-mileage-tracker" className="updates__inline-link">
                  the guide to automatic mileage tracking
                </Link>
                .
              </p>
            </article>

            <article className="release-card android-section">
              <h2 className="release-card__version">Android mileage tracker questions</h2>
              {faqs.map((f) => (
                <div key={f.q} style={{ marginTop: "1.25rem" }}>
                  <h3 className="android-card__title">{f.q}</h3>
                  <p className="android-card__text">{f.a}</p>
                </div>
              ))}
            </article>

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

            {!PLAY_LIVE && (
              <article className="release-card android-section">
                <h2 className="release-card__version">Want it the day it lands?</h2>
                <p className="android-card__text" style={{ marginTop: "0.75rem" }}>
                  Leave your email and we will tell you the moment the Play listing opens. If you
                  would rather not wait, say so in your reply and we will add you to the test
                  track, which is the same app.
                </p>
                <AndroidNotifyForm />
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

            {PLAY_LIVE && (
              <div style={{ marginTop: "2rem" }}>
                <StoreButtons align="center" />
              </div>
            )}

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
