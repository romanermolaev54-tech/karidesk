'use client'

import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/types/database'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
  // Auth has not answered for a long time — most likely no connectivity.
  stalled: boolean
  isAdmin: boolean
  isDirector: boolean
  isEmployee: boolean
  isContractor: boolean
}

const PROFILE_CACHE_KEY = 'karidesk_profile_v1'
// Auth events fire on every tab focus and token refresh; the profile rarely
// changes, so don't refetch it more often than this.
const PROFILE_MIN_REFRESH_MS = 60 * 1000
const PROFILE_FETCH_TIMEOUT_MS = 8000

interface CachedProfile {
  ts: number
  userId: string
  profile: Profile
}

function readCachedProfile(userId: string): Profile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY) || localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as CachedProfile
    if (data.userId !== userId) return null
    // No expiry: the cache only paints the first frame, a background refetch
    // always follows, and RLS — not this object — guards the data.
    return data.profile
  } catch { return null }
}

function writeCachedProfile(userId: string, profile: Profile) {
  if (typeof window === 'undefined') return
  try {
    const payload: CachedProfile = { ts: Date.now(), userId, profile }
    const json = JSON.stringify(payload)
    sessionStorage.setItem(PROFILE_CACHE_KEY, json)
    localStorage.setItem(PROFILE_CACHE_KEY, json)
  } catch { /* noop */ }
}

function clearCachedProfile() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY)
    localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch { /* noop */ }
}

function withTimeout<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const t = setTimeout(() => resolve(fallback), ms)
    Promise.resolve(p).then(v => { clearTimeout(t); resolve(v) }).catch(() => { clearTimeout(t); resolve(fallback) })
  })
}

// ---------------------------------------------------------------------------
// One auth store for the whole app.
//
// Every component used to run its own getSession() + profile fetch + auth
// subscription (layout, sidebar and the page — three copies per screen), and
// each copy treated a getSession() slower than 1.5 s as "logged out". On a
// phone, where the token usually has to be refreshed on launch, that false
// logout sent the user to /login, middleware bounced them back on the cookie,
// and they ended up on an empty dashboard that never loaded its data.
//
// The session now has a single source of truth: Supabase's auth events.
// INITIAL_SESSION is emitted once initialisation (including a token refresh)
// has really finished, so "no user" is only ever concluded from a real answer.
// ---------------------------------------------------------------------------

interface Snapshot {
  user: User | null
  profile: Profile | null
  loading: boolean
  stalled: boolean
}

const INITIAL: Snapshot = { user: null, profile: null, loading: true, stalled: false }
let snapshot: Snapshot = INITIAL
const listeners = new Set<() => void>()
let started = false
let profileFetchedAt = 0
let profileRetries = 0
const PROFILE_FAST_RETRIES = 6
// Auth requests have no timeout, so on a dead connection `loading` could stay
// true forever. After this long the UI offers a retry instead of a bare spinner.
const STALL_AFTER_MS = 15000
let stallTimer: ReturnType<typeof setTimeout> | null = null
// A failed token refresh on startup reports "no session" although the session
// is still stored. We re-check a few times before believing it.
const SESSION_RECOVERY_ATTEMPTS = 3
let recoveryAttempts = 0
let profileInFlight: { userId: string; promise: Promise<void> } | null = null

function armStallTimer() {
  if (stallTimer) clearTimeout(stallTimer)
  stallTimer = setTimeout(() => {
    stallTimer = null
    if (snapshot.loading) setSnapshot({ stalled: true })
  }, STALL_AFTER_MS)
}

function setSnapshot(patch: Partial<Snapshot>) {
  const next = { ...snapshot, ...patch }
  if (!next.loading) next.stalled = false
  if (next.user === snapshot.user && next.profile === snapshot.profile
    && next.loading === snapshot.loading && next.stalled === snapshot.stalled) return
  const startedLoading = next.loading && !snapshot.loading
  snapshot = next
  if (!next.loading && stallTimer) { clearTimeout(stallTimer); stallTimer = null }
  if (startedLoading) armStallTimer()
  listeners.forEach(l => l())
}

// Lets a screen that has just saved profile fields update the shared state at
// once, instead of waiting for the next throttled refetch.
export function patchProfile(userId: string, patch: Partial<Profile>) {
  if (snapshot.user?.id !== userId || !snapshot.profile) return
  const profile = { ...snapshot.profile, ...patch }
  writeCachedProfile(userId, profile)
  setSnapshot({ profile })
}

function hasAuthCookie(): boolean {
  if (typeof document === 'undefined') return false
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie)
}

function sameProfile(a: Profile | null, b: Profile): boolean {
  if (!a) return false
  try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
}

