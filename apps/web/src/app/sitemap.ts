import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://mileclear.com",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://mileclear.com/privacy",
      lastModified: new Date("2026-02-25"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://mileclear.com/terms",
      lastModified: new Date("2026-02-25"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://mileclear.com/support",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
