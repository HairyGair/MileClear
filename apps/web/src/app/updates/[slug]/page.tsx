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
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

// ----------------------------------------------------------------
// Category helpers
// ----------------------------------------------------------------
function categoryClass(category: BlogPost["category"]): string {
  return `post__category post__category--${category}`;
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

  return (
    <>
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
