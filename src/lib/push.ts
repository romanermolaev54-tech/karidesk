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
    const existing = await navigator.serviceWorker.getRegistration('/sw.js')
    if (existing) return existing
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch {
    return null
  }
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'Браузер не поддерживает пуш-уведомления' }

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapid) return { ok: false, reason: 'VAPID ключ не настроен' }

  const permission = await Notification.requestPermission()
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

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, reason: `Ошибка сохранения: ${text || res.status}` }
  }
  return { ok: true }
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

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = (window.navigator as unknown as { standalone?: boolean }).standalone
  return !!standalone || window.matchMedia('(display-mode: standalone)').matches
}
