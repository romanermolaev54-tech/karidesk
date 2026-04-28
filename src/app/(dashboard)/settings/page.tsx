'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { USER_ROLES } from '@/lib/constants'
import {
  User,
  Mail,
  Shield,
  LogOut,
  Save,
  KeyRound,
  Gavel,
  Bell,
  BellOff,
  Smartphone,
  Send,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { isPushSupported, getPushPermission, subscribeToPush, unsubscribeFromPush, isSubscribed, isIos, isStandalone } from '@/lib/push'

function DiagRow({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        : <XCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
      <span className="text-text-secondary flex-1">{label}</span>
      {hint && <span className="text-text-tertiary">{hint}</span>}
    </div>
  )
}

export default function SettingsPage() {
  const { user, profile, role, isDirector } = useAuth()
  const supabase = createClient()
  const router = useRouter()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')

  // Sync the form to the profile once it arrives. This handles the case
  // where the page mounts before useAuth has resolved (`profile` was null
  // at first render, useState froze fields at empty). Re-syncing on
  // profile.id transitions only — never clobbers the user's in-progress
  // edits while they're typing on the same profile.
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setPhone(profile.phone || '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [approvalSaving, setApprovalSaving] = useState(false)
  const [divisionName, setDivisionName] = useState('')
  const [pushState, setPushState] = useState<'unknown' | 'unsupported' | 'denied' | 'enabled' | 'disabled' | 'needs-pwa'>('unknown')
  const [pushBusy, setPushBusy] = useState(false)
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [diag, setDiag] = useState<{ swRegistered: boolean; permission: string; subscribed: boolean; isPwa: boolean; isIos: boolean }>({
    swRegistered: false, permission: 'default', subscribed: false, isPwa: false, isIos: false,
  })

  useEffect(() => {
    const refresh = async () => {
      const swRegistered = typeof window !== 'undefined' && 'serviceWorker' in navigator
        ? !!(await navigator.serviceWorker.getRegistration('/sw.js'))
        : false
      const permission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
      const subscribed = await isSubscribed()
      setDiag({ swRegistered, permission, subscribed, isPwa: isStandalone(), isIos: isIos() })
    }
    refresh()
  }, [pushState])

  const handleTestPush = async () => {
    setTestSending(true)
    try {
      const r = await fetch('/api/push/test', { method: 'POST' })
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        toast.error('Ошибка: ' + (t || r.status))
        return
      }
      toast.success('Тест отправлен — push должен прийти за 2-3 секунды')
    } finally {
      setTestSending(false)
    }
  }

  useEffect(() => {
    const check = async () => {
      if (!isPushSupported()) {
        // iOS Safari outside PWA: PushManager not exposed unless installed on home screen
        if (isIos() && !isStandalone()) {
          setPushState('needs-pwa')
          setIosNeedsInstall(true)
          return
        }
        setPushState('unsupported')
        return
      }
      const perm = getPushPermission()
      if (perm === 'denied') { setPushState('denied'); return }
      const has = await isSubscribed()
      setPushState(has ? 'enabled' : 'disabled')
    }
    check()
  }, [])

  const handleEnablePush = async () => {
    setPushBusy(true)
    const res = await subscribeToPush()
    setPushBusy(false)
    if (res.ok) {
      setPushState('enabled')
      toast.success('Уведомления включены')
    } else {
      toast.error(res.reason || 'Не удалось включить')
      if (getPushPermission() === 'denied') setPushState('denied')
    }
  }

  const handleDisablePush = async () => {
    setPushBusy(true)
    await unsubscribeFromPush()
    setPushBusy(false)
    setPushState('disabled')
    toast.success('Уведомления выключены')
  }

  useEffect(() => {
    if (!isDirector || !profile?.division_id) return
    supabase
      .from('divisions')
      .select('name, requires_approval')
      .eq('id', profile.division_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setRequiresApproval(!!data.requires_approval)
          setDivisionName(data.name)
        }
      })
  }, [isDirector, profile?.division_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprovalToggle = async (next: boolean) => {
    if (!profile?.division_id) return
    setApprovalSaving(true)
    const prev = requiresApproval
    setRequiresApproval(next)
    const { error } = await supabase
      .from('divisions')
      .update({ requires_approval: next })
      .eq('id', profile.division_id)
    setApprovalSaving(false)
    if (error) {
      setRequiresApproval(prev)
      toast.error('Не удалось сохранить: ' + error.message)
      return
    }
    toast.success(next ? 'Согласование включено' : 'Согласование выключено')
  }

  const handleSave = async () => {
    if (!user) return
    const trimmedName = fullName.trim()
    const trimmedPhone = phone.trim()
    if (!trimmedName) {
      toast.error('Введите ФИО')
      return
    }
    if (!trimmedPhone) {
      toast.error('Введите телефон')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: trimmedName, phone: trimmedPhone, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      // Without this surfacing, the user used to see "Сохранено" even when
      // the DB rejected the update (RLS / NOT NULL / etc.) and walked away
      // thinking it worked.
      toast.error('Не удалось сохранить: ' + error.message)
      return
    }
    // Patch the useAuth localStorage cache so subsequent navigations don't
    // overwrite our just-saved form with a 24-hour-old cached version.
    try {
      const raw = localStorage.getItem('karidesk_profile_v1')
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; userId: string; profile: Record<string, unknown> }
        if (cached.userId === user.id && cached.profile) {
          cached.profile.full_name = trimmedName
          cached.profile.phone = trimmedPhone
          cached.ts = Date.now()
          localStorage.setItem('karidesk_profile_v1', JSON.stringify(cached))
          sessionStorage.setItem('karidesk_profile_v1', JSON.stringify(cached))
        }
      }
    } catch { /* cache patch is best-effort */ }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    toast.success('Сохранено')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast.error('Пароль должен содержать минимум 6 символов')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Пароли не совпадают')
      return
    }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    toast.success('Пароль изменён')
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-heading-2 text-text-primary">Настройки</h1>

      {/* Profile card */}
      <div className="card-premium p-5 space-y-4">
        <h2 className="text-heading-3 text-text-primary flex items-center gap-2">
          <User className="w-5 h-5 text-text-tertiary" />
          Профиль
        </h2>

        <Input
          label="Полное имя"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
        />

        <Input
          label="Телефон"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />

        <div>
          <label className="block text-body-sm font-medium text-text-secondary mb-2">Email</label>
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-muted/30 border border-border">
            <Mail className="w-4 h-4 text-text-tertiary" />
            <span className="text-body-sm text-text-tertiary">{user?.email || '—'}</span>
          </div>
        </div>

        <div>
          <label className="block text-body-sm font-medium text-text-secondary mb-2">Роль</label>
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-muted/30 border border-border">
            <Shield className="w-4 h-4 text-text-tertiary" />
            <span className="text-body-sm text-text-tertiary">
              {role ? USER_ROLES[role]?.label : '—'}
            </span>
          </div>
        </div>

        <Button onClick={handleSave} loading={saving} className="w-full">
          <Save className="w-4 h-4" />
          {saved ? 'Сохранено!' : 'Сохранить'}
        </Button>
      </div>

      {/* Push notifications */}
      <div className="card-premium p-5 space-y-3">
        <h2 className="text-heading-3 text-text-primary flex items-center gap-2">
          {pushState === 'enabled' ? <Bell className="w-5 h-5 text-accent" /> : <BellOff className="w-5 h-5 text-text-tertiary" />}
          Push-уведомления
        </h2>
        <p className="text-body-sm text-text-secondary">
          Получайте уведомления, даже когда сайт закрыт, — как в обычном мессенджере.
        </p>

        {iosNeedsInstall && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-400" />
              <p className="text-body-sm font-semibold text-text-primary">Для iPhone: установи сайт на главный экран</p>
            </div>
            <ol className="list-decimal list-inside text-caption text-text-secondary space-y-0.5 pl-1">
              <li>Открой сайт в <b>Safari</b> (не Chrome)</li>
              <li>Нажми «Поделиться» (квадрат со стрелкой вверх)</li>
              <li>Выбери «На экран Домой»</li>
              <li>Открой приложение с экрана и вернись сюда — кнопка «Включить» станет доступной</li>
            </ol>
          </div>
        )}

        {pushState === 'unsupported' && (
          <p className="text-caption text-text-tertiary">Твой браузер не поддерживает web push. Попробуй Chrome / Safari.</p>
        )}
        {pushState === 'denied' && (
          <p className="text-caption text-amber-400">
            Ты заблокировал уведомления в браузере. Чтобы включить: Настройки браузера → Уведомления → разреши для 24karidesk.ru.
          </p>
        )}
        {pushState === 'disabled' && (
          <Button onClick={handleEnablePush} loading={pushBusy} className="w-full">
            <Bell className="w-4 h-4" />
            Включить push-уведомления
          </Button>
        )}
        {pushState === 'enabled' && (
          <div className="space-y-2">
            <Button onClick={handleTestPush} loading={testSending} className="w-full">
              <Send className="w-4 h-4" />
              Отправить тестовое уведомление
            </Button>
            <Button variant="secondary" onClick={handleDisablePush} loading={pushBusy} className="w-full">
              <BellOff className="w-4 h-4" />
              Выключить push-уведомления
            </Button>
          </div>
        )}

        {/* Diagnostics — useful when "не приходит" чтобы понять, где затык */}
        <details className="group">
          <summary className="cursor-pointer text-caption text-text-tertiary hover:text-text-secondary list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
            Диагностика
          </summary>
          <div className="mt-2 rounded-lg border border-border bg-surface-elevated/30 p-3 space-y-1 text-caption font-mono">
            <DiagRow label="Браузер поддерживает push" ok={isPushSupported() || !diag.isIos} />
            <DiagRow label="Установлено как PWA" ok={diag.isPwa || !diag.isIos} hint={diag.isIos && !diag.isPwa ? 'на iPhone обязательно' : undefined} />
            <DiagRow label="Разрешение от системы" ok={diag.permission === 'granted'} hint={diag.permission} />
            <DiagRow label="Service Worker зарегистрирован" ok={diag.swRegistered} />
            <DiagRow label="Подписка на push активна" ok={diag.subscribed} />
          </div>
        </details>
      </div>

      {/* Director approval toggle */}
      {isDirector && (
        <div className="card-premium p-5 space-y-3">
          <h2 className="text-heading-3 text-text-primary flex items-center gap-2">
            <Gavel className="w-5 h-5 text-text-tertiary" />
            Согласование заявок
          </h2>
          <p className="text-body-sm text-text-secondary">
            Если включено, все новые заявки из магазинов подразделения <span className="font-semibold text-text-primary">{divisionName || '—'}</span> будут сначала приходить вам на согласование.
          </p>
          <p className="text-caption text-text-tertiary">
            Срочные заявки всегда обходят согласование — идут в работу сразу.
          </p>
          <label className="flex items-center justify-between gap-3 pt-2 cursor-pointer">
            <span className="text-body-sm font-medium text-text-primary">
              {requiresApproval ? 'Включено' : 'Выключено'}
            </span>
            <span
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                requiresApproval ? 'bg-accent' : 'bg-surface-elevated/60'
              } ${approvalSaving ? 'opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={requiresApproval}
                disabled={approvalSaving}
                onChange={e => handleApprovalToggle(e.target.checked)}
              />
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  requiresApproval ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
          </label>
        </div>
      )}

      {/* Password change */}
      <div className="card-premium p-5 space-y-4">
        <h2 className="text-heading-3 text-text-primary flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-text-tertiary" />
          Сменить пароль
        </h2>
        <Input
          label="Новый пароль"
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          placeholder="Минимум 6 символов"
          autoComplete="new-password"
        />
        <Input
          label="Повторите новый пароль"
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        <Button onClick={handlePasswordChange} loading={changingPassword} className="w-full" disabled={!newPassword || !confirmPassword}>
          <KeyRound className="w-4 h-4" />
          Изменить пароль
        </Button>
      </div>

      {/* Maintenance — refresh app cache */}
      <div className="card-premium p-5 space-y-3">
        <h2 className="text-heading-3 text-text-primary">Обновить приложение</h2>
        <p className="text-body-sm text-text-secondary">
          Если что-то отображается не свежее или приложение «зависло» — обновите кеш.
          Не сбрасывает ни ваш аккаунт, ни данные.
        </p>
        <Button
          variant="secondary"
          onClick={() => { window.location.href = '/reset' }}
          className="w-full"
        >
          Обновить кеш и перезайти
        </Button>
      </div>

      {/* Logout */}
      <div className="card-premium p-5">
        <Button variant="danger" onClick={handleLogout} className="w-full">
          <LogOut className="w-4 h-4" />
          Выйти из аккаунта
        </Button>
      </div>
    </div>
  )
}
