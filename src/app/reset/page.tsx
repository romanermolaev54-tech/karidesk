'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Hard reset page — always loads, never depends on Supabase or React Query state.
 * Clears every Supabase cookie, every localStorage/sessionStorage entry,
 * unregisters all service workers, and clears all caches.
 * Use as a safety net when a user is stuck on a stale session.
 */
export default function ResetPage() {
  const [steps, setSteps] = useState<string[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    const log = (s: string) => setSteps(prev => [...prev, s])

    const run = async () => {
      try {
        // 1. Clear cookies (every browser-accessible cookie on this origin)
        try {
          document.cookie.split(';').forEach(c => {
            const eq = c.indexOf('=')
            const name = (eq > -1 ? c.substring(0, eq) : c).trim()
            if (!name) return
            // Try multiple paths/domains in case Supabase set them differently
            const expires = 'Thu, 01 Jan 1970 00:00:00 GMT'
            document.cookie = `${name}=; expires=${expires}; path=/`
            document.cookie = `${name}=; expires=${expires}; path=/; domain=${location.hostname}`
            document.cookie = `${name}=; expires=${expires}; path=/; domain=.${location.hostname}`
          })
          log('✓ Cookies очищены')
        } catch { log('— Cookies: ошибка') }

        // 2. localStorage / sessionStorage
        try { localStorage.clear(); log('✓ localStorage очищен') } catch { log('— localStorage: ошибка') }
        try { sessionStorage.clear(); log('✓ sessionStorage очищен') } catch { log('— sessionStorage: ошибка') }

        // 3. IndexedDB (Supabase auth helper sometimes stores tokens here)
        try {
          if ('indexedDB' in window && 'databases' in indexedDB) {
            const dbs = await (indexedDB as unknown as { databases(): Promise<{ name?: string }[]> }).databases()
            for (const d of dbs) if (d.name) try { indexedDB.deleteDatabase(d.name) } catch {}
            log(`✓ IndexedDB очищен (${dbs.length})`)
          }
        } catch { log('— IndexedDB: пропущено') }

        // 4. Cache Storage
        try {
          if ('caches' in window) {
            const keys = await caches.keys()
            await Promise.all(keys.map(k => caches.delete(k)))
            log(`✓ Кеши браузера очищены (${keys.length})`)
          }
        } catch { log('— Кеши: ошибка') }

        // 5. Service worker
        try {
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations()
            for (const r of regs) try { await r.unregister() } catch {}
            log(`✓ Service Worker удалён (${regs.length})`)
          }
        } catch { log('— Service Worker: ошибка') }

        log('Готово!')
        setDone(true)
      } catch (e) {
        log('Ошибка: ' + (e as Error).message)
        setDone(true)
      }
    }
    run()
  }, [])

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm card-premium p-6 space-y-4">
        <h1 className="text-heading-2 text-text-primary">Сброс сессии</h1>
        <p className="text-body-sm text-text-secondary">
          Чистим сохранённые данные браузера и приложения. Это решает проблему «висит»
          из-за устаревшей сессии или service worker.
        </p>

        <div className="rounded-xl bg-surface-elevated/30 border border-border p-3 space-y-1">
          {steps.map((s, i) => (
            <p key={i} className="text-caption text-text-primary font-mono">{s}</p>
          ))}
          {!done && (
            <p className="text-caption text-text-tertiary font-mono">…</p>
          )}
        </div>

        {done && (
          <div className="space-y-2">
            <Link
              href="/login"
              className="block w-full text-center gradient-accent text-white rounded-xl py-2.5 text-body-sm font-semibold"
            >
              Перейти на вход
            </Link>
            <p className="text-caption text-text-tertiary text-center">
              Если приложение установлено на главный экран iPhone — удалите иконку и установите заново через Safari.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
