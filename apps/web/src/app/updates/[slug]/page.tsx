import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import {
  getAllBlogPosts,
  getBlogPostBySlug,
  CATEGORY_LABELS,
  type BlogPost,
} from "@/data/posts";
import "../../updates.css";

// ----------------------------------------------------------------
// Static generation
// ----------------------------------------------------------------
export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({ slug: post.slug }));
}

// ----------------------------------------------------------------
// Per-page metadata
// ----------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: `https://mileclear.com/updates/${post.slug}`,
    },
    openGraph: {
      title: `${post.title} | MileClear`,
      description: post.excerpt,
      type: "article",
      url: `https://mileclear.com/updates/${post.slug}`,
      siteName: "MileClear",
      locale: "en_GB",
      publishedTime: parsePostDate(post.date),
      authors: [post.author],
      images: [
        {
          url: "/branding/og-image.png",
          width: 1200,
          height: 628,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | MileClear`,
      description: post.excerpt,
      images: ["/branding/og-image.png"],
    },
  };
}

// ----------------------------------------------------------------
// Category helpers
// ----------------------------------------------------------------
function categoryClass(category: BlogPost["category"]): string {
  return `post__category post__category--${category}`;
}

function parsePostDate(date: string): string {
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function buildBlogPostingJsonLd(post: BlogPost) {
  const published = parsePostDate(post.date);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: published,
    dateModified: published,
    author: {
      "@type": "Person",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: "MileClear",
      logo: {
        "@type": "ImageObject",
        url: "https://mileclear.com/branding/logo-120x120.png",
      },
    },
    image: "https://mileclear.com/branding/og-image.png",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://mileclear.com/updates/${post.slug}`,
    },
    articleSection: CATEGORY_LABELS[post.category],
    inLanguage: "en-GB",
  };
}

// ----------------------------------------------------------------
// Page
// ----------------------------------------------------------------
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) notFound();

  const jsonLd = buildBlogPostingJsonLd(post);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />

      <main className="post">
        <div className="post__glow" aria-hidden="true" />

        <div className="container">
          <Link href="/updates" className="post__back">
            <span className="post__back-arrow">&larr;</span>
            All updates
          </Link>

          <article className="post__container">
            {/* Meta row */}
            <div className="post__meta">
              <span className={categoryClass(post.category)}>
                {CATEGORY_LABELS[post.category]}
              </span>
              <time className="post__date" dateTime={post.date}>
                {post.date}
              </time>
              <span className="post__author">by {post.author}</span>
            </div>

            {/* Title */}
            <h1 className="post__title">{post.title}</h1>

            <div className="post__divider" />

            {/* Body — content is trusted, developer-authored HTML */}
            <div
              className="post__body"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* Footer */}
            <footer className="post__footer">
              <Link href="/updates" className="post__footer-back">
                &larr; Back to updates
              </Link>
              <a
                href="https://testflight.apple.com/join/SGrmnaaH"
                className="post__cta"
                target="_blank"
                rel="noopener noreferrer"
              >
                Try MileClear free &rarr;
              </a>
            </footer>
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
