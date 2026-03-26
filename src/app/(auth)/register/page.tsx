'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Image from 'next/image'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [storeNumber, setStoreNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      toast.error('Введите корректный номер телефона')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const email = `${digits}@karidesk.ru`

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: digits,
          store_number: storeNumber || null,
        },
      },
    })

    if (error) {
      toast.error(error.message === 'User already registered'
        ? 'Этот номер уже зарегистрирован. Попробуйте войти.'
        : 'Ошибка регистрации: ' + error.message
      )
      setLoading(false)
      return
    }

    if (data.user) {
      toast.success('Регистрация прошла успешно!')
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] blob-primary opacity-20" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] blob-secondary opacity-15" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <Image src="/logo-kari-icon.png" alt="Kari" width={56} height={56} className="mx-auto mb-4" />
          <h1 className="text-heading-1 text-text-primary">Регистрация</h1>
          <p className="text-body-sm text-text-secondary mt-2">Создайте аккаунт для работы с заявками</p>
        </div>

        <form onSubmit={handleRegister} className="card-premium p-6 space-y-4">
          <Input
            label="ФИО"
            placeholder="Иванов Иван Иванович"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <Input
            label="Номер телефона"
            type="tel"
            placeholder="+7 (___) ___-__-__"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            helperText="Для связи по заявкам"
          />
          <Input
            label="Номер магазина"
            placeholder="Например: 10164"
            value={storeNumber}
            onChange={(e) => setStoreNumber(e.target.value)}
            helperText="Если вы сотрудник магазина"
          />
          <Input
            label="Пароль"
            type="password"
            placeholder="Минимум 6 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <Button type="submit" loading={loading} className="w-full">
            Зарегистрироваться
          </Button>
        </form>

        <p className="text-center text-body-sm text-text-secondary mt-6">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="text-accent hover:text-accent-hover transition-colors font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}
