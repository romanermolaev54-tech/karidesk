'use client'

import { useEffect } from 'react'

const EXPECTED_SW_VERSION = '2026-04-27-v4'

/**
 * Asks the active service worker for its version. If it doesn't respond or returns
 * an older version, we unregister it and reload — this clears stale clients that
 * are stuck on a previous deploy and makes the app responsive again.
 */
export function SwUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    let cancelled = false

    const run = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        if (!reg) return // nothing registered → fresh install
        // Make sure SW gets fresh script next time
        try { await reg.update() } catch { /* noop */ }

        // Ask the active SW for its version
        const ctrl = navigator.serviceWorker.controller
        if (!ctrl) return

        const version = await new Promise<string | null>(resolve => {
          const channel = new MessageChannel()
          const timeout = setTimeout(() => resolve(null), 1500)
          channel.port1.onmessage = e => {
            clearTimeout(timeout)
            resolve(e.data?.version || null)
          }
          try { ctrl.postMessage('sw-version', [channel.port2]) }
          catch { resolve(null) }
        })

        if (cancelled) return
        if (version !== EXPECTED_SW_VERSION) {
          // Outdated SW — drop it and reload to pick up the new one
          try { await reg.unregister() } catch { /* noop */ }
          // Avoid reload loops
          const flag = sessionStorage.getItem('karidesk_sw_reloaded')
          if (!flag) {
            sessionStorage.setItem('karidesk_sw_reloaded', '1')
            window.location.reload()
          }
        } else {
          sessionStorage.removeItem('karidesk_sw_reloaded')
        }
      } catch { /* noop */ }
    }
    run()
    return () => { cancelled = true }
  }, [])

  return null
}
