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
      // Google-Extended controls whether content can feed Gemini / Google AI
      // Overviews. For a free app whose growth depends on install-driving
      // visibility, AI citation beats content protection — so allow it.
      {
        userAgent: "Google-Extended",
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
