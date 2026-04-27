import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Returns the current server-side build ID. Clients compare it to the build ID
// they were shipped with — if different, they reload to pick up the new bundle.
// This is what makes "auto-update without reinstalling the PWA" actually work
// even for users who never enabled the service worker.
export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID || '0' },
    { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }
  )
}
