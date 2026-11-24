import type { NextConfig } from "next";

const privateHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // Every page in this app is live game state, so Cache Components is off and
  // routes are rendered per request.
  cacheComponents: false,
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
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
