'use client'

import { useState } from 'react'
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
} from 'lucide-react'

export default function SettingsPage() {
  const { user, profile, role } = useAuth()
  const supabase = createClient()
  const router = useRouter()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ full_name: fullName, phone, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
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
