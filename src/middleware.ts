import { NextResponse, type NextRequest } from 'next/server'

// Lightweight middleware:
// - For protected pages: checks ONLY for the presence of a Supabase session cookie.
//   We do NOT call supabase.auth.getUser() here — that's a network round-trip on every
//   single navigation and was the main source of "stuck" loading on flaky mobile networks.
// - Token validity is checked client-side by useAuth on the actual page render.
//   If the cookie is invalid, useAuth signs out and redirects.
// - Auth pages (/login, /register) redirect to /dashboard if cookie is present.
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  const isAuthPage = path.startsWith('/login') || path.startsWith('/register')
  const isProtected = (
    path.startsWith('/dashboard') ||
    path.startsWith('/tickets') ||
    path.startsWith('/my-tickets') ||
    path.startsWith('/work') ||
    path.startsWith('/expenses') ||
    path.startsWith('/reports') ||
    path.startsWith('/stores') ||
    path.startsWith('/notifications') ||
    path.startsWith('/admin') ||
    path.startsWith('/settings') ||
    path.startsWith('/users') ||
    path.startsWith('/approvals')
  )

  if (!isAuthPage && !isProtected) return NextResponse.next()

  // Supabase ssr stores access tokens in cookies prefixed with "sb-"
  const cookies = request.cookies.getAll()
  const hasSession = cookies.some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (isAuthPage && hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo-|icons/|manifest.json|sw.js|api/).*)',
  ],
}
