import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { RELEASE_NOTES } from "@/data/posts";
import "../updates.css";

export const metadata: Metadata = {
  title: "Release notes",
  description:
    "Every MileClear release - what changed, when, and why. Full changelog for the UK mileage and tax tracker.",
  alternates: {
    canonical: "https://mileclear.com/releases",
  },
  openGraph: {
    title: "Release notes | MileClear",
    description: "Every MileClear release - full changelog for the UK mileage and tax tracker.",
    url: "https://mileclear.com/releases",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Release notes | MileClear",
    description: "Every MileClear release - full changelog.",
    images: ["/branding/og-image.png"],
  },
};

// Simple inline markdown-bold rendering. RELEASE_NOTES occasionally uses
// **bold** for emphasis in the email-targeted highlights; render those as
// <strong> rather than printing the asterisks raw.
function renderMarkdownInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

const releasesItemList = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "MileClear Release Notes",
  url: "https://mileclear.com/releases",
  itemListElement: RELEASE_NOTES.map((r, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: `MileClear v${r.version}`,
    description: r.items.slice(0, 3).join(" "),
  })),
};

export default function ReleasesPage() {
  return (
    <>
      <Navbar />
      <BreadcrumbsJsonLd crumbs={[{ name: "Release notes", path: "/releases" }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(releasesItemList) }}
      />

      <main className="updates">
        <header className="updates__header">
          <h1 className="updates__title">Release notes</h1>
          <p className="updates__subtitle">
            What's changed in MileClear, version by version. Looking for
            engineering deep-dives, guides, or news?{" "}
            <Link href="/updates" className="updates__inline-link">
              See the Updates blog.
            </Link>
          </p>
        </header>

        <div className="updates__content">
          <ul className="release-list" aria-label="Release notes">
            {RELEASE_NOTES.map((note) => (
              <li key={note.version}>
                <article className="release-card" id={`v${note.version}`}>
                  <header className="release-card__head">
                    <h2 className="release-card__version">v{note.version}</h2>
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
                    aria-label={`Changes in v${note.version}`}
                  >
                    {note.items.map((item, i) => (
                      <li key={i} className="release-card__item">
                        {renderMarkdownInline(item)}
                      </li>
                    ))}
                  </ul>
                  {note.ctaUrl && (
                    <a
                      href={note.ctaUrl}
                      className="release-card__cta"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {note.ctaLabel || "Try it now"} &rarr;
                    </a>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <Footer />
    </>
  );
}
