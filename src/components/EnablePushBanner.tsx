'use client'

import { useEffect, useState } from 'react'
import { Bell, X, Smartphone, ChevronDown, ChevronUp } from 'lucide-react'
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  isIos,
  isStandalone,
} from '@/lib/push'
import toast from 'react-hot-toast'

const DISMISS_KEY = 'karidesk_push_banner_dismissed_until'
const DISMISS_HOURS = 24

type State =
  | { kind: 'hidden' }
  | { kind: 'enable' }
  | { kind: 'ios-install' }

export function EnablePushBanner() {
  const [state, setState] = useState<State>({ kind: 'hidden' })
  const [busy, setBusy] = useState(false)
  const [iosExpanded, setIosExpanded] = useState(false)

  useEffect(() => {
    const check = async () => {
      // Honour user's "later" choice
      try {
        const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10)
        if (until && Date.now() < until) return
      } catch { /* noop */ }

      // iOS in plain Safari (not PWA) → can't subscribe, show install hint
      if (isIos() && !isStandalone()) {
        setState({ kind: 'ios-install' })
        return
      }

      if (!isPushSupported()) return

      // Wait for Service Worker to settle. On iOS PWA, on initial load
      // navigator.serviceWorker.getRegistration() can return null for a few
      // hundred ms even if the SW was registered in a previous session, and
      // Notification.permission can briefly report 'default' instead of
      // 'granted'. Awaiting `ready` (with a timeout fallback) gives iOS the
      // chance to attach the existing SW before we check anything.
      try {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise(resolve => setTimeout(resolve, 1500)),
        ])
      } catch { /* noop */ }

      // Most reliable signal of "user already subscribed": an active
      // PushSubscription on this device. Trust this over Notification.permission,
      // which is racy on iOS standalone PWA.
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        if (reg) {
          const sub = await reg.pushManager.getSubscription()
          if (sub) return // already subscribed → never show banner
        }
      } catch { /* noop */ }

      const perm = getPushPermission()
      if (perm === 'granted') {
        // Permission granted but no PushSubscription on this device — silently
        // re-subscribe in the background. If it fails, fall back to the banner
        // so the user can retry manually.
        const res = await subscribeToPush()
        if (!res.ok) setState({ kind: 'enable' })
        return
      }
      if (perm === 'denied') return // user explicitly blocked, don't nag
      setState({ kind: 'enable' })
    }
    check()
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_HOURS * 3600 * 1000))
    } catch { /* noop */ }
    setState({ kind: 'hidden' })
  }

  const handleEnable = async () => {
    setBusy(true)
    const res = await subscribeToPush()
    setBusy(false)
    if (res.ok) {
      toast.success('Уведомления включены')
      setState({ kind: 'hidden' })
    } else {
      toast.error(res.reason || 'Не удалось включить')
    }
  }

  if (state.kind === 'hidden') return null

  if (state.kind === 'ios-install') {
    return (
      <div className="mx-4 lg:mx-6 mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 overflow-hidden">
        <div className="flex items-start gap-3 p-3">
          <div className="p-2 rounded-lg bg-amber-400/15 flex-shrink-0">
            <Smartphone className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-semibold text-text-primary">Установите KariDesk на главный экран</p>
            <p className="text-caption text-text-secondary mt-0.5">
              На iPhone уведомления приходят только из приложения с домашнего экрана.
            </p>
            <button
              onClick={() => setIosExpanded(v => !v)}
              className="text-caption text-accent mt-1 inline-flex items-center gap-1"
            >
              Как установить
              {iosExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {iosExpanded && (
              <ol className="list-decimal list-inside text-caption text-text-secondary mt-2 space-y-0.5 pl-1">
                <li>Открой сайт в <b>Safari</b> (не Chrome)</li>
                <li>Нажми «Поделиться» (квадрат со стрелкой ⬆ внизу)</li>
                <li>Прокрути и выбери «На экран «Домой»»</li>
                <li>Открой с иконки рабочего стола, зайди в Настройки и включи пуши</li>
              </ol>
            )}
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-elevated/40 transition-colors flex-shrink-0"
            title="Скрыть на сутки"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-4 lg:mx-6 mt-3 rounded-2xl border border-accent/30 bg-accent/5 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="p-2 rounded-lg bg-accent/15 flex-shrink-0">
          <Bell className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-semibold text-text-primary">Включи уведомления, чтобы не пропускать новые заявки</p>
          <p className="text-caption text-text-secondary mt-0.5">
            Будут приходить как из мессенджера — даже когда сайт закрыт.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleEnable}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg gradient-accent text-white text-caption font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Включаю…' : 'Включить'}
          </button>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-elevated/40 transition-colors"
            title="Скрыть на сутки"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
