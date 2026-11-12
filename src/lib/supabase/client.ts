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
// fetch() has no timeout of its own: on a stalled mobile connection a data
// read simply never settles and the screen keeps its skeletons forever. Reads
// from the REST API get a deadline so the caller receives an error it can show
// and retry. Writes, uploads and auth calls are left alone.
const READ_DEADLINE_MS = 20000

function fetchWithDeadline(input: RequestInfo | URL, init: RequestInit | undefined, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  const outer = init?.signal
  const onOuterAbort = () => ctrl.abort()
  if (outer) {
    if (outer.aborted) ctrl.abort()
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  })
}

function proxiedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') return fetch(input, init)

  let url: string
  if (typeof input === 'string') url = input
  else if (input instanceof URL) url = input.toString()
  else url = input.url

  const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
  const isRead = (method === 'GET' || method === 'HEAD') && url.includes('/rest/v1/')
  const send = (target: RequestInfo | URL) =>
    isRead ? fetchWithDeadline(target, init, READ_DEADLINE_MS) : fetch(target, init)

  const host = window.location.host
  const useProxy = host === '24karidesk.ru' || host === 'www.24karidesk.ru'
  if (!useProxy || !SUPABASE_URL) return send(input)

  if (url.startsWith(SUPABASE_URL)) {
    return send(`${window.location.origin}/supabase` + url.slice(SUPABASE_URL.length))
  }
  return send(input)
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
