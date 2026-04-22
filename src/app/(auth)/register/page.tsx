'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Image from 'next/image'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Search } from 'lucide-react'
import { loadStoresCached } from '@/lib/dictionaries'

interface StoreOption {
  id: string
  store_number: string
  name: string
  city: string | null
  division_id: string
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [storeSearch, setStoreSearch] = useState('')
  const [selectedStore, setSelectedStore] = useState<StoreOption | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [regMode, setRegMode] = useState<'open' | 'moderation'>('open')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const cached = await loadStoresCached(fresh => {
        if (!cancelled) setStores(fresh as unknown as StoreOption[])
      })
      if (!cancelled && cached.length) setStores(cached as unknown as StoreOption[])
    })()
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'registration_mode')
      .single()
      .then(({ data }) => {
        if (cancelled) return
        if (data && typeof data.value === 'string') {
          setRegMode(data.value === 'moderation' ? 'moderation' : 'open')
        }
      })
    return () => { cancelled = true }
  }, [])

  const filteredStores = useMemo(() => {
    if (!storeSearch.trim()) return stores.slice(0, 8)
    const q = storeSearch.toLowerCase()
    return stores
      .filter(s =>
        s.store_number.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q)
      )
      .slice(0, 10)
  }, [storeSearch, stores])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!selectedStore) {
      toast.error('Выберите магазин')
      setLoading(false)
      return
    }

    let digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      toast.error('Введите корректный номер телефона')
      setLoading(false)
      return
    }
    if (digits.length === 11 && digits.startsWith('8')) {
      digits = '7' + digits.slice(1)
    } else if (digits.length === 10) {
      digits = '7' + digits
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
          store_id: selectedStore.id,
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
      if (regMode === 'moderation') {
        // Sign out so the user can't enter until approved
        await supabase.auth.signOut()
        toast.success('Заявка на регистрацию отправлена. Ждите согласования директора.', { duration: 7000 })
        setLoading(false)
        setTimeout(() => router.push('/login'), 2000)
        return
      }
      toast.success('Регистрация прошла успешно!')
      await new Promise(r => setTimeout(r, 800))
      router.refresh()
      window.location.href = '/dashboard'
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
          <p className="text-body-sm text-text-secondary mt-2">
            {regMode === 'open'
              ? 'Создайте аккаунт для работы с заявками'
              : 'Регистрация сейчас на согласовании у ДП'}
          </p>
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
          />

          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-1.5">
              Магазин
              <span className="text-caption text-text-tertiary ml-1">(обязательно)</span>
            </label>
            {selectedStore ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-accent/40 bg-accent/5">
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-text-primary">
                    #{selectedStore.store_number} {selectedStore.name}
                  </p>
                  {selectedStore.city && (
                    <p className="text-caption text-text-tertiary truncate">{selectedStore.city}</p>
                  )}
                </div>
                <button type="button" onClick={() => setSelectedStore(null)} className="text-caption text-accent hover:underline flex-shrink-0">
                  Сменить
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Поиск: номер, название или город"
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 transition-all"
                  />
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {filteredStores.map(s => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setSelectedStore(s)}
                      className="w-full text-left p-2.5 rounded-lg hover:bg-surface-elevated/40 transition-colors"
                    >
                      <p className="text-body-sm text-text-primary">
                        <span className="font-semibold text-accent/80">#{s.store_number}</span> {s.name}
                      </p>
                      {s.city && <p className="text-caption text-text-tertiary">{s.city}</p>}
                    </button>
                  ))}
                  {filteredStores.length === 0 && (
                    <p className="text-caption text-text-tertiary text-center py-3">Ничего не найдено</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <Input
            label="Пароль"
            type="password"
            placeholder="Минимум 6 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {regMode === 'moderation' && (
            <p className="text-caption text-text-tertiary">
              Режим модерации: ваша заявка отправится на согласование директору подразделения.
              После одобрения вы сможете войти.
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full">
            {regMode === 'moderation' ? 'Отправить заявку' : 'Зарегистрироваться'}
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
