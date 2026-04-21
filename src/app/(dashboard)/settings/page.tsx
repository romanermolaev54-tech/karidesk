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
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user, profile, role, isDirector } = useAuth()
  const supabase = createClient()
  const router = useRouter()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [approvalSaving, setApprovalSaving] = useState(false)
  const [divisionName, setDivisionName] = useState('')

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

  const handlePasswordChange = async () => {
    if (newPassword.length < 4) {
      toast.error('Пароль должен содержать минимум 4 символа')
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
          placeholder="Минимум 4 символа"
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
