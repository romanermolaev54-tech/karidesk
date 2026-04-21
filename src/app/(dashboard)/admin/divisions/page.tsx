'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { Division } from '@/types/database'
import { Shield, Edit3, Save, Plus, Building2 } from 'lucide-react'

export default function DivisionsPage() {
  const { isAdmin } = useAuth()
  const supabase = createClient()
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [editDiv, setEditDiv] = useState<Division | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => { loadDivisions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDivisions() {
    const { data } = await supabase.from('divisions').select('*').order('sort_order')
    if (data) setDivisions(data)
    setLoading(false)
  }

  const handleEdit = (div: Division) => {
    setEditDiv(div)
    setEditName(div.name)
    setEditCode(div.code || '')
    setIsNew(false)
  }

  const handleAdd = () => {
    setEditDiv({} as Division)
    setEditName('')
    setEditCode('')
    setIsNew(true)
  }

  const handleSave = async () => {
    setSaving(true)
    if (isNew) {
      const { data } = await supabase.from('divisions').insert({
        name: editName,
        code: editCode || null,
        sort_order: divisions.length + 1,
      }).select().single()
      if (data) setDivisions(prev => [...prev, data])
    } else if (editDiv?.id) {
      await supabase.from('divisions').update({ name: editName, code: editCode || null }).eq('id', editDiv.id)
      setDivisions(prev => prev.map(d => d.id === editDiv.id ? { ...d, name: editName, code: editCode } : d))
    }
    setEditDiv(null)
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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-2 text-text-primary">Подразделения</h1>
          <p className="text-body-sm text-text-tertiary">{divisions.length} подразделений</p>
        </div>
        <Button onClick={handleAdd} size="sm"><Plus className="w-4 h-4" />Добавить</Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-premium p-4 animate-pulse">
              <div className="h-4 bg-surface-elevated/60 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {divisions.map(d => (
            <div key={d.id} className="card-premium p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-body-sm font-medium text-text-primary">{d.name}</p>
                    {d.code && <p className="text-caption text-text-tertiary">{d.code}</p>}
                  </div>
                </div>
                <button onClick={() => handleEdit(d)} className="p-2 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!editDiv} onClose={() => setEditDiv(null)} title={isNew ? 'Новое подразделение' : 'Редактировать'}>
        <div className="space-y-4">
          <Input label="Название" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Центр 8" />
          <Input label="Код" value={editCode} onChange={e => setEditCode(e.target.value)} placeholder="center_8" />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditDiv(null)} className="flex-1">Отмена</Button>
            <Button onClick={handleSave} loading={saving} className="flex-1"><Save className="w-4 h-4" />Сохранить</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
