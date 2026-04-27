'use client'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i)
  return output
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    let registration = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    }
    // Wait for SW to reach 'active' state before returning. pushManager.subscribe()
    // requires an active worker — if we return while the SW is still 'installing',
    // the caller hits "Subscription failed - no active Service Worker" on iOS.
    if (!registration.active) {
      try {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('sw-ready-timeout')), 5000)),
        ])
      } catch { /* timeout — return whatever we have */ }
    }
    return registration
  } catch {
    return null
  }
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'Браузер не поддерживает пуш-уведомления' }

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapid) return { ok: false, reason: 'VAPID ключ не настроен' }

  // If permission is already granted, don't call requestPermission again.
  // On iOS PWA, calling requestPermission without a user gesture can return
  // 'default' even when the user previously granted permission, causing a
  // false "Разрешение не предоставлено" failure on silent re-subscribe.
  let permission: NotificationPermission = Notification.permission
  if (permission !== 'granted') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') {
    return { ok: false, reason: permission === 'denied' ? 'Разрешение отклонено' : 'Разрешение не предоставлено' }
  }

  const registration = await registerServiceWorker()
  if (!registration) return { ok: false, reason: 'Не удалось зарегистрировать service worker' }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    try {
      const keyBytes = urlBase64ToUint8Array(vapid)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer,
      })
    } catch (err) {
      return { ok: false, reason: 'Ошибка подписки: ' + (err as Error).message }
    }
  }

  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) return { ok: false, reason: 'Неверный формат подписки' }

  // Retry the POST up to 3 times with backoff. On iOS PWA the auth cookie
  // can briefly be unavailable on initial load and the server returns 401,
  // making first attempts fail even though the user is logged in. Retrying
  // catches that, plus transient network blips.
  const body = JSON.stringify({
    endpoint,
    keys: { p256dh, auth },
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 600 * attempt))
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'include',
      })
      if (res.ok) return { ok: true }
      lastErr = `${res.status} ${await res.text().catch(() => '')}`
    } catch (e) {
      lastErr = (e as Error).message
    }
  }
  return { ok: false, reason: `Ошибка сохранения: ${lastErr}` }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'Не поддерживается' }
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!registration) return { ok: true }
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return { ok: true }
  const endpoint = subscription.endpoint
  try { await subscription.unsubscribe() } catch { /* ignore */ }
  await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' })
  return { ok: true }
}

export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

/**
 * Self-heal: if the device already has a local PushSubscription, re-POST it
 * to /api/push/subscribe. Idempotent (server upserts on endpoint), so safe
 * to call on every app launch. Recovers users whose original subscribe POST
 * failed silently — for example because the SW was still installing, the
 * auth cookie hadn't fully attached yet, or the network blipped.
 *
 * Returns true if a subscription was found locally (regardless of POST
 * outcome), false if there's nothing to sync.
 */
export async function syncLocalSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return false
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false
    const body = JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      user_agent: navigator.userAgent,
    })
    // Best-effort: try a couple of times, but never throw — caller doesn't care.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 600))
      try {
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          credentials: 'include',
        })
        if (res.ok) break
      } catch { /* swallow */ }
    }
    return true
  } catch {
    return false
  }
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = (window.navigator as unknown as { standalone?: boolean }).standalone
  return !!standalone || window.matchMedia('(display-mode: standalone)').matches
}
