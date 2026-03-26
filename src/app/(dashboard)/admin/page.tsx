'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { USER_ROLES } from '@/lib/constants'
import type { Profile, UserRole } from '@/types/database'
import {
  Shield,
  Edit3,
  Save,
  UserCheck,
} from 'lucide-react'

export default function AdminPage() {
  const { isAdmin } = useAuth()
  const supabase = createClient()

  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('employee')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadUsers()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setUsers(data)
    setLoading(false)
  }

  const handleEdit = (user: Profile) => {
    setEditUser(user)
    setEditRole(user.role)
  }

  const handleSave = async () => {
    if (!editUser) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ role: editRole, updated_at: new Date().toISOString() })
      .eq('id', editUser.id)

    setUsers(prev => prev.map(u =>
      u.id === editUser.id ? { ...u, role: editRole } : u
    ))
    setEditUser(null)
    setSaving(false)
  }

  if (!isAdmin) {
    return (
      <div className="card-premium p-8 text-center animate-fade-in">
        <Shield className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
        <p className="text-body text-text-secondary">Доступ только для администраторов</p>
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
        <h1 className="text-heading-2 text-text-primary">Администрирование</h1>
        <p className="text-body-sm text-text-tertiary">{users.length} пользователей</p>
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
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="card-premium p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center flex-shrink-0">
                    <span className="text-body-sm font-semibold text-white">
                      {u.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-text-primary truncate">{u.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-caption text-text-tertiary">{u.phone}</span>
                      <Badge variant={roleColors[u.role]} size="sm">
                        {USER_ROLES[u.role]?.label}
                      </Badge>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleEdit(u)}
                  className="p-2 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit role modal */}
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
              <Button variant="secondary" onClick={() => setEditUser(null)} className="flex-1">
                Отмена
              </Button>
              <Button onClick={handleSave} loading={saving} className="flex-1">
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
