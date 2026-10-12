import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page reads live Neon/GitHub state, so nothing is prerendered.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
