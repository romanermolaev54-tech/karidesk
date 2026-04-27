'use client'

import { useEffect } from 'react'

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || ''
const CHECK_INTERVAL_MS = 5 * 60 * 1000
const RELOAD_FLAG = 'karidesk_build_reloaded_for'

/**
 * Auto-updater for the client bundle. Compares the build ID baked into the
 * client bundle with what /api/version reports. If they differ, the user is
 * on a stale JS bundle — reload the page once.
 *
 * IMPORTANT: we do NOT unregister the service worker here. Doing so would also
 * drop the user's push subscription, forcing them to click "Enable
 * notifications" again after every deploy. Instead, we ask the SW to update
 * itself in the background via `reg.update()` — that swaps the SW script
 * cleanly and keeps the push subscription alive.
 */
export function SwUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const refreshSwScript = async () => {
      if (!('serviceWorker' in navigator)) return
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        if (reg) await reg.update()
      } catch { /* noop */ }
    }

    const checkVersion = async () => {
      if (!CLIENT_BUILD_ID) return
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        if (!r.ok) return
        const { buildId } = await r.json() as { buildId: string }
        if (cancelled) return
        if (buildId && buildId !== CLIENT_BUILD_ID) {
          let lastReloadFor = ''
          try { lastReloadFor = sessionStorage.getItem(RELOAD_FLAG) || '' } catch { /* noop */ }
          if (lastReloadFor === buildId) return
          try { sessionStorage.setItem(RELOAD_FLAG, buildId) } catch { /* noop */ }
          // Trigger SW to fetch its new script in the background — keeps push
          // subscription intact (unlike unregister, which would drop it).
          await refreshSwScript()
          window.location.reload()
        }
      } catch { /* network error — try again later */ }
    }

    // Always trigger a SW script-refresh check too, so the SW can update even
    // when the JS build hasn't changed.
    refreshSwScript()
    checkVersion()

    const intervalId = setInterval(checkVersion, CHECK_INTERVAL_MS)
    const onFocus = () => { checkVersion() }
    const onVis = () => { if (!document.hidden) checkVersion() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return null
}