async function fetchProfileOnce(userId: string): Promise<Profile | null> {
  const supabase = createClient()
  const query = supabase.from('profiles').select('*').eq('id', userId).single()
    .then(({ data }) => (data as Profile | null) ?? null)
  return withTimeout(query, PROFILE_FETCH_TIMEOUT_MS, null)
}

function refreshProfile(userId: string): Promise<void> {
  if (profileInFlight?.userId === userId) return profileInFlight.promise
  const fresh = snapshot.profile?.id === userId && Date.now() - profileFetchedAt < PROFILE_MIN_REFRESH_MS
  if (fresh) return Promise.resolve()

  const promise = (async () => {
    try {
      let data = await fetchProfileOnce(userId)
      if (!data) {
        await new Promise(r => setTimeout(r, 600))
        data = await fetchProfileOnce(userId)
      }
      // The user may have signed out or switched while we were waiting.
      if (snapshot.user?.id !== userId) return
      if (data) {
        profileFetchedAt = Date.now()
        profileRetries = 0
        writeCachedProfile(userId, data)
        // Keep the old object when nothing changed so effects keyed on
        // `profile` don't refetch their data on every token refresh.
        setSnapshot({ profile: sameProfile(snapshot.profile, data) ? snapshot.profile : data, loading: false })
      } else {
        setSnapshot({ loading: false })
        // Without a profile the role is unknown and the UI falls back to the
        // employee view, so keep trying quietly while the network recovers.
        if (!snapshot.profile) {
          profileRetries += 1
          const delay = profileRetries <= PROFILE_FAST_RETRIES ? 5000 : 60000
          setTimeout(() => {
            if (snapshot.user?.id === userId && !snapshot.profile) void refreshProfile(userId)
          }, delay)
        }
      }
    } finally {
      if (profileInFlight?.userId === userId) profileInFlight = null
    }
  })()
  profileInFlight = { userId, promise }
  return promise
}

function applySession(event: string, nextUser: User | null) {
  if (!nextUser) {
    profileFetchedAt = 0
    profileRetries = 0
    clearCachedProfile()
    setSnapshot({ user: null, profile: null, loading: false })
    return
  }

  recoveryAttempts = 0
  const sameUser = snapshot.user?.id === nextUser.id
  if (!sameUser) profileRetries = 0
  // Keep the same object across token refreshes: pages key their data
  // loading on `user`, and a new reference would refetch everything.
  const user = sameUser && event !== 'USER_UPDATED' ? snapshot.user : nextUser
  const profile = sameUser ? snapshot.profile : readCachedProfile(nextUser.id)
  setSnapshot({
    user,
    profile,
    // With a cached profile the UI can render at once; otherwise wait for
    // the fetch so an admin never flashes the default employee layout.
    loading: profile ? false : (sameUser ? snapshot.loading : true),
  })

  // Never await Supabase calls inside the auth callback — it runs under the
  // auth lock. Defer the profile fetch to the next tick instead.
  const userId = nextUser.id
  setTimeout(() => { void refreshProfile(userId) }, 0)
}

// Startup reported "no session" while the session cookie is still present.
// auth-js keeps the stored session when the refresh failed for network reasons
// and deletes it when the token was really rejected, so ask again before
// sending a logged-in user to the login page.
async function recoverSession() {
  const supabase = createClient()
  let failed = false
  let user: User | null = null
  try {
    const { data, error } = await supabase.auth.getSession()
    user = data.session?.user ?? null
    failed = !!error
  } catch { failed = true }

  if (snapshot.user) return // an auth event already delivered the session
  if (user) { applySession('RECOVERED', user); return }
  if (failed && hasAuthCookie() && recoveryAttempts < SESSION_RECOVERY_ATTEMPTS) {
    recoveryAttempts += 1
    setTimeout(() => { void recoverSession() }, 4000)
    return
  }
  applySession('SIGNED_OUT', null)
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  armStallTimer()
  const supabase = createClient()

  supabase.auth.onAuthStateChange((event, session) => {
    const nextUser = session?.user ?? null
    if (!nextUser && event === 'INITIAL_SESSION' && hasAuthCookie()) {
      recoveryAttempts = 0
      setTimeout(() => { void recoverSession() }, 300)
      return
    }
    applySession(event, nextUser)
  })

  // Role changes and account blocks should not wait for the next token
  // refresh: re-read the profile when the app comes back to the foreground
  // (refreshProfile throttles itself).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && snapshot.user) void refreshProfile(snapshot.user.id)
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  start()
  return () => { listeners.delete(listener) }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => INITIAL

export function useAuth(): AuthState {
  const { user, profile, loading, stalled } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const role = (profile?.role as UserRole | undefined) ?? null

  return {
    user,
    profile,
    role,
    loading,
    stalled,
    isAdmin: role === 'admin',
    isDirector: role === 'director',
    isEmployee: role === 'employee',
    isContractor: role === 'contractor',
  }
}
