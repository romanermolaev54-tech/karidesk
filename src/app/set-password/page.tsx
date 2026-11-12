'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

type Status = 'checking' | 'ready' | 'invalid' | 'expired' | 'used' | 'not_found' | 'missing_token'

const STATUS_MESSAGES: Record<Exclude<Status, 'checking' | 'ready'>, string> = {
  invalid: 'Ссылка недействительна.',
  expired: 'Срок действия ссылки истёк. Попросите новую ссылку у администратора.',
  used: 'Эта ссылка уже была использована. Попросите новую у администратора.',
  not_found: 'Ссылка не найдена. Возможно, её отменили.',
  missing_token: 'В ссылке нет токена. Проверьте, что скопировали её полностью.',
}

// useSearchParams() needs a Suspense boundary or the production build fails.
export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  )
}

function SetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''

  const [status, setStatus] = useState<Status>('checking')
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setStatus('missing_token'); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/set-password?token=${encodeURIComponent(token)}`)
        const j = await res.json()
        if (cancelled) return
        if (j.ok) {
          setStatus('ready')
          setEmail(j.email)
        } else {
          const reason = j.reason as Exclude<Status, 'checking' | 'ready'>
          setStatus(reason in STATUS_MESSAGES ? reason : 'invalid')
        }
      } catch {
        if (!cancelled) setStatus('invalid')
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Пароль должен содержать минимум 6 символов')
      return
    }
    if (password !== confirm) {
      toast.error('Пароли не совпадают')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || 'Не удалось сохранить пароль')
        setSubmitting(false)
        return
      }
      setDone(true)
      toast.success('Пароль установлен')
      setTimeout(() => router.push('/login'), 1800)
    } catch {
      toast.error('Ошибка сети')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] blob-primary opacity-20" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] blob-secondary opacity-15" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <Image src="/logo-kari-icon.png" alt="Kari" width={56} height={56} className="mx-auto mb-4" />
          <h1 className="text-heading-1 text-text-primary">Новый пароль</h1>
          {email && status === 'ready' && (
            <p className="text-body-sm text-text-secondary mt-2">
              для аккаунта <span className="text-text-primary font-medium">{email}</span>
            </p>
          )}
        </div>

        {status === 'checking' && (
          <div className="card-premium p-8 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <p className="text-body-sm text-text-secondary">Проверяем ссылку…</p>
          </div>
        )}

        {status !== 'checking' && status !== 'ready' && (
          <div className="card-premium p-6 space-y-4 text-center">
            <p className="text-body text-text-primary">{STATUS_MESSAGES[status]}</p>
            <Link
              href="/login"
              className="block w-full text-center gradient-accent text-white rounded-xl py-2.5 text-body-sm font-semibold"
            >
              На вход
            </Link>
          </div>
        )}

        {status === 'ready' && !done && (
          <form onSubmit={handleSubmit} className="card-premium p-6 space-y-5">
            <Input
              label="Новый пароль"
              type="password"
              placeholder="Минимум 6 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Input
              label="Повторите пароль"
              type="password"
              placeholder="Ещё раз тот же пароль"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Button type="submit" loading={submitting} className="w-full">
              Сохранить пароль
            </Button>
            <p className="text-caption text-text-tertiary text-center">
              Ссылка одноразовая — после сохранения станет недействительна.
            </p>
          </form>
        )}

        {done && (
          <div className="card-premium p-6 space-y-3 text-center">
            <p className="text-body text-text-primary">
              Пароль сохранён.
            </p>
            <p className="text-body-sm text-text-secondary">
              Сейчас перекину на вход…
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
