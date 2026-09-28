import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // @arcium-hq/client imports Node's `crypto` and `fs`; swap in small browser shims.
    resolveAlias: {
      crypto: { browser: "./src/shims/crypto.ts" },
      fs: { browser: "./src/shims/fs.ts" },
    },
  },
};

export default nextConfig;
