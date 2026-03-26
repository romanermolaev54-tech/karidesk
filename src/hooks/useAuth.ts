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

    async function loadProfile(userId: string) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (mounted) setProfile(data)
    }

    async function getUser() {
      try {
        // Use getSession with timeout to avoid lock issues
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auth timeout')), 5000)
        )

        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as Awaited<ReturnType<typeof supabase.auth.getSession>>
        const currentUser = session?.user ?? null

        if (mounted) {
          setUser(currentUser)
          if (currentUser) {
            await loadProfile(currentUser.id)
          }
        }
      } catch (e) {
        console.warn('Auth session check failed, trying getUser:', e)
        try {
          const { data: { user: fallbackUser } } = await supabase.auth.getUser()
          if (mounted) {
            setUser(fallbackUser)
            if (fallbackUser) {
              await loadProfile(fallbackUser.id)
            }
          }
        } catch {
          // No session available
          if (mounted) setUser(null)
        }
      }
      if (mounted) setLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user) {
        await loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
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
