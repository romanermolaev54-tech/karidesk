'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Image from 'next/image'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()

    const trimmed = identifier.trim().toLowerCase()
    let email: string
    if (trimmed.includes('@')) {
      email = trimmed
    } else {
      let digits = trimmed.replace(/\D/g, '')
      if (digits.length === 11 && digits.startsWith('8')) {
        digits = '7' + digits.slice(1)
      } else if (digits.length === 10) {
        digits = '7' + digits
      }
      email = `${digits}@karidesk.ru`
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      toast.error('Неверный логин или пароль')
      setLoading(false)
      return
    }

    toast.success('Добро пожаловать!')
    router.refresh()
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] blob-primary opacity-20" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] blob-secondary opacity-15" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <Image src="/logo-kari-icon.png" alt="Kari" width={56} height={56} className="mx-auto mb-4" />
          <h1 className="text-heading-1 text-text-primary">KariDesk</h1>
          <p className="text-body-sm text-text-secondary mt-2">Войдите в свой аккаунт</p>
        </div>

        <form onSubmit={handleLogin} className="card-premium p-6 space-y-5">
          <Input
            label="Телефон или email"
            type="text"
            placeholder="+7 999 123-45-67 или name@kari.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            label="Пароль"
            type="password"
            placeholder="Введите пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" loading={loading} className="w-full">
            Войти
          </Button>
        </form>

        <p className="text-center text-body-sm text-text-secondary mt-6">
          Нет аккаунта?{' '}
          <Link href="/register" className="text-accent hover:text-accent-hover transition-colors font-medium">
            Регистрация
          </Link>
        </p>
      </div>
    </div>
  )
}
