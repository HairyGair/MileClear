import { statSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { APP_STORE_URL } from "@/components/StoreButtons";
import { PLAY_STORE_URL } from "@/data/android";
import { PRESS_CONTACT_EMAIL, formatPressDate, getPublishedReleases } from "@/data/press";
import "./press.css";

const URL = "https://mileclear.com/press";
const TITLE = "Press and media";
const DESCRIPTION =
  "News, facts and images for journalists writing about MileClear, the UK mileage tracker for gig, delivery and self-employed drivers. Press contact: support@mileclear.com.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    title: `${TITLE} | MileClear`,
    description: DESCRIPTION,
    url: URL,
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | MileClear`,
    description: DESCRIPTION,
    images: ["/branding/og-image.png"],
  },
};

// ----------------------------------------------------------------
// Press kit
// ----------------------------------------------------------------

const PUBLIC_DIR = join(process.cwd(), "public");

/** File size for a /public path, read at build time so it never goes stale. */
function fileSize(path: string): string {
  try {
    const bytes = statSync(join(PUBLIC_DIR, path)).size;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  } catch {
    return "";
  }
}

interface KitFile {
  label: string;
  href: string;
}

interface KitItem {
  title: string;
  note: string;
  thumb: string;
  thumbW: number;
  thumbH: number;
  /** "portrait" (phone), "square", "wide" (billboard) */
  shape: "portrait" | "square" | "feed" | "wide";
  files: KitFile[];
}

interface KitGroup {
  id: string;
  title: string;
  intro: string;
  items: KitItem[];
}

const T = "/press/thumbs";

const KIT: KitGroup[] = [
  {
    id: "kit-logos",
    title: "Logo and app icon",
    intro: "The app icon and the logo with the MileClear wordmark, on the brand's dark navy (#030712). The transparent versions sit on any background.",
    items: [
      {
        title: "Logo with wordmark",
        note: "On dark navy, 1200 × 1200",
        thumb: `${T}/mileclear-logo-wordmark-dark.jpg`,
        thumbW: 400,
        thumbH: 400,
        shape: "square",
        files: [{ label: "PNG", href: "/press/logo/mileclear-logo-wordmark-dark.png" }],
      },
      {
        title: "App icon",
        note: "On dark navy, 1024 × 1024",
        thumb: `${T}/mileclear-app-icon.png`,
        thumbW: 240,
        thumbH: 240,
        shape: "square",
        files: [
          { label: "PNG", href: "/press/logo/mileclear-app-icon-1024.png" },
          { label: "SVG", href: "/press/logo/mileclear-app-icon.svg" },
        ],
      },
      {
        title: "Symbol, transparent",
        note: "Amber on a transparent background",
        thumb: "/press/logo/mileclear-symbol-transparent-1024.png",
        thumbW: 1024,
        thumbH: 1024,
        shape: "square",
        files: [
          { label: "PNG", href: "/press/logo/mileclear-symbol-transparent-1024.png" },
          { label: "SVG", href: "/press/logo/mileclear-symbol-transparent.svg" },
        ],
      },
    ],
  },
  {
    id: "kit-screenshots",
    title: "App screenshots",
    intro: "Screens from the iPhone app, 1320 × 2868. They use a demonstration account, not a real driver's data.",
    items: [
      ["mileclear-iphone-1-dashboard", "Dashboard", "The running total for the tax year"],
      ["mileclear-iphone-2-trips", "Trips", "Each journey, sorted as business or personal"],
      ["mileclear-iphone-3-start-trip", "Start a trip", "Recording a journey by hand"],
      ["mileclear-iphone-4-split-trip", "Split a trip", "One drive with several stops, split into separate trips"],
      ["mileclear-iphone-5-self-assessment", "Self Assessment walkthrough", "Income by platform, step 2 of 6"],
      ["mileclear-iphone-6-how-you-compare", "How you compare", "Anonymous comparison with other drivers"],
    ].map(([file, title, note]) => ({
      title,
      note,
      thumb: `${T}/${file}.jpg`,
      thumbW: 294,
      thumbH: 640,
      shape: "portrait" as const,
      files: [{ label: "PNG", href: `/press/screenshots/${file}.png` }],
    })),
  },
  {
    id: "kit-campaign",
    title: "October 2026 campaign",
    intro: "The six campaign images, 1080 × 1350. Phone screens in the artwork use example values.",
    items: [
      ["01-hero", "Driving for work?"],
      ["02-fuel", "Cheapest fuel alert"],
      ["03-drivers-near-you", "Drivers near you"],
      ["04-community", "Community numbers"],
      ["05-ready-for-31-january", "Ready for 31 January"],
      ["06-road-alerts", "Road alerts"],
    ].map(([file, title]) => ({
      title,
      note: "Feed format",
      thumb: `${T}/mileclear-campaign-${file}-feed.jpg`,
      thumbW: 512,
      thumbH: 640,
      shape: "feed" as const,
      files: [{ label: "PNG", href: `/press/campaign/mileclear-campaign-${file}-feed.png` }],
    })),
  },
  {
    id: "kit-billboard",
    title: "Tyne Tunnel billboard",
    intro: "The design shown on the billboard at the Tyne Tunnel from 1 to 8 October 2026, 3840 × 2160.",
    items: [
      {
        title: "Billboard design",
        note: "Tyne Tunnel, 1 to 8 October 2026",
        thumb: `${T}/mileclear-tyne-tunnel-billboard.jpg`,
        thumbW: 1200,
        thumbH: 675,
        shape: "wide",
        files: [{ label: "JPG", href: "/press/billboard/mileclear-tyne-tunnel-billboard.jpg" }],
      },
    ],
  },
];

const ZIP_HREF = "/press/mileclear-press-kit.zip";
const PHOTO_HREF = "/press/founder/anthony-gair-founder-mileclear.jpg";

// ----------------------------------------------------------------
// Fact sheet
// ----------------------------------------------------------------

const FEATURES = [
  "Records drives automatically in the background, on iPhone and Android",
  "Sorts each trip as business or personal",
  "Works out the mileage claim at the HMRC mileage rate for the tax year each trip falls in (45p a mile before 6 April 2026, 55p from then, for the first 10,000 business miles in a tax year, then 25p)",
  "Keeps earnings and expenses alongside the miles",
  "A Self Assessment walkthrough that shows which figures go in which box; the driver or their accountant files the return",
  "Exports of trips and totals as CSV and PDF (Pro)",
];

export default function PressPage() {
  const releases = getPublishedReleases();

  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "Press", path: "/press" }]} />
      <Navbar />

      <main className="pr">
        <div className="container pr__inner">
          {/* ---- Intro + contact ---- */}
          <section className="pr-hero" aria-labelledby="pr-title">
            <span className="label">Press</span>
            <h1 id="pr-title" className="pr-title">
              Press and media
            </h1>
            <p className="pr-hero__sub">
              News, facts and images for anyone writing about MileClear. For an interview, figures or
              anything not on this page, email us and we&apos;ll get back to you.
            </p>
            <div className="pr-contact">
              <div>
                <p className="pr-contact__label">Press contact</p>
                <a className="pr-contact__email" href={`mailto:${PRESS_CONTACT_EMAIL}?subject=Press%20enquiry`}>
                  {PRESS_CONTACT_EMAIL}
                </a>
              </div>
              <a className="pr-btn pr-btn--primary" href={ZIP_HREF} download>
                Download press kit
                <span className="pr-btn__meta">.zip, {fileSize(ZIP_HREF)}</span>
              </a>
            </div>
            <nav className="pr-jump" aria-label="On this page">
              <a href="#releases">Press releases</a>
              <a href="#facts">Fact sheet</a>
              <a href="#founder">Founder</a>
              <a href="#kit">Press kit</a>
            </nav>
          </section>

          {/* ---- Releases ---- */}
          <section id="releases" className="pr-section" aria-labelledby="pr-releases-title">
            <h2 id="pr-releases-title" className="pr-section__title">
              Press releases
            </h2>
            {releases.length === 0 ? (
              <div className="pr-empty">
                <p className="pr-empty__title">No releases yet.</p>
                <p className="pr-empty__text">
                  The first one will appear here. In the meantime, our numbers are published every month on
                  the <Link href="/community" className="pr-link">community numbers</Link> page.
                </p>
              </div>
            ) : (
              <ul className="pr-releases">
                {releases.map((r) => (
                  <li key={r.slug} className="pr-releases__item">
                    <time className="pr-releases__date" dateTime={r.date}>
                      {formatPressDate(r.date)}
                    </time>
                    <h3 className="pr-releases__title">
                      <Link href={`/press/${r.slug}`}>{r.title}</Link>
                    </h3>
                    <p className="pr-releases__summary">{r.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- Fact sheet ---- */}
          <section id="facts" className="pr-section" aria-labelledby="pr-facts-title">
            <h2 id="pr-facts-title" className="pr-section__title">
              Fact sheet
            </h2>
            <div className="pr-panel">
              <dl className="pr-facts">
                <div className="pr-facts__row">
                  <dt>What it is</dt>
                  <dd>
                    A UK mileage tracker for gig, delivery and self-employed drivers, and for everyday drivers who
                    want to keep track of their driving.
                  </dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Available on</dt>
                  <dd>
                    iPhone (<a className="pr-link" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">App Store</a>)
                    and Android (<a className="pr-link" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Google Play</a>, UK),
                    with a web dashboard at mileclear.com. One account works on all of them.
                  </dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Price</dt>
                  <dd>
                    Free to download and use for tracking. An optional Pro plan is £4.99 a month; the iPhone app also
                    offers a yearly plan. <Link className="pr-link" href="/pricing">What&apos;s in Pro</Link>
                  </dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Launched</dt>
                  <dd>On the App Store in March 2026, and on Google Play in September 2026.</dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Based in</dt>
                  <dd>Sunderland, North East England</dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Founder</dt>
                  <dd>Anthony Gair</dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Operated by</dt>
                  <dd>Anthony Gair, trading as MileClear</dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Website</dt>
                  <dd>
                    <a className="pr-link" href="https://mileclear.com">mileclear.com</a>
                  </dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Numbers</dt>
                  <dd>
                    Drivers, miles and trips are published each month on the{" "}
                    <Link className="pr-link" href="/community">community numbers</Link> page. Please quote the
                    latest figures from there.
                  </dd>
                </div>
                <div className="pr-facts__row">
                  <dt>Press contact</dt>
                  <dd>
                    <a className="pr-link" href={`mailto:${PRESS_CONTACT_EMAIL}`}>{PRESS_CONTACT_EMAIL}</a>
                  </dd>
                </div>
              </dl>

              <h3 className="pr-panel__subtitle">What it does</h3>
              <ul className="pr-features">
                {FEATURES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="pr-panel__note">
                MileClear does not file tax returns. It keeps the record a driver or their accountant needs.
              </p>
            </div>
          </section>

          {/* ---- Founder ---- */}
          <section id="founder" className="pr-section" aria-labelledby="pr-founder-title">
            <h2 id="pr-founder-title" className="pr-section__title">
              Founder
            </h2>
            <div className="pr-founder">
              <figure className="pr-founder__photo">
                <img
                  src="/press/founder/anthony-gair-founder-mileclear-web.jpg"
                  alt="Anthony Gair, founder of MileClear"
                  width={800}
                  height={640}
                  loading="lazy"
                />
              </figure>
              <div className="pr-founder__body">
                <h3 className="pr-founder__name">Anthony Gair</h3>
                <p className="pr-founder__role">Founder, MileClear</p>
                <p className="pr-founder__bio">
                  Anthony Gair is a software developer from Sunderland. He built MileClear after seeing gig drivers
                  on social media and forums say they couldn&apos;t find a reliable mileage tracker. MileClear is a
                  one-person project: he designs, builds and supports it himself.
                </p>
                <a className="pr-btn pr-btn--ghost" href={PHOTO_HREF} download>
                  Download photo
                  <span className="pr-btn__meta">JPG, 1402 × 1122, {fileSize(PHOTO_HREF)}</span>
                </a>
              </div>
            </div>
          </section>

          {/* ---- Press kit ---- */}
          <section id="kit" className="pr-section" aria-labelledby="pr-kit-title">
            <div className="pr-section__head">
              <h2 id="pr-kit-title" className="pr-section__title">
                Press kit
              </h2>
              <a className="pr-btn pr-btn--primary" href={ZIP_HREF} download>
                Download all
                <span className="pr-btn__meta">.zip, {fileSize(ZIP_HREF)}</span>
              </a>
            </div>
            <p className="pr-section__intro">
              Free to use in coverage of MileClear. Please don&apos;t alter the logo or the artwork.
            </p>

            {KIT.map((group) => (
              <section key={group.id} className="pr-kit" aria-labelledby={group.id}>
                <h3 id={group.id} className="pr-kit__title">
                  {group.title}
                </h3>
                <p className="pr-kit__intro">{group.intro}</p>
                <ul className={`pr-kit__grid pr-kit__grid--${group.items[0].shape}`}>
                  {group.items.map((item) => (
                    <li key={item.title} className="pr-asset">
                      <div className={`pr-asset__frame pr-asset__frame--${item.shape}`}>
                        <img src={item.thumb} alt="" width={item.thumbW} height={item.thumbH} loading="lazy" />
                      </div>
                      <div className="pr-asset__meta">
                        <p className="pr-asset__title">{item.title}</p>
                        <p className="pr-asset__note">{item.note}</p>
                        <p className="pr-asset__files">
                          {item.files.map((f) => (
                            <a
                              key={f.href}
                              href={f.href}
                              download
                              className="pr-asset__dl"
                              aria-label={`Download ${item.title}, ${f.label}, ${fileSize(f.href)}`}
                            >
                              {f.label} <span>{fileSize(f.href)}</span>
                            </a>
                          ))}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
