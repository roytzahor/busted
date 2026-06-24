import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js requires 'unsafe-inline' for styles; fonts loaded via next/font (data:)
      "style-src 'self' 'unsafe-inline'",
      // Inline scripts are needed by Next.js runtime; nonces not used so allow unsafe-inline
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Images: any HTTPS source — scraped product images come from arbitrary store domains
      "img-src 'self' data: blob: https:",
      // Fonts: self + Google Fonts (via next/font — loaded as data URIs, but keep for safety)
      "font-src 'self' data:",
      // API calls from client go to same origin only
      "connect-src 'self'",
      // No plugins, no object embeds
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    // Scraped product images come from arbitrary store domains; we render them
    // via <Image unoptimized> so this only gates dev-time URL validation.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
