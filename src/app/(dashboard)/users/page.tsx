'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { USER_ROLES } from '@/lib/constants'
import type { Profile, UserRole, Division } from '@/types/database'
import toast from 'react-hot-toast'
import {
  Shield,
  Search,
  Lock,
  CheckCircle,
  Edit3,
  Save,
  UserCheck,
  ToggleLeft,
  ToggleRight,
  Users,
} from 'lucide-react'

type Mode = 'open' | 'moderation'

interface ExtendedProfile extends Profile {
  store?: { store_number: string; name: string } | null
  division?: { name: string } | null
}

export default function UsersPage() {
  const { profile, isAdmin, isDirector } = useAuth()
  const supabase = createClient()

  const [users, setUsers] = useState<ExtendedProfile[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all')
  const [divisionFilter, setDivisionFilter] = useState<'all' | string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'blocked'>('all')
  const [editUser, setEditUser] = useState<ExtendedProfile | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('employee')
  const [saving, setSaving] = useState(false)
  const [regMode, setRegMode] = useState<Mode>('open')
  const [regModeSaving, setRegModeSaving] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('profiles')
      .select('*, store:stores(store_number, name), division:divisions(name)')
      .order('created_at', { ascending: false })

    if (isDirector && profile?.division_id) {
      query = query.eq('division_id', profile.division_id)
    }

    const { data } = await query
    setUsers((data as ExtendedProfile[] | null) || [])
    setLoading(false)
  }, [supabase, isDirector, profile?.division_id])

  useEffect(() => {
    if (!profile) return
    loadUsers()
    if (isAdmin) {
      supabase.from('divisions').select('*').order('sort_order').then(({ data }) => {
        if (data) setDivisions(data as Division[])
      })
      supabase.from('app_settings').select('value').eq('key', 'registration_mode').single().then(({ data }) => {
        if (data && typeof data.value === 'string') {
          setRegMode(data.value === 'moderation' ? 'moderation' : 'open')
        }
      })
    }
  }, [profile, isAdmin, loadUsers, supabase])

  const toggleRegMode = async () => {
    const next: Mode = regMode === 'open' ? 'moderation' : 'open'
    setRegModeSaving(true)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'registration_mode', value: next, updated_at: new Date().toISOString(), updated_by: profile?.id })
    setRegModeSaving(false)
    if (error) { toast.error('Ошибка: ' + error.message); return }
    setRegMode(next)
    toast.success(next === 'moderation' ? 'Регистрация закрыта (через согласование ДП)' : 'Регистрация открыта')
  }

  const toggleActive = async (u: ExtendedProfile, next: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (error) { toast.error('Ошибка: ' + error.message); return }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: next } : x))
    toast.success(next ? `${u.full_name} одобрен` : `${u.full_name} заблокирован`)
  }

  const handleEditRole = (u: ExtendedProfile) => {
    setEditUser(u)
    setEditRole(u.role)
  }

  const handleSaveRole = async () => {
    if (!editUser) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ role: editRole, updated_at: new Date().toISOString() })
      .eq('id', editUser.id)
    if (error) { toast.error('Ошибка: ' + error.message); setSaving(false); return }
    setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, role: editRole } : u))
    toast.success('Роль изменена')
    setEditUser(null)
    setSaving(false)
  }

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (divisionFilter !== 'all' && u.division_id !== divisionFilter) return false
      if (statusFilter === 'active' && u.is_active !== true) return false
      if (statusFilter === 'pending' && u.is_active !== false) return false
      if (statusFilter === 'blocked' && u.is_active !== false) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hit =
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.phone || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.store?.store_number || '').toLowerCase().includes(q) ||
          (u.store?.name || '').toLowerCase().includes(q)
        if (!hit) return false
      }
      return true
    })
  }, [users, roleFilter, divisionFilter, statusFilter, search])

  const counts = useMemo(() => ({
    total: users.length,
    pending: users.filter(u => !u.is_active).length,
  }), [users])

  if (!isAdmin && !isDirector) {
    return (
      <div className="card-premium p-8 text-center animate-fade-in">
        <Shield className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
        <p className="text-body text-text-secondary">Доступ только для администраторов и ДП</p>
      </div>
    )
  }

  const roleColors: Record<UserRole, 'accent' | 'info' | 'default' | 'warning'> = {
    admin: 'accent',
    director: 'info',
    employee: 'default',
    contractor: 'warning',
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-heading-2 text-text-primary flex items-center gap-2">
          <Users className="w-6 h-6 text-accent" />
          Пользователи
        </h1>
        <p className="text-body-sm text-text-tertiary">
          {counts.total} всего{counts.pending > 0 && <>, <span className="text-amber-400">{counts.pending} ожидают одобрения</span></>}
        </p>
      </div>

      {/* Admin-only: registration mode toggle */}
      {isAdmin && (
        <div className="card-premium p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="text-heading-3 text-text-primary">Режим регистрации</h2>
              <p className="text-body-sm text-text-secondary mt-1">
                {regMode === 'open'
                  ? 'Любой пользователь может зарегистрироваться и сразу войти'
                  : 'После регистрации аккаунт ждёт одобрения ДП подразделения магазина'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleRegMode}
              disabled={regModeSaving}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:border-accent/40 transition-colors disabled:opacity-60"
            >
              {regMode === 'open' ? (
                <ToggleRight className="w-8 h-8 text-accent" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-text-tertiary" />
              )}
              <span className="text-body-sm font-medium text-text-primary">
                {regMode === 'open' ? 'Открытая' : 'По согласованию'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-premium p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Поиск по имени, телефону, магазину..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as 'all' | UserRole)}
            className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-1.5 text-body-sm text-text-primary"
          >
            <option value="all">Все роли</option>
            {Object.entries(USER_ROLES).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          {isAdmin && (
            <select
              value={divisionFilter}
              onChange={e => setDivisionFilter(e.target.value)}
              className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-1.5 text-body-sm text-text-primary"
            >
              <option value="all">Все подразделения</option>
              {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'pending' | 'blocked')}
            className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-1.5 text-body-sm text-text-primary"
          >
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="pending">Ожидают / заблокированы</option>
          </select>
        </div>
      </div>

      {/* Users list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card-premium p-4 animate-pulse">
              <div className="h-4 bg-surface-elevated/60 rounded w-1/3 mb-2" />
              <div className="h-3 bg-surface-elevated/40 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
          <p className="text-body text-text-secondary">Никто не подходит под фильтр</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id} className="card-premium p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    u.is_active ? 'gradient-accent' : 'bg-surface-elevated/60'
                  }`}>
                    <span className={`text-body-sm font-semibold ${u.is_active ? 'text-white' : 'text-text-tertiary'}`}>
                      {u.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-body-sm font-medium text-text-primary">{u.full_name}</p>
                      <Badge variant={roleColors[u.role]} size="sm">
                        {USER_ROLES[u.role]?.label}
                      </Badge>
                      {!u.is_active && (
                        <Badge variant="warning" size="sm" dot>На согласовании / заблокирован</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-caption text-text-tertiary flex-wrap">
                      <span>{u.phone}</span>
                      {u.store && <span>#{u.store.store_number} {u.store.name}</span>}
                      {u.division && <span>· {u.division.name}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!u.is_active ? (
                    <Button size="sm" onClick={() => toggleActive(u, true)}>
                      <CheckCircle className="w-4 h-4" />
                      Одобрить
                    </Button>
                  ) : (
                    <button
                      onClick={() => toggleActive(u, false)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/5 transition-colors"
                      title="Заблокировать"
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleEditRole(u)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors"
                      title="Изменить роль"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit role modal (admin only) */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title="Изменить роль">
        {editUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-muted/30 border border-border">
              <UserCheck className="w-5 h-5 text-text-tertiary" />
              <div>
                <p className="text-body-sm font-medium text-text-primary">{editUser.full_name}</p>
                <p className="text-caption text-text-tertiary">{editUser.phone}</p>
              </div>
            </div>
            <Select
              label="Роль"
              value={editRole}
              onChange={e => setEditRole(e.target.value as UserRole)}
              options={Object.entries(USER_ROLES).map(([value, { label }]) => ({ value, label }))}
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditUser(null)} className="flex-1">Отмена</Button>
              <Button onClick={handleSaveRole} loading={saving} className="flex-1">
                <Save className="w-4 h-4" />
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
