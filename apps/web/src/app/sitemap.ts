import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/data/posts";

const BASE_URL = "https://mileclear.com";

function parsePostDate(date: string): Date {
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date("2026-04-12"),
    },
    {
      url: `${BASE_URL}/updates`,
      lastModified: new Date("2026-04-12"),
    },
    {
      url: `${BASE_URL}/support`,
      lastModified: new Date("2026-03-25"),
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date("2026-03-13"),
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date("2026-03-13"),
    },
  ];

  const postRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${BASE_URL}/updates/${post.slug}`,
    lastModified: parsePostDate(post.date),
  }));

  return [...staticRoutes, ...postRoutes];
}
