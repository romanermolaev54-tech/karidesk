/** @type {import('next').NextConfig} */
const nextConfig = {
  // HTML pages and the service worker should never be cached by the browser —
  // otherwise users hit "Failed to find Server Action" after we deploy a new build.
  // Hashed JS/CSS chunks under /_next/static are still safe to cache forever.
  async headers() {
    return [
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
        // All non-static routes (HTML pages) — never cache the document itself
        source: '/((?!_next/static|_next/image|icons/|logo-).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig
