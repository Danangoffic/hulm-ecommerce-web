import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker multi-stage build (copies only what `next start` needs)
  output: "standalone",

  // Expose instrumentation hooks (New Relic, Sentry)
  // instrumentation.ts is picked up automatically in Next.js 15+
};

export default nextConfig;
