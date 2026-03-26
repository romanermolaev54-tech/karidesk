'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { Store, Division } from '@/types/database'
import {
  Search,
  MapPin,
  Building2,
  Phone,
  Edit3,
  Save,
} from 'lucide-react'

export default function StoresPage() {
  const { isAdmin } = useAuth()
  const supabase = createClient()

  const [stores, setStores] = useState<Store[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [divisionFilter, setDivisionFilter] = useState<string>('all')
  const [editStore, setEditStore] = useState<Store | null>(null)
  const [editAddress, setEditAddress] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [storesRes, divsRes] = await Promise.all([
        supabase.from('stores').select('*, division:divisions(*)').eq('is_active', true).order('store_number'),
        supabase.from('divisions').select('*').eq('is_active', true).order('sort_order'),
      ])
      if (storesRes.data) setStores(storesRes.data)
      if (divsRes.data) setDivisions(divsRes.data)
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = stores.filter(s => {
    const matchesSearch = !search.trim() ||
      s.store_number.includes(search) ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.city?.toLowerCase().includes(search.toLowerCase()) ||
      s.address?.toLowerCase().includes(search.toLowerCase())
    const matchesDivision = divisionFilter === 'all' || s.division_id === divisionFilter
    return matchesSearch && matchesDivision
  })

  const handleEdit = (store: Store) => {
    setEditStore(store)
    setEditAddress(store.address || '')
    setEditPhone(store.phone || '')
  }

  const handleSave = async () => {
    if (!editStore) return
    setSaving(true)
    await supabase
      .from('stores')
      .update({ address: editAddress || null, phone: editPhone || null, updated_at: new Date().toISOString() })
      .eq('id', editStore.id)

    setStores(prev => prev.map(s =>
      s.id === editStore.id ? { ...s, address: editAddress || null, phone: editPhone || null } : s
    ))
    setEditStore(null)
    setSaving(false)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-heading-2 text-text-primary">Справочник магазинов</h1>
        <p className="text-body-sm text-text-tertiary">{stores.length} магазинов</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          type="text"
          placeholder="Поиск по номеру, названию, городу, адресу..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 transition-all"
        />
      </div>

      {/* Division filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setDivisionFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-caption font-medium whitespace-nowrap transition-colors ${
            divisionFilter === 'all' ? 'gradient-accent text-white' : 'bg-surface-elevated/40 text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Все
        </button>
        {divisions.map(d => (
          <button
            key={d.id}
            onClick={() => setDivisionFilter(d.id)}
            className={`px-3 py-1.5 rounded-lg text-caption font-medium whitespace-nowrap transition-colors ${
              divisionFilter === d.id ? 'gradient-accent text-white' : 'bg-surface-elevated/40 text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {/* Stores list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="card-premium p-4 animate-pulse">
              <div className="h-4 bg-surface-elevated/60 rounded w-1/4 mb-2" />
              <div className="h-3 bg-surface-elevated/40 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(store => (
            <div key={store.id} className="card-premium p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body-sm font-semibold text-accent/80">#{store.store_number}</span>
                    <span className="text-body-sm font-medium text-text-primary truncate">{store.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    <span className="flex items-center gap-1 text-caption text-text-tertiary">
                      <MapPin className="w-3 h-3" />
                      {store.city || 'Не указан'}
                      {store.address && ` — ${store.address}`}
                    </span>
                    {store.phone && (
                      <span className="flex items-center gap-1 text-caption text-text-tertiary">
                        <Phone className="w-3 h-3" />
                        {store.phone}
                      </span>
                    )}
                  </div>
                  {store.division && (
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-micro font-medium bg-surface-elevated/60 text-text-tertiary">
                      {store.division.name}
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleEdit(store)}
                    className="p-2 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="card-premium p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
              <p className="text-body text-text-secondary">Магазинов не найдено</p>
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      <Modal isOpen={!!editStore} onClose={() => setEditStore(null)} title={`Магазин #${editStore?.store_number}`}>
        <div className="space-y-4">
          <Input
            label="Адрес"
            placeholder="Введите полный адрес..."
            value={editAddress}
            onChange={e => setEditAddress(e.target.value)}
          />
          <Input
            label="Телефон магазина"
            type="tel"
            placeholder="+7 ..."
            value={editPhone}
            onChange={e => setEditPhone(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditStore(null)} className="flex-1">
              Отмена
            </Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">
              <Save className="w-4 h-4" />
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
