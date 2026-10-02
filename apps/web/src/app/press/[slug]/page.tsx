import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { APP_STORE_URL } from "@/components/StoreButtons";
import { PLAY_STORE_URL } from "@/data/android";
import { PRESS_CONTACT_EMAIL, formatPressDate, getPublishedRelease, getPublishedReleases } from "@/data/press";
import { PressBlocks } from "../PressText";
import "../press.css";

// Only published releases exist. Anything else, including a release that is
// written but not yet switched on, is a 404 via notFound() below.
// (dynamicParams = false crashed with NoFallbackError, a 500, while no
// release was published, 2 Oct 2026.)

export function generateStaticParams() {
  return getPublishedReleases().map((r) => ({ slug: r.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const release = getPublishedRelease(slug);
  if (!release) return {};
  const url = `https://mileclear.com/press/${release.slug}`;
  return {
    title: release.title,
    description: release.summary,
    alternates: { canonical: url },
    openGraph: {
      title: release.title,
      description: release.summary,
      type: "article",
      url,
      siteName: "MileClear",
      locale: "en_GB",
      publishedTime: release.date,
      images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
    },
    twitter: {
      card: "summary_large_image",
      title: release.title,
      description: release.summary,
      images: ["/branding/og-image.png"],
    },
  };
}

export default async function PressReleasePage({ params }: Params) {
  const { slug } = await params;
  const release = getPublishedRelease(slug);
  if (!release) notFound();

  const date = formatPressDate(release.date);

  return (
    <>
      <BreadcrumbsJsonLd
        crumbs={[
          { name: "Press", path: "/press" },
          { name: release.title, path: `/press/${release.slug}` },
        ]}
      />
      <Navbar />

      <main className="pr">
        <article className="container pr-release">
          <Link href="/press" className="pr-back">
            &larr; Press
          </Link>

          <header className="pr-release__header">
            <p className="pr-release__kicker">
              <span className="label">Press release</span>
              <time dateTime={release.date}>{date}</time>
            </p>
            <h1 className="pr-release__title">{release.title}</h1>
            <p className="pr-release__standfirst">{release.standfirst}</p>
          </header>

          <div className="pr-release__body">
            <PressBlocks blocks={release.body} dateline={`${release.dateline}, ${date}.`} />
            <p className="pr-release__ends">Ends</p>

            <section className="pr-release__notes" aria-labelledby="pr-notes-title">
              <h2 id="pr-notes-title" className="pr-release__h2">
                Notes to editors
              </h2>
              <PressBlocks blocks={release.notesToEditors} />

              <h3 className="pr-release__h3">Links</h3>
              <ul className="pr-release__list">
                <li>
                  Website: <a className="pr-link" href="https://mileclear.com">mileclear.com</a>
                </li>
                <li>
                  Community numbers: <Link className="pr-link" href="/community">mileclear.com/community</Link>
                </li>
                <li>
                  App Store:{" "}
                  <a className="pr-link" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                    MileClear for iPhone
                  </a>
                </li>
                <li>
                  Google Play:{" "}
                  <a className="pr-link" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
                    MileClear for Android
                  </a>
                </li>
                <li>
                  Press kit: <Link className="pr-link" href="/press#kit">mileclear.com/press</Link>
                </li>
              </ul>

              <h3 className="pr-release__h3">Contact</h3>
              <p className="pr-release__p">
                Anthony Gair, founder.{" "}
                <a className="pr-link" href={`mailto:${PRESS_CONTACT_EMAIL}?subject=Press%20enquiry`}>
                  {PRESS_CONTACT_EMAIL}
                </a>
              </p>
            </section>
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
