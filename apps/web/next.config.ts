import { resolve } from "path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Load .env from monorepo root so NEXT_PUBLIC_* vars are available at build time
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@mileclear/shared"],
};

export default nextConfig;
