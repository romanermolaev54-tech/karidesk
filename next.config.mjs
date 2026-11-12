// next.config is evaluated separately in the main build process and in every
// compile worker. A bare Date.now() here gave the client bundle, the server
// bundle and .next/BUILD_ID three different values, so SwUpdater saw a "new
// version" on every fresh session and reloaded the page mid-startup. Workers
// inherit process.env, so pin the value there on the first evaluation.
if (!process.env.KARIDESK_BUILD_ID) process.env.KARIDESK_BUILD_ID = String(Date.now())
const BUILD_ID = process.env.KARIDESK_BUILD_ID

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stable build-id reference for client-side version checks
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  generateBuildId: async () => BUILD_ID,
  // HTML pages and the service worker should never be cached by the browser —
  // otherwise users hit "Failed to find Server Action" after we deploy a new build.
  // Hashed JS/CSS chunks under /_next/static are still safe to cache forever.
  async headers() {
    return [
      {
        // Hashed static assets — cache forever, content is immutable
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Logo PNGs / icons — cache for a week
        source: '/:file(logo-.*\\..*|icons/.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
      {
        source: '/((?!_next/static|_next/image|icons/|logo-).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig
