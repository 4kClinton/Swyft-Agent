/** @type {import('next').NextConfig} */

// Content-Security-Policy tuned to the origins the browser actually talks to:
//   - Convex realtime backend (https + wss to *.convex.cloud)
//   - Google Maps JS API (@vis.gl/react-google-maps) — scripts, tiles, XHR
//   - OpenStreetMap Nominatim geocoding (fetch)
//   - Next.js inline hydration scripts + inline styles ('unsafe-inline')
// The home page is statically prerendered and CDN-cached on Vercel, so a
// per-request nonce isn't possible — 'unsafe-inline' is required for scripts.
//
// In development Next.js compiles the client bundle with eval() for fast
// refresh, so 'unsafe-eval' must be allowed locally or hydration is blocked by
// the CSP and every effect-driven component (e.g. scroll reveals) stays hidden.
// Production stays strict — no 'unsafe-eval'.
const isDev = process.env.NODE_ENV !== "production"

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://*.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://nominatim.openstreetmap.org",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=(self)",
      "gyroscope=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
]

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // Apply the security headers to every route.
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
