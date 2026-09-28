import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // @arcium-hq/client imports Node's `crypto` and `fs`; swap in small browser shims.
    resolveAlias: {
      crypto: { browser: "./src/shims/crypto.ts" },
      fs: { browser: "./src/shims/fs.ts" },
    },
  },
  // The old profile pages moved: the home page is the user panel now.
  async redirects() {
    return [
      { source: "/profile", destination: "/", permanent: false },
      { source: "/profile/creator", destination: "/create/token", permanent: false },
    ];
  },
};

export default nextConfig;
