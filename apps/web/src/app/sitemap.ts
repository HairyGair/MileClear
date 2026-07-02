import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/data/posts";

const BASE_URL = "https://mileclear.com";

function parsePostDate(date: string): Date {
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date("2026-04-13") },
    { url: `${BASE_URL}/features`, lastModified: new Date("2026-04-13") },
    { url: `${BASE_URL}/pricing`, lastModified: new Date("2026-04-13") },
    { url: `${BASE_URL}/faq`, lastModified: new Date("2026-04-13") },
    { url: `${BASE_URL}/about`, lastModified: new Date("2026-04-13") },
    { url: `${BASE_URL}/case-study`, lastModified: new Date("2026-06-20") },
    { url: `${BASE_URL}/best-mileage-tracker-app-uk`, lastModified: new Date("2026-07-02") },
    { url: `${BASE_URL}/mileclear-vs-mileiq`, lastModified: new Date("2026-07-02") },
    { url: `${BASE_URL}/mileiq-alternative-uk`, lastModified: new Date("2026-06-08") },
    { url: `${BASE_URL}/driversnote-alternative`, lastModified: new Date("2026-06-08") },
    { url: `${BASE_URL}/mileage-tracker-uk`, lastModified: new Date("2026-05-19") },
    { url: `${BASE_URL}/free-mileage-tracker-uk`, lastModified: new Date("2026-05-19") },
    { url: `${BASE_URL}/self-employed-mileage-tracker`, lastModified: new Date("2026-05-19") },
    { url: `${BASE_URL}/uber-mileage-tracker`, lastModified: new Date("2026-04-25") },
    { url: `${BASE_URL}/deliveroo-mileage-tracker`, lastModified: new Date("2026-04-25") },
    { url: `${BASE_URL}/amazon-flex-mileage-tracker`, lastModified: new Date("2026-04-25") },
    { url: `${BASE_URL}/just-eat-mileage-tracker`, lastModified: new Date("2026-04-25") },
    { url: `${BASE_URL}/dpd-mileage-tracker`, lastModified: new Date("2026-04-25") },
    { url: `${BASE_URL}/evri-mileage-tracker`, lastModified: new Date("2026-04-25") },
    { url: `${BASE_URL}/delivery-driver-mileage-tracker`, lastModified: new Date("2026-04-29") },
    { url: `${BASE_URL}/employee-mileage-tracker`, lastModified: new Date("2026-04-29") },
    { url: `${BASE_URL}/hmrc-mileage-rates`, lastModified: new Date("2026-06-08") },
    { url: `${BASE_URL}/ev-tax-relief`, lastModified: new Date("2026-06-14") },
    { url: `${BASE_URL}/business-mileage-guide`, lastModified: new Date("2026-04-21") },
    { url: `${BASE_URL}/what-counts-as-business-mileage`, lastModified: new Date("2026-04-21") },
    { url: `${BASE_URL}/mtd-itsa-software-for-sole-traders`, lastModified: new Date("2026-05-09") },
    { url: `${BASE_URL}/updates`, lastModified: new Date("2026-04-26T20:30:00Z") },
    { url: `${BASE_URL}/releases`, lastModified: new Date("2026-06-29") },
    { url: `${BASE_URL}/support`, lastModified: new Date("2026-03-25") },
    { url: `${BASE_URL}/design`, lastModified: new Date("2026-04-21") },
    { url: `${BASE_URL}/privacy`, lastModified: new Date("2026-03-13") },
    { url: `${BASE_URL}/terms`, lastModified: new Date("2026-03-13") },
  ];

  const postRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${BASE_URL}/updates/${post.slug}`,
    lastModified: parsePostDate(post.date),
  }));

  return [...staticRoutes, ...postRoutes];
}
