import { resolve } from "path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Load .env from monorepo root so NEXT_PUBLIC_* vars are available at build time
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https://*.basemaps.cartocdn.com https://unpkg.com",
              "connect-src 'self' https://api.mileclear.com https://exp.host",
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
