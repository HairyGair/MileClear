import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://mileclear.com",
      lastModified: new Date("2026-03-25"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://mileclear.com/updates",
      lastModified: new Date("2026-03-25"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://mileclear.com/support",
      lastModified: new Date("2026-03-25"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://mileclear.com/privacy",
      lastModified: new Date("2026-03-25"),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: "https://mileclear.com/terms",
      lastModified: new Date("2026-03-25"),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
