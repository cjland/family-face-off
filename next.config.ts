import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Version info shown on the host screen: the package.json version, the commit and when the code
 * was last updated (the commit's date when git is available, otherwise the build time).
 */
function buildInfo() {
  const version = (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version;
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA || git("git rev-parse HEAD")).slice(0, 7);
  const updated = git("git log -1 --format=%cI") || new Date().toISOString();
  return { NEXT_PUBLIC_APP_VERSION: version, NEXT_PUBLIC_APP_COMMIT: commit, NEXT_PUBLIC_APP_UPDATED: updated };
}

const privateHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // Every page in this app is live game state, so Cache Components is off and
  // routes are rendered per request.
  cacheComponents: false,
  env: buildInfo(),
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // Photos are versioned in their URL, so they may be cached privately; everything else is no-store.
      { source: "/api/:path((?!photos/).*)", headers: privateHeaders },
      { source: "/host/:path*", headers: privateHeaders },
      { source: "/host", headers: privateHeaders },
      { source: "/join/:path*", headers: privateHeaders },
      { source: "/play/:path*", headers: privateHeaders },
      { source: "/display/:path*", headers: privateHeaders },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          // Same-origin framing only: the host's simulation view shows the TV and phones in frames.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
