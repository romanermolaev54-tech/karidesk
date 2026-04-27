'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Shield, Edit3, Save, Plus, Tags } from 'lucide-react'
import toast from 'react-hot-toast'
import { invalidateDictionaries } from '@/lib/dictionaries'

interface Category {
  id: string
  name: string
  icon: string | null
  color: string | null
  sort_order: number
  is_active: boolean
  default_deadline_hours: number | null
  hint: string | null
  external_url: string | null
}

export default function CategoriesPage() {
  const { isAdmin } = useAuth()
  const supabase = createClient()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editDeadline, setEditDeadline] = useState('')
  const [editHint, setEditHint] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => { loadCategories() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCategories() {
    const { data } = await supabase.from('ticket_categories').select('*').order('sort_order')
    if (data) setCategories(data)
    setLoading(false)
  }

  const handleEdit = (cat: Category) => {
    setEditCat(cat)
    setEditName(cat.name)
    setEditColor(cat.color || '')
    setEditDeadline(cat.default_deadline_hours?.toString() || '')
    setEditHint(cat.hint || '')
    setEditUrl(cat.external_url || '')
    setIsNew(false)
  }

  const handleAdd = () => {
    setEditCat({} as Category)
    setEditName('')
    setEditColor('#64748B')
    setEditDeadline('')
    setEditHint('')
    setEditUrl('')
    setIsNew(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      name: editName,
      color: editColor || null,
      default_deadline_hours: editDeadline ? parseInt(editDeadline) : null,
      hint: editHint.trim() || null,
      external_url: editUrl.trim() || null,
    }
    if (isNew) {
      const { data, error } = await supabase.from('ticket_categories').insert({
        ...payload,
        sort_order: categories.length + 1,
      }).select().single()
      if (error) { toast.error('Ошибка: ' + error.message); setSaving(false); return }
      if (data) setCategories(prev => [...prev, data])
      toast.success('Категория добавлена')
    } else if (editCat?.id) {
      const { error } = await supabase.from('ticket_categories').update(payload).eq('id', editCat.id)
      if (error) { toast.error('Ошибка: ' + error.message); setSaving(false); return }
      setCategories(prev => prev.map(c => c.id === editCat.id ? { ...c, ...payload } : c))
      toast.success('Сохранено')
    }
    setEditCat(null)
    setSaving(false)
    invalidateDictionaries() // so /tickets/new picks up the new hint/URL on next load
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
          <h1 className="text-heading-2 text-text-primary">Категории заявок</h1>
          <p className="text-body-sm text-text-tertiary">{categories.length} категорий</p>
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
          {categories.map(c => (
            <div key={c.id} className="card-premium p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: (c.color || '#64748B') + '20' }}>
                    <Tags className="w-5 h-5" style={{ color: c.color || '#64748B' }} />
                  </div>
                  <div>
                    <p className="text-body-sm font-medium text-text-primary">{c.name}</p>
                    {c.default_deadline_hours && (
                      <p className="text-caption text-text-tertiary">Дедлайн: {c.default_deadline_hours}ч</p>
                    )}
                  </div>
                </div>
                <button onClick={() => handleEdit(c)} className="p-2 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!editCat} onClose={() => setEditCat(null)} title={isNew ? 'Новая категория' : 'Редактировать'}>
        <div className="space-y-4">
          <Input label="Название" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Сантехника" />
          <Input label="Цвет (HEX)" value={editColor} onChange={e => setEditColor(e.target.value)} placeholder="#34D399" />
          <Input label="Дедлайн (часы)" type="number" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} placeholder="48" />

          <div className="border-t border-border pt-4 space-y-4">
            <p className="text-caption text-text-tertiary">
              Подсказка показывается магазину сразу после выбора этой категории на шаге создания заявки. Можно дать совет, ссылку на каталог или предупреждение.
            </p>
            <div>
              <label className="block text-body-sm font-medium text-text-secondary mb-2">Подсказка для магазина</label>
              <textarea
                value={editHint}
                onChange={e => setEditHint(e.target.value)}
                rows={3}
                placeholder="Например: Если знаете точно, что нужно — закажите через каталог. Это быстрее. Если не получилось — продолжайте заявку здесь."
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40"
              />
            </div>
            <Input
              label="Ссылка (опционально)"
              type="url"
              value={editUrl}
              onChange={e => setEditUrl(e.target.value)}
              placeholder="https://catalog.kari.com/..."
            />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditCat(null)} className="flex-1">Отмена</Button>
            <Button onClick={handleSave} loading={saving} className="flex-1"><Save className="w-4 h-4" />Сохранить</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
