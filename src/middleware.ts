import { NextResponse, type NextRequest } from 'next/server'

// Tiny middleware: only handles the /reset escape hatch and a "logged-in user
// shouldn't see /login again" convenience redirect. Real auth checks happen
// on the client in useAuth — this avoids a known iOS PWA cookie race where
// the browser hasn't persisted the session cookie yet when middleware fires.
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // /reset is the safety-net page: never block it
  if (path.startsWith('/reset')) return NextResponse.next()

  // If user already has a session cookie and visits /login or /register,
  // bounce them to /dashboard. (Failure mode here is harmless — they'll
  // just see the auth form, which is fine.)
  // ?relogin=1 is set by the dashboard layout when the client has no session.
  // Without this escape hatch a stale cookie bounced the user straight back to
  // /dashboard, where they sat on an empty shell with nothing loading.
  const isAuthPage = path === '/login' || path === '/register'
  if (isAuthPage && !request.nextUrl.searchParams.has('relogin')) {
    const cookies = request.cookies.getAll()
    const hasSession = cookies.some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))
    if (hasSession) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo-|icons/|manifest.json|sw.js|api/).*)',
  ],
}
