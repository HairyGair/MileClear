import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { ANDROID_RELEASE_NOTES } from "@mileclear/shared";
import "../updates.css";

export const metadata: Metadata = {
  title: "Android release notes",
  description:
    "What has changed in MileClear for Android, build by build. The Android app is in closed testing on Google Play.",
  alternates: {
    canonical: "https://mileclear.com/android-releases",
  },
  openGraph: {
    title: "Android release notes | MileClear",
    description:
      "What has changed in MileClear for Android, build by build. Currently in closed testing on Google Play.",
    url: "https://mileclear.com/android-releases",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Android release notes | MileClear",
    description: "What has changed in MileClear for Android, build by build.",
    images: ["/branding/og-image.png"],
  },
};

// Same inline **bold** handling as the iOS release notes page.
function renderMarkdownInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

const androidItemList = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "MileClear for Android Release Notes",
  url: "https://mileclear.com/android-releases",
  itemListElement: ANDROID_RELEASE_NOTES.map((r, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: `MileClear for Android v${r.version}${r.build ? ` (${r.build})` : ""}`,
    description: r.items.slice(0, 3).join(" "),
  })),
};

export default function AndroidReleasesPage() {
  return (
    <>
      <Navbar />
      <BreadcrumbsJsonLd
        crumbs={[{ name: "Android release notes", path: "/android-releases" }]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(androidItemList) }}
      />

      <main className="updates">
        <header className="updates__header">
          <h1 className="updates__title">Android release notes</h1>
          <p className="updates__subtitle">
            MileClear for Android is in closed testing on Google Play. It shares
            a codebase and an account with the iPhone app, but not a release
            history, so it has its own notes.{" "}
            <Link href="/releases" className="updates__inline-link">
              Looking for the iPhone release notes?
            </Link>
          </p>
        </header>

        <div className="updates__content">
          <ul className="release-list" aria-label="Android release notes">
            {ANDROID_RELEASE_NOTES.map((note) => (
              <li key={`${note.version}-${note.build ?? ""}`}>
                <article
                  className="release-card"
                  id={`v${note.version}${note.build ? `-${note.build}` : ""}`}
                >
                  <header className="release-card__head">
                    <h2 className="release-card__version">
                      v{note.version}
                      {note.build && (
                        <span className="release-card__build"> ({note.build})</span>
                      )}
                    </h2>
                    {note.label && (
                      <span
                        className={`release-card__badge release-card__badge--${note.label
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {note.label}
                      </span>
                    )}
                    <time className="release-card__date" dateTime={note.date}>
                      {note.date}
                    </time>
                  </header>
                  <ul
                    className="release-card__items"
                    aria-label={`Changes in Android v${note.version}`}
                  >
                    {note.items.map((item, i) => (
                      <li key={i} className="release-card__item">
                        <span className="release-card__item-text">
                          {renderMarkdownInline(item)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ul>

          <p className="updates__subtitle" style={{ marginTop: "2rem" }}>
            Testing is closed while we work through the first round of real
            drives on real hardware. If you drive for a living on an Android
            phone and want in,{" "}
            <Link href="/support" className="updates__inline-link">
              tell us
            </Link>
            .
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
