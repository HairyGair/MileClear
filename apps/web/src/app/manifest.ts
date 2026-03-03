import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MileClear — Mileage Tracker for UK Drivers",
    short_name: "MileClear",
    description:
      "Track every mile. Keep every penny. The mileage tracker built for gig drivers, delivery riders, and self-employed drivers in the UK.",
    start_url: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#f5a623",
    icons: [
      {
        src: "/branding/logo-120x120.png",
        sizes: "120x120",
        type: "image/png",
      },
    ],
  };
}
