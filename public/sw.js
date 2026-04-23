// KariDesk service worker — Web Push only (no fetch caching to avoid stale assets)
const SW_VERSION = '2026-04-23-v3'

self.addEventListener('install', () => {
  // Take over immediately so users get the new version on next reload
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Clean up any caches a previous version of this SW may have created
    if (typeof caches !== 'undefined' && caches.keys) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
    await self.clients.claim()
  })())
})

self.addEventListener('push', event => {
  if (!event.data) return
  let payload = {}
  try { payload = event.data.json() } catch { payload = { title: 'KariDesk', body: event.data.text() } }

  const title = payload.title || 'KariDesk'
  const options = {
    body: payload.body || payload.message || '',
    icon: payload.icon || '/logo-kari-icon.png',
    badge: payload.badge || '/logo-kari-icon.png',
    tag: payload.tag || String(Date.now()),
    data: {
      url: payload.url || (payload.ticket_id ? `/tickets/${payload.ticket_id}` : '/notifications'),
    },
    requireInteraction: payload.type === 'action_required',
    vibrate: [120, 60, 120],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/notifications'
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) {
          try { await client.navigate(url) } catch {}
        }
        return
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(url)
    }
  })())
})

// Help debugging which version is live
self.addEventListener('message', event => {
  if (event.data === 'sw-version') {
    event.source && event.source.postMessage({ version: SW_VERSION })
  }
})
