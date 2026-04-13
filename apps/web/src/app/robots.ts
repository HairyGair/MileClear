import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/register"],
      },
      // Allow search AI bots that use results to answer queries
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/register"],
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/register"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/dashboard/", "/login", "/register"],
      },
      // Block training-only crawlers
      {
        userAgent: "CCBot",
        disallow: "/",
      },
      {
        userAgent: "Bytespider",
        disallow: "/",
      },
    ],
    sitemap: "https://mileclear.com/sitemap.xml",
  };
}
