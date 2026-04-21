"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getAllReleaseNotes,
  getAllBlogPosts,
  getAllGuides,
  CATEGORY_LABELS,
  GUIDE_CATEGORY_LABELS,
  type BlogPost,
} from "@/data/posts";

type Tab = "releases" | "blog" | "guides";

function categoryClass(category: BlogPost["category"]): string {
  return `blog-card__category blog-card__category--${category}`;
}

export default function TabSwitcher({
  defaultTab = "releases",
}: {
  defaultTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const releaseNotes = getAllReleaseNotes();
  const blogPosts = getAllBlogPosts();
  const guides = getAllGuides();

  return (
    <>
      {/* Tab bar */}
      <div className="updates__tabs">
        <div className="updates__tab-group" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "releases"}
            aria-controls="panel-releases"
            className={`updates__tab${tab === "releases" ? " updates__tab--active" : ""}`}
            onClick={() => setTab("releases")}
          >
            Release Notes
          </button>
          <button
            role="tab"
            aria-selected={tab === "blog"}
            aria-controls="panel-blog"
            className={`updates__tab${tab === "blog" ? " updates__tab--active" : ""}`}
            onClick={() => setTab("blog")}
          >
            Blog
          </button>
          <button
            role="tab"
            aria-selected={tab === "guides"}
            aria-controls="panel-guides"
            className={`updates__tab${tab === "guides" ? " updates__tab--active" : ""}`}
            onClick={() => setTab("guides")}
          >
            Guides
          </button>
        </div>
      </div>

      {/* Release notes panel */}
      <div
        id="panel-releases"
        role="tabpanel"
        hidden={tab !== "releases"}
        className="updates__content"
      >
        <ul className="release-list" aria-label="Release notes">
          {releaseNotes.map((note) => (
            <li key={note.version}>
              <article className="release-card">
                <header className="release-card__head">
                  <h2 className="release-card__version">v{note.version}</h2>
                  {note.label && (
                    <span
                      className={`release-card__badge release-card__badge--${note.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {note.label}
                    </span>
                  )}
                  <time
                    className="release-card__date"
                    dateTime={note.date}
                  >
                    {note.date}
                  </time>
                </header>
                <ul className="release-card__items" aria-label={`Changes in v${note.version}`}>
                  {note.items.map((item, i) => (
                    <li key={i} className="release-card__item">
                      {item}
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

      {/* Blog panel */}
      <div
        id="panel-blog"
        role="tabpanel"
        hidden={tab !== "blog"}
        className="updates__content"
      >
        <ul className="blog-list" aria-label="Blog posts">
          {blogPosts.map((post) => (
            <li key={post.slug}>
              <Link href={`/updates/${post.slug}`} className="blog-card">
                <div className="blog-card__meta">
                  <span className={categoryClass(post.category)}>
                    {CATEGORY_LABELS[post.category]}
                  </span>
                  <time className="blog-card__date" dateTime={post.date}>
                    {post.date}
                  </time>
                  <span className="blog-card__author">by {post.author}</span>
                </div>
                <h2 className="blog-card__title">{post.title}</h2>
                <p className="blog-card__excerpt">{post.excerpt}</p>
                <span className="blog-card__read" aria-hidden="true">
                  Read post{" "}
                  <span className="blog-card__arrow">&rarr;</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Guides panel */}
      <div
        id="panel-guides"
        role="tabpanel"
        hidden={tab !== "guides"}
        className="updates__content"
      >
        <p className="updates__panel-intro">
          Evergreen reference pages for UK drivers. Tax rules, how the HMRC
          rates work, and which trips you can actually claim.
        </p>
        <ul className="blog-list" aria-label="Guides">
          {guides.map((guide) => (
            <li key={guide.slug}>
              <Link href={`/${guide.slug}`} className="blog-card">
                <div className="blog-card__meta">
                  <span className={`blog-card__category blog-card__category--guide`}>
                    {GUIDE_CATEGORY_LABELS[guide.category]}
                  </span>
                  <span className="blog-card__date">{guide.readTime}</span>
                </div>
                <h2 className="blog-card__title">{guide.title}</h2>
                <p className="blog-card__excerpt">{guide.excerpt}</p>
                <span className="blog-card__read" aria-hidden="true">
                  Read guide{" "}
                  <span className="blog-card__arrow">&rarr;</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
