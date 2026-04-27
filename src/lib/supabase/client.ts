import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Custom fetch that transparently rewrites every Supabase API call so the
// browser hits our same-origin proxy (24karidesk.ru/supabase/*) instead of
// supabase.co directly. This bypasses RU provider DNS spoofing without
// changing the Supabase URL itself — so the cookie name stays stable
// and the server-side client still sees the session.
function proxiedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') return fetch(input, init)

  const host = window.location.host
  const useProxy = host === '24karidesk.ru' || host === 'www.24karidesk.ru'
  if (!useProxy || !SUPABASE_URL) return fetch(input, init)

  const proxyBase = `${window.location.origin}/supabase`

  let url: string
  if (typeof input === 'string') url = input
  else if (input instanceof URL) url = input.toString()
  else url = input.url

  if (url.startsWith(SUPABASE_URL)) {
    url = proxyBase + url.slice(SUPABASE_URL.length)
    return fetch(url, init)
  }
  return fetch(input, init)
}

export function createClient(): SupabaseClient {
  if (_client) return _client
  _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: proxiedFetch },
    realtime: {
      // Realtime WebSocket also goes through the proxy
      params: {},
    },
  })
  return _client
}
