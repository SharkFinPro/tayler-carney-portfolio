import type { NextConfig } from "next";
import { assertEnv } from "./src/lib/env";

// Fail the build, not a request at 3am. Every required variable has a silent
// failure mode (localhost OpenGraph URLs, an admin login that appears to work
// and never does), so a misconfigured deploy should never reach production.
// Skipped when SKIP_ENV_VALIDATION is set — CI builds to prove the app
// compiles and deliberately holds no production secrets.
assertEnv();

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // Dev-only (Next ignores this in production builds). After moving reads onto
  // the fetch cache, the thing you most need to see while developing is which
  // CMS requests actually went out and which were served from cache.
  logging: {
    fetches: { fullUrl: true },
  },
  experimental: {
    // Server Actions default to a 1 MB request body, and every media upload
    // goes through one. A cropped phone photo or a resume PDF routinely exceeds
    // that, and the platform rejects the body BEFORE the action runs — so the
    // careful error handling inside uploadAsset never got a chance to report
    // it, and the admin saw a generic crash instead.
    //
    // 8 MB matches MAX_UPLOAD_BYTES in src/lib/uploads.ts, which is where the
    // limit is actually enforced (with a readable message). Note Vercel's own
    // request cap — 4.5 MB on most plans — is the real ceiling in production
    // regardless of what is configured here.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'inline',
    contentSecurityPolicy: "default-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.graphassets.com',
      },
      {
        protocol: "https",
        hostname: "media.licdn.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "img-src 'self' https: data:",
              "media-src 'self' https://*.graphassets.com",
              `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https://vitals.vercel-insights.com https://*.graphassets.com",
              "font-src 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  }
};

export default nextConfig;
