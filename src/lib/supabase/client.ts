import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton Supabase browser client.
// We must NOT create a new client per call: every instance spins up its own auth
// listener and tries to acquire the same Web Locks resource. On iOS Safari and in
// PWA standalone mode that race deadlocks `getSession()` and the whole UI hangs.
let _client: SupabaseClient | null = null

// Browser-side: route through our own domain. Some RU mobile providers DNS-spoof
// supabase.co directly, so users without VPN got "invalid login" because the
// auth response came from the spoofed IP. Going through 24karidesk.ru/supabase/*
// makes every request look like it's hitting our RU server (it is — Nginx proxies
// it onward to Supabase server-side).
function browserSupabaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (typeof window === 'undefined') return env
  // Prefer same-origin proxy on production; fall back to direct env URL only if
  // we're somehow not on 24karidesk.ru (e.g. localhost dev).
  const host = window.location.host
  if (host === '24karidesk.ru' || host === 'www.24karidesk.ru') {
    return `${window.location.origin}/supabase`
  }
  return env
}

export function createClient(): SupabaseClient {
  if (_client) return _client
  _client = createBrowserClient(
    browserSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _client
}
