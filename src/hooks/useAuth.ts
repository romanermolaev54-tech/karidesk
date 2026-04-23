'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/types/database'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
  isAdmin: boolean
  isDirector: boolean
  isEmployee: boolean
  isContractor: boolean
}

const PROFILE_CACHE_KEY = 'karidesk_profile_v1'
const PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — profile rarely changes

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
    if (Date.now() - data.ts > PROFILE_CACHE_TTL_MS) return null
    return data.profile
  } catch {
    return null
  }
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

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    // Hard safety net: never block UI more than 4s even if everything goes wrong
    const hardTimeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 4000)

    async function loadProfile(userId: string, useCacheFirst: boolean): Promise<void> {
      // 1. Show cached profile immediately so UI isn't blocked
      if (useCacheFirst) {
        const cached = readCachedProfile(userId)
        if (cached && mounted) {
          setProfile(cached)
          setLoading(false)
        }
      }
      // 2. Fetch from DB. Retry once after a short delay in case of a transient error.
      const fetchOnce = async () => {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
          return data
        } catch { return null }
      }
      let data = await fetchOnce()
      if (!data) {
        await new Promise(r => setTimeout(r, 600))
        data = await fetchOnce()
      }
      if (mounted && data) {
        setProfile(data)
        writeCachedProfile(userId, data)
      }
    }

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id, true)
        } else {
          clearCachedProfile()
          setUser(null)
          setProfile(null)
        }
      } catch {
        if (mounted) {
          setUser(null)
          setProfile(null)
        }
      }
      if (mounted) setLoading(false)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await loadProfile(currentUser.id, false)
      } else {
        clearCachedProfile()
        setProfile(null)
      }
      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
      clearTimeout(hardTimeout)
      subscription.unsubscribe()
    }
  }, [])

  const role = profile?.role as UserRole | null

  return {
    user,
    profile,
    role,
    loading,
    isAdmin: role === 'admin',
    isDirector: role === 'director',
    isEmployee: role === 'employee',
    isContractor: role === 'contractor',
  }
}
