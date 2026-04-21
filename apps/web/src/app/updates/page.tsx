import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import TabSwitcher from "@/components/updates/TabSwitcher";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { RELEASE_NOTES, BLOG_POSTS } from "@/data/posts";
import "../updates.css";

export const metadata: Metadata = {
  title: "Updates",
  description:
    "MileClear release notes and the development blog. Follow the latest improvements to the app, engineering deep-dives, and guides for UK drivers.",
  alternates: {
    canonical: "https://mileclear.com/updates",
  },
  openGraph: {
    title: "Updates | MileClear",
    description:
      "Release notes and the development blog. Follow the latest improvements to the MileClear mileage tracker.",
    url: "https://mileclear.com/updates",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Updates | MileClear",
    description:
      "Release notes and the development blog. Follow the latest improvements to the MileClear mileage tracker.",
    images: ["/branding/og-image.png"],
  },
};

const updatesBlogSchema = {
  "@context": "https://schema.org",
  "@type": "Blog",
  name: "MileClear Updates",
  url: "https://mileclear.com/updates",
  description:
    "Release notes and the development blog for the MileClear UK mileage tracker.",
  blogPost: BLOG_POSTS.map((p) => ({
    "@type": "BlogPosting",
    headline: p.title,
    description: p.excerpt,
    datePublished: p.date,
    author: { "@type": "Person", name: p.author },
    url: `https://mileclear.com/updates/${p.slug}`,
  })),
};

const releasesItemList = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "MileClear Release Notes",
  itemListElement: RELEASE_NOTES.map((r, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: `MileClear v${r.version}`,
    description: r.items.join(" "),
  })),
};

export default function UpdatesPage() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "Updates", path: "/updates" }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(updatesBlogSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(releasesItemList) }}
      />
      <Navbar />

      <main className="updates">
        <div className="updates__glow" aria-hidden="true" />

        <div className="container">
          <header className="updates__header">
            <span className="label">What&apos;s New</span>
            <h1 className="updates__heading">Release Notes &amp; Driver Guides</h1>
            <p className="updates__sub">
              Release notes, engineering write-ups, and guides for UK drivers.
            </p>
          </header>

          <TabSwitcher defaultTab="releases" />
        </div>
      </main>

      <Footer />
    </>
  );
}
