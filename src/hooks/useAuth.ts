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

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    const hardTimeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 5000)

    async function loadProfile(userId: string) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (mounted && data) setProfile(data)
      } catch {
        // ignore — profile load is non-blocking for UI unblock
      }
    }

    async function init() {
      try {
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise<{ data: { session: null } }>(resolve =>
          setTimeout(() => resolve({ data: { session: null } }), 4000)
        )
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise])
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id)
        } else {
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
        await loadProfile(currentUser.id)
      } else {
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
