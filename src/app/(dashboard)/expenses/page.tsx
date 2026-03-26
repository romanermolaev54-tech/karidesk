'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { formatDateShort } from '@/lib/utils'
import type { OtherExpense, Division } from '@/types/database'
import {
  Plus,
  Calendar,
  Building2,
  Wallet,
} from 'lucide-react'

export default function ExpensesPage() {
  const { user, isAdmin } = useAuth()
  const supabase = createClient()

  const [expenses, setExpenses] = useState<OtherExpense[]>([])
  const [stores, setStores] = useState<{ id: string; store_number: string; name: string }[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Form
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const [expRes, storeRes, divRes] = await Promise.all([
      supabase.from('other_expenses').select(`
        *,
        division:divisions(name),
        store:stores(store_number, name),
        creator:profiles!other_expenses_created_by_fkey(full_name)
      `).order('expense_date', { ascending: false }).limit(50),
      supabase.from('stores').select('id, store_number, name').eq('is_active', true).order('store_number'),
      supabase.from('divisions').select('*').eq('is_active', true).order('sort_order'),
    ])
    if (expRes.data) setExpenses(expRes.data)
    if (storeRes.data) setStores(storeRes.data)
    if (divRes.data) setDivisions(divRes.data)
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!user || !description.trim() || !amount) return
    setSaving(true)

    await supabase.from('other_expenses').insert({
      description: description.trim(),
      amount: parseFloat(amount),
      division_id: divisionId || null,
      store_id: storeId || null,
      created_by: user.id,
    })

    setDescription('')
    setAmount('')
    setDivisionId('')
    setStoreId('')
    setSaving(false)
    setShowModal(false)
    loadData()
  }

  const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-2 text-text-primary">Прочие расходы</h1>
          <p className="text-body-sm text-text-tertiary">
            Итого: {totalAmount.toLocaleString('ru-RU')} руб.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" />
            Добавить
          </Button>
        )}
      </div>

      {/* Expenses list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-premium p-4 animate-pulse">
              <div className="h-4 bg-surface-elevated/60 rounded w-1/3 mb-2" />
              <div className="h-3 bg-surface-elevated/40 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <Wallet className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
          <p className="text-body text-text-secondary">Нет расходов</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map(exp => (
            <div key={exp.id} className="card-premium p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-medium text-text-primary">{exp.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    <span className="flex items-center gap-1 text-caption text-text-tertiary">
                      <Calendar className="w-3 h-3" />
                      {formatDateShort(exp.expense_date)}
                    </span>
                    {exp.store && (
                      <span className="flex items-center gap-1 text-caption text-text-tertiary">
                        <Building2 className="w-3 h-3" />
                        #{(exp.store as { store_number: string }).store_number} {(exp.store as { name: string }).name}
                      </span>
                    )}
                    {exp.division && (
                      <span className="text-caption text-text-tertiary">
                        {(exp.division as { name: string }).name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-body-sm font-semibold text-accent">
                    {Number(exp.amount).toLocaleString('ru-RU')} руб.
                  </p>
                  {exp.creator && (
                    <p className="text-micro text-text-tertiary mt-0.5">
                      {(exp.creator as { full_name: string }).full_name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Новый расход">
        <div className="space-y-4">
          <Textarea
            label="Описание"
            placeholder="На что потрачено..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
          />
          <Input
            label="Сумма (руб.)"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <Select
            label="Подразделение"
            placeholder="Выберите..."
            value={divisionId}
            onChange={e => setDivisionId(e.target.value)}
            options={divisions.map(d => ({ value: d.id, label: d.name }))}
          />
          <Select
            label="Магазин (необязательно)"
            placeholder="Выберите..."
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
            options={stores.map(s => ({ value: s.id, label: `#${s.store_number} ${s.name}` }))}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button
              onClick={handleCreate}
              loading={saving}
              disabled={!description.trim() || !amount}
              className="flex-1"
            >
              Добавить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
