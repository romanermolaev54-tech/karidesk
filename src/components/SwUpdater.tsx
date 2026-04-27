'use client'

import { useEffect } from 'react'

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || ''
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // re-check every 5 min while app is open
const RELOAD_FLAG = 'karidesk_build_reloaded_for'

/**
 * Auto-updater that works WITHOUT a service worker.
 * Fetches /api/version from the server and compares it to the build ID
 * that was baked into the client bundle. If they differ, the user has stale
 * JS — reload the page once to pick up the new bundle.
 *
 * Also cleans up old service workers if any are registered (legacy behaviour).
 */
export function SwUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const checkVersion = async () => {
      if (!CLIENT_BUILD_ID) return
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        if (!r.ok) return
        const { buildId } = await r.json() as { buildId: string }
        if (cancelled) return
        if (buildId && buildId !== CLIENT_BUILD_ID) {
          // Avoid reload loops — remember which build we already reloaded for
          let lastReloadFor = ''
          try { lastReloadFor = sessionStorage.getItem(RELOAD_FLAG) || '' } catch { /* noop */ }
          if (lastReloadFor === buildId) return
          try { sessionStorage.setItem(RELOAD_FLAG, buildId) } catch { /* noop */ }
          // Clean stale SW caches first
          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations()
              for (const reg of regs) try { await reg.unregister() } catch { /* noop */ }
            }
            if ('caches' in window) {
              const keys = await caches.keys()
              await Promise.all(keys.map(k => caches.delete(k)))
            }
          } catch { /* noop */ }
          window.location.reload()
        }
      } catch { /* network error — try again next interval */ }
    }

    // First check immediately, then on a timer + when tab regains focus
    checkVersion()
    const intervalId = setInterval(checkVersion, CHECK_INTERVAL_MS)
    const onFocus = () => { checkVersion() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkVersion()
    })

    return () => {
      cancelled = true
      clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return null
}
