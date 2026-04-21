'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { Notification } from '@/types/database'

interface Options {
  userId: string | null
  onNew?: (n: Notification) => void
}

function playBeep() {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.start()
    osc.stop(ctx.currentTime + 0.38)
    setTimeout(() => ctx.close().catch(() => {}), 500)
  } catch {
    // ignore
  }
}

function tryVibrate(pattern: number[] | number = [120, 60, 120]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern) } catch { /* noop */ }
  }
}

export function useNotifications({ userId, onNew }: Options) {
  const [unreadCount, setUnreadCount] = useState(0)
  const onNewRef = useRef(onNew)
  useEffect(() => { onNewRef.current = onNew }, [onNew])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    let cancelled = false

    async function loadInitialCount() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
      if (!cancelled && typeof count === 'number') setUnreadCount(count)
    }
    loadInitialCount()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          const n = payload.new as Notification
          setUnreadCount(prev => prev + 1)
          onNewRef.current?.(n)
          const isImportant = n.type === 'action_required'
          toast(
            isImportant ? `🔔 ${n.title}` : n.title,
            {
              duration: isImportant ? 8000 : 4500,
              icon: isImportant ? '⚠️' : '🔔',
              style: isImportant
                ? { borderLeft: '4px solid #E91E8C', background: '#1a1a2e', color: '#fff' }
                : undefined,
            }
          )
          playBeep()
          tryVibrate()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          const n = payload.new as Notification
          const old = payload.old as Notification
          if (!old?.is_read && n.is_read) {
            setUnreadCount(prev => Math.max(0, prev - 1))
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  return { unreadCount, setUnreadCount }
}
