import { resolve } from "path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Load .env from monorepo root so NEXT_PUBLIC_* vars are available at build time
config({ path: resolve(__dirname, "../../.env") });

// The API origin the browser talks to, so connect-src matches wherever the web
// app is pointed (production, a local API, or the test server).
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "https://api.mileclear.com").origin;
  } catch {
    return "https://api.mileclear.com";
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `pnpm lint` (the repo's eslint.config.mjs, with the react-hooks plugin)
  // is the lint gate, in CI and pre-push. next build's own lint pass uses a
  // config without that plugin and fails on react-hooks disable comments.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@mileclear/shared"],
  async redirects() {
    return [
      // Google crawlers sometimes pick up "£4.99/month" from page copy
      // and try to fetch /month as a URL. Redirect to pricing instead of
      // returning a 404 so the link at least sends people somewhere useful.
      { source: "/month", destination: "/pricing", permanent: true },
      { source: "/year", destination: "/pricing", permanent: true },
      { source: "/monthly", destination: "/pricing", permanent: true },
      { source: "/yearly", destination: "/pricing", permanent: true },
      {
        source: "/updates/whats-new-in-version-1-0-9",
        destination: "/updates/whats-new-in-version-1-0-10",
        permanent: true,
      },
      // The company product became Milesheet and moved out of the sole trader
      // dashboard. Done here rather than with a redirect() page so it is a
      // real server redirect for bookmarks and crawlers, and so /dashboard/team
      // cannot briefly render the sole trader shell on the way past.
      // Google Search Console shows impressions at position 1 for this URL,
      // which has never existed. Send it to the real free-tracker page.
      { source: "/free-mileage-tracking-uk", destination: "/free-mileage-tracker-uk", permanent: true },
      { source: "/teams", destination: "/milesheet", permanent: true },
      { source: "/dashboard/team", destination: "/milesheet/portal", permanent: true },
      { source: "/team/invite/:token", destination: "/milesheet/invite/:token", permanent: true },

      // Dashboard rebuild (Oct 2026). Old driver dashboard URLs keep working
      // because emails and bookmarks point at them. 307 (permanent: false) so
      // nothing is cached by browsers if a destination moves again.
      // The query-matched one must come first.
      // Next passes the original query through, so `missing: view` stops it
      // matching its own destination (it looped forever without it).
      { source: "/dashboard/trips", has: [{ type: "query", key: "filter", value: "unclassified" }], missing: [{ type: "query", key: "view" }], destination: "/dashboard/trips?view=inbox", permanent: false },
      { source: "/dashboard/business", destination: "/dashboard/insights", permanent: false },
      { source: "/dashboard/personal", destination: "/dashboard/insights", permanent: false },
      { source: "/dashboard/analytics", destination: "/dashboard/insights?view=trends", permanent: false },
      { source: "/dashboard/inbox", destination: "/dashboard/bank/inbox", permanent: false },
      { source: "/dashboard/exports", destination: "/dashboard/tax/exports", permanent: false },
      { source: "/dashboard/self-assessment", destination: "/dashboard/tax/self-assessment", permanent: false },
      { source: "/dashboard/accountant", destination: "/dashboard/tax/accountant", permanent: false },
      { source: "/dashboard/locations", destination: "/dashboard/places", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // unpkg stays only while the admin UserDetailModal still loads Leaflet from it.
              // Driver pages bundle Leaflet from npm. GA4 loads (after cookie consent) from googletagmanager.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https://tile.openstreetmap.org https://unpkg.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com",
              `connect-src 'self' https://api.mileclear.com ${apiOrigin()} https://exp.host https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      {
        source: "/branding/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
