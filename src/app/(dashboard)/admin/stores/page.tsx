'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import type { Division } from '@/types/database'
import { Shield, Edit3, Save, Plus, Store, Search, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

interface StoreItem {
  id: string
  store_number: string
  name: string
  city: string | null
  address: string | null
  phone: string | null
  division_id: string
  is_active: boolean
  divisions?: { name: string }
}

export default function AdminStoresPage() {
  const { isAdmin } = useAuth()
  const supabase = createClient()
  const [stores, setStores] = useState<StoreItem[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDiv, setFilterDiv] = useState('')
  const [editStore, setEditStore] = useState<StoreItem | null>(null)
  const [form, setForm] = useState({ store_number: '', name: '', city: '', address: '', phone: '', division_id: '' })
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const [storeRes, divRes] = await Promise.all([
      supabase.from('stores').select('*, divisions(name)').order('store_number'),
      supabase.from('divisions').select('*').order('sort_order'),
    ])
    if (storeRes.data) setStores(storeRes.data)
    if (divRes.data) setDivisions(divRes.data)
    setLoading(false)
  }

  const handleEdit = (s: StoreItem) => {
    setEditStore(s)
    setForm({ store_number: s.store_number, name: s.name, city: s.city || '', address: s.address || '', phone: s.phone || '', division_id: s.division_id })
    setIsNew(false)
  }

  const handleAdd = () => {
    setEditStore({} as StoreItem)
    setForm({ store_number: '', name: '', city: '', address: '', phone: '', division_id: divisions[0]?.id || '' })
    setIsNew(true)
  }

  const handleSave = async () => {
    setSaving(true)
    if (isNew) {
      const { data, error } = await supabase.from('stores').insert({
        store_number: form.store_number,
        name: form.name,
        city: form.city || null,
        address: form.address || null,
        phone: form.phone || null,
        division_id: form.division_id,
      }).select('*, divisions(name)').single()
      if (error) { toast.error('Ошибка: ' + error.message); setSaving(false); return }
      if (data) setStores(prev => [...prev, data])
      toast.success('Магазин добавлен')
    } else if (editStore?.id) {
      const { error } = await supabase.from('stores').update({
        name: form.name,
        city: form.city || null,
        address: form.address || null,
        phone: form.phone || null,
        division_id: form.division_id,
      }).eq('id', editStore.id)
      if (error) { toast.error('Ошибка: ' + error.message); setSaving(false); return }
      setStores(prev => prev.map(s => s.id === editStore.id ? { ...s, ...form, divisions: divisions.find(d => d.id === form.division_id) ? { name: divisions.find(d => d.id === form.division_id)!.name } : s.divisions } : s))
      toast.success('Сохранено')
    }
    setEditStore(null)
    setSaving(false)
  }

  const filtered = stores.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.store_number.includes(q) || s.name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q)
    const matchDiv = !filterDiv || s.division_id === filterDiv
    return matchSearch && matchDiv
  })

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
          <h1 className="text-heading-2 text-text-primary">Управление магазинами</h1>
          <p className="text-body-sm text-text-tertiary">{stores.length} магазинов</p>
        </div>
        <Button onClick={handleAdd} size="sm"><Plus className="w-4 h-4" />Добавить</Button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Поиск по номеру, названию..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-elevated/40 border border-border text-body-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/40"
          />
        </div>
        <select
          value={filterDiv}
          onChange={e => setFilterDiv(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface-elevated/40 border border-border text-body-sm text-text-primary"
        >
          <option value="">Все центры</option>
          {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

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
          <p className="text-caption text-text-tertiary">Показано {filtered.length} из {stores.length}</p>
          {filtered.map(s => (
            <div key={s.id} className="card-premium p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Store className="w-5 h-5 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-body-sm font-medium text-text-primary">№{s.store_number}</p>
                      <Badge variant="default" size="sm">{s.divisions?.name}</Badge>
                    </div>
                    <p className="text-caption text-text-tertiary truncate">{s.name}</p>
                    {s.address && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-text-tertiary" />
                        <p className="text-caption text-text-tertiary truncate">{s.address}</p>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => handleEdit(s)} className="p-2 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!editStore} onClose={() => setEditStore(null)} title={isNew ? 'Новый магазин' : 'Редактировать магазин'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Номер" value={form.store_number} onChange={e => setForm(p => ({ ...p, store_number: e.target.value }))} placeholder="10164" disabled={!isNew} />
            <Input label="Город" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Москва" />
          </div>
          <Input label="Название" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ТРЦ Европолис" />
          <Input label="Адрес" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="ул. Мира 211к2" />
          <Input label="Телефон" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+7..." />
          <Select
            label="Подразделение"
            value={form.division_id}
            onChange={e => setForm(p => ({ ...p, division_id: e.target.value }))}
            options={divisions.map(d => ({ value: d.id, label: d.name }))}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditStore(null)} className="flex-1">Отмена</Button>
            <Button onClick={handleSave} loading={saving} className="flex-1"><Save className="w-4 h-4" />Сохранить</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
