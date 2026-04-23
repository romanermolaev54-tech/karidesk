import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton Supabase browser client.
// We must NOT create a new client per call: every instance spins up its own auth
// listener and tries to acquire the same Web Locks resource. On iOS Safari and in
// PWA standalone mode that race deadlocks `getSession()` and the whole UI hangs.
let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _client
}
