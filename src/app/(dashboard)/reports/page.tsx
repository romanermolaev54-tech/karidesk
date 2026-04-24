'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { TICKET_STATUSES } from '@/lib/constants'
import { loadStoresCached, loadCategoriesCached, loadDivisionsCached } from '@/lib/dictionaries'
import type { TicketStatus, Store, Division, TicketCategory } from '@/types/database'
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Building2,
  FileSpreadsheet,
  FileDown,
  Filter,
  RotateCcw,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function previousMonthValue(): string {
  const now = new Date()
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const m = now.getMonth() === 0 ? 12 : now.getMonth()
  return `${y}-${String(m).padStart(2, '0')}`
}

function monthOptions(count = 12): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  for (let i = 0; i < count; i++) {
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
    opts.push({
      value: `${y}-${String(m).padStart(2, '0')}`,
      label: `${MONTH_NAMES_RU[m - 1]} ${y}`,
    })
  }
  return opts
}

async function downloadFromUrl(url: string, fallbackName: string) {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/i)
  const name = match ? match[1] : fallbackName
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

interface AnalyticsTicket {
  status: TicketStatus
  priority: string
  division_id: string | null
  category_id: string | null
  store_id: string | null
  assigned_to: string | null
  created_at: string
  completed_at: string | null
  division?: { name: string } | null
  category?: { name: string } | null
  store?: { store_number: string; name: string } | null
  assignee?: { full_name: string } | null
}

export default function ReportsPage() {
  const { profile, isAdmin, isDirector } = useAuth()
  const supabase = createClient()

  const [tickets, setTickets] = useState<AnalyticsTicket[]>([])
  const [loading, setLoading] = useState(true)

  // Dictionaries for filter selects
  const [stores, setStores] = useState<Store[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])

  // Filters
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000)
  const [filterFrom, setFilterFrom] = useState<string>(isoDate(thirtyDaysAgo))
  const [filterTo, setFilterTo] = useState<string>(isoDate(today))
  const [filterDivision, setFilterDivision] = useState<string>('all')
  const [filterStore, setFilterStore] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [storeSearch, setStoreSearch] = useState<string>('')

  // Excel exports state
  const [exportScope, setExportScope] = useState<'all' | 'active' | 'completed'>('all')
  const [exportRows, setExportRows] = useState(8)
  const [templateMonth, setTemplateMonth] = useState<string>(previousMonthValue())
  const [downloading, setDownloading] = useState<'tickets' | 'template' | null>(null)

  // Load dictionaries (cached)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [s, c, d] = await Promise.all([
        loadStoresCached(fresh => { if (!cancelled) setStores(fresh) }),
        loadCategoriesCached(fresh => { if (!cancelled) setCategories(fresh) }),
        loadDivisionsCached(fresh => { if (!cancelled) setDivisions(fresh) }),
      ])
      if (!cancelled) {
        if (s.length) setStores(s)
        if (c.length) setCategories(c)
        if (d.length) setDivisions(d)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Director сам себя ограничивает своим подразделением — фиксируем filterDivision
  useEffect(() => {
    if (isDirector && profile?.division_id) {
      setFilterDivision(profile.division_id)
    }
  }, [isDirector, profile?.division_id])

  const loadData = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tickets')
      .select(`
        status, priority, division_id, category_id, store_id, assigned_to, created_at, completed_at,
        division:divisions(name),
        category:ticket_categories(name),
        store:stores(store_number, name),
        assignee:profiles!tickets_assigned_to_fkey(full_name)
      `)
      .neq('status', 'merged')

    if (filterFrom) query = query.gte('created_at', filterFrom)
    if (filterTo) query = query.lte('created_at', `${filterTo}T23:59:59`)
    if (filterDivision !== 'all') query = query.eq('division_id', filterDivision)
    if (filterStore !== 'all') query = query.eq('store_id', filterStore)
    if (filterCategory !== 'all') query = query.eq('category_id', filterCategory)
    if (isDirector && profile?.division_id) query = query.eq('division_id', profile.division_id)

    const { data, error } = await query
    setLoading(false)
    if (error) { toast.error('Ошибка загрузки: ' + error.message); return }
    // Supabase returns joined relations as arrays — flatten to single objects
    const flat: AnalyticsTicket[] = ((data as unknown as Array<Record<string, unknown>>) || []).map(t => {
      const pick = <T,>(v: unknown): T | null => {
        if (!v) return null
        if (Array.isArray(v)) return (v[0] as T | undefined) ?? null
        return v as T
      }
      return {
        ...t,
        division: pick<{ name: string }>(t.division),
        category: pick<{ name: string }>(t.category),
        store: pick<{ store_number: string; name: string }>(t.store),
        assignee: pick<{ full_name: string }>(t.assignee),
      } as AnalyticsTicket
    })
    setTickets(flat)
  }, [supabase, filterFrom, filterTo, filterDivision, filterStore, filterCategory, isDirector, profile?.division_id])

  useEffect(() => { loadData() }, [loadData])

  // Stores filtered by chosen division and search query
  const visibleStores = useMemo(() => {
    let list = stores
    if (filterDivision !== 'all') list = list.filter(s => s.division_id === filterDivision)
    if (storeSearch.trim()) {
      const q = storeSearch.trim().toLowerCase()
      list = list.filter(s =>
        s.store_number.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q),
      )
    }
    return list.slice(0, 50)
  }, [stores, filterDivision, storeSearch])

  // Aggregations
  const aggregates = useMemo(() => {
    const byStatus: Record<string, number> = {}
    const divMap: Record<string, number> = {}
    const catMap: Record<string, number> = {}
    const storeMap: Record<string, { num: string; name: string; count: number }> = {}
    const assigneeMap: Record<string, { name: string; total: number; completed: number; avgDays: number; daysAcc: number; daysN: number }> = {}
    let totalDays = 0
    let completedCount = 0
    let urgent = 0

    tickets.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1
      const divName = t.division?.name || 'Не указано'
      divMap[divName] = (divMap[divName] || 0) + 1
      const catName = t.category?.name || 'Не указано'
      catMap[catName] = (catMap[catName] || 0) + 1
      if (t.store) {
        const k = t.store.store_number
        if (!storeMap[k]) storeMap[k] = { num: t.store.store_number, name: t.store.name, count: 0 }
        storeMap[k].count++
      }
      if (t.priority === 'urgent') urgent++
      if (t.completed_at && t.created_at) {
        const days = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 86_400_000
        totalDays += days
        completedCount++
      }
      if (t.assigned_to && t.assignee?.full_name) {
        const k = t.assigned_to
        if (!assigneeMap[k]) assigneeMap[k] = { name: t.assignee.full_name, total: 0, completed: 0, avgDays: 0, daysAcc: 0, daysN: 0 }
        const row = assigneeMap[k]
        row.total++
        if (t.status === 'completed' || t.status === 'verified' || t.status === 'partially_completed') {
          row.completed++
          if (t.completed_at && t.created_at) {
            row.daysAcc += (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 86_400_000
            row.daysN++
          }
        }
      }
    })

    Object.values(assigneeMap).forEach(a => {
      a.avgDays = a.daysN > 0 ? Math.round(a.daysAcc / a.daysN * 10) / 10 : 0
    })

    return {
      total: tickets.length,
      byStatus,
      urgent,
      avgCompletionDays: completedCount > 0 ? Math.round(totalDays / completedCount * 10) / 10 : 0,
      byDivision: Object.entries(divMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byCategory: Object.entries(catMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byStore: Object.values(storeMap).sort((a, b) => b.count - a.count).slice(0, 15),
      byAssignee: Object.values(assigneeMap).sort((a, b) => b.total - a.total),
    }
  }, [tickets])

  const summaryCards = [
    { label: 'Всего заявок', value: aggregates.total, icon: BarChart3, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Срочных', value: aggregates.urgent, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Выполнено', value: (aggregates.byStatus['completed'] || 0) + (aggregates.byStatus['verified'] || 0) + (aggregates.byStatus['partially_completed'] || 0), icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Ср. дней', value: aggregates.avgCompletionDays, icon: Clock, color: 'text-accent', bg: 'bg-accent/10' },
  ]

  const resetFilters = () => {
    setFilterFrom(isoDate(thirtyDaysAgo))
    setFilterTo(isoDate(today))
    if (!isDirector) setFilterDivision('all')
    setFilterStore('all')
    setFilterCategory('all')
    setStoreSearch('')
  }

  async function handleTicketsExport() {
    try {
      setDownloading('tickets')
      const qs = new URLSearchParams({ scope: exportScope, from: filterFrom, to: filterTo })
      await downloadFromUrl(`/api/reports/tickets-export?${qs}`, `tickets_${exportScope}.xlsx`)
      toast.success('Файл загружен')
    } catch (e) {
      toast.error(`Ошибка: ${(e as Error).message}`)
    } finally {
      setDownloading(null)
    }
  }

  async function handleTemplateExport() {
    try {
      setDownloading('template')
      const qs = new URLSearchParams({ month: templateMonth, rows: String(exportRows) })
      await downloadFromUrl(`/api/reports/estimate-template?${qs}`, `estimate_template_${templateMonth}.xlsx`)
      toast.success('Шаблон сметы готов')
    } catch (e) {
      toast.error(`Ошибка: ${(e as Error).message}`)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-heading-2 text-text-primary">Отчёты и аналитика</h1>
        <p className="text-body-sm text-text-tertiary">
          {isDirector ? `Подразделение: ${profile?.full_name ? '' : ''}` : 'Все подразделения и магазины'}
        </p>
      </div>

      {/* Filters */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-heading-3 text-text-primary flex items-center gap-2">
            <Filter className="w-5 h-5 text-accent" />
            Фильтры
          </h2>
          <button
            onClick={resetFilters}
            className="text-caption text-text-tertiary hover:text-accent flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сбросить
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-tertiary">Период с</span>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-tertiary">По</span>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-tertiary">Подразделение</span>
            <select
              value={filterDivision}
              onChange={e => { setFilterDivision(e.target.value); setFilterStore('all') }}
              disabled={isDirector}
              className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary disabled:opacity-60"
            >
              <option value="all">Все подразделения</option>
              {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-tertiary">Тип работ</span>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
            >
              <option value="all">Все категории</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-caption text-text-tertiary">Магазин</span>
          {filterStore !== 'all' ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-accent/40 bg-accent/5">
              {(() => {
                const s = stores.find(x => x.id === filterStore)
                return (
                  <span className="text-body-sm text-text-primary">
                    {s ? `#${s.store_number} ${s.name}` : 'Магазин'}
                  </span>
                )
              })()}
              <button onClick={() => setFilterStore('all')} className="text-caption text-accent hover:underline">
                Сбросить
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Все магазины · поиск по номеру / названию / городу"
                value={storeSearch}
                onChange={e => setStoreSearch(e.target.value)}
                className="w-full bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
              />
              {storeSearch.trim() && (
                <div className="max-h-44 overflow-y-auto space-y-1 border border-border rounded-lg p-2 bg-surface-muted/30">
                  {visibleStores.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setFilterStore(s.id); setStoreSearch('') }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-elevated/40 text-body-sm text-text-primary"
                    >
                      <span className="text-accent/80 font-semibold">#{s.store_number}</span> {s.name}
                      {s.city && <span className="text-caption text-text-tertiary"> · {s.city}</span>}
                    </button>
                  ))}
                  {visibleStores.length === 0 && (
                    <p className="text-caption text-text-tertiary text-center py-2">Не найдено</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map(card => (
          <div key={card.label} className="card-premium p-4">
            <div className={`p-2 rounded-xl ${card.bg} w-fit mb-3`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            {loading ? (
              <div className="h-8 w-12 rounded bg-surface-elevated/50 animate-pulse" />
            ) : (
              <p className="text-heading-2 text-text-primary">{card.value}</p>
            )}
            <p className="text-caption text-text-tertiary mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* By status + by category in same row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-premium p-5">
          <h2 className="text-heading-3 text-text-primary mb-4">По статусам</h2>
          <div className="space-y-3">
            {(Object.keys(TICKET_STATUSES) as TicketStatus[]).map(status => {
              const count = aggregates.byStatus[status] || 0
              if (count === 0 && status === 'merged') return null
              const pct = aggregates.total > 0 ? (count / aggregates.total) * 100 : 0
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-body-sm text-text-secondary">{TICKET_STATUSES[status].label}</span>
                    <span className="text-body-sm font-medium text-text-primary">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-elevated/40 overflow-hidden">
                    <div
                      className="h-full rounded-full gradient-accent transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card-premium p-5">
          <h2 className="text-heading-3 text-text-primary mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-text-tertiary" />
            По типам работ
          </h2>
          <div className="space-y-2">
            {aggregates.byCategory.map(c => (
              <div key={c.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-elevated/20">
                <span className="text-body-sm text-text-secondary">{c.name}</span>
                <span className="text-body-sm font-semibold text-text-primary">{c.count}</span>
              </div>
            ))}
            {aggregates.byCategory.length === 0 && !loading && (
              <p className="text-body-sm text-text-tertiary text-center py-4">Нет данных</p>
            )}
          </div>
        </div>
      </div>

      {/* By division + by store */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!isDirector && (
          <div className="card-premium p-5">
            <h2 className="text-heading-3 text-text-primary mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-text-tertiary" />
              По подразделениям
            </h2>
            <div className="space-y-2">
              {aggregates.byDivision.map(d => (
                <div key={d.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-elevated/20">
                  <span className="text-body-sm text-text-secondary">{d.name}</span>
                  <span className="text-body-sm font-semibold text-text-primary">{d.count}</span>
                </div>
              ))}
              {aggregates.byDivision.length === 0 && !loading && (
                <p className="text-body-sm text-text-tertiary text-center py-4">Нет данных</p>
              )}
            </div>
          </div>
        )}

        <div className={`card-premium p-5 ${isDirector ? 'lg:col-span-2' : ''}`}>
          <h2 className="text-heading-3 text-text-primary mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-text-tertiary" />
            Топ магазинов по числу заявок
          </h2>
          <div className="space-y-2">
            {aggregates.byStore.map(s => (
              <div key={s.num} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-elevated/20">
                <span className="text-body-sm text-text-secondary">
                  <span className="text-accent/80 font-semibold">#{s.num}</span> {s.name}
                </span>
                <span className="text-body-sm font-semibold text-text-primary">{s.count}</span>
              </div>
            ))}
            {aggregates.byStore.length === 0 && !loading && (
              <p className="text-body-sm text-text-tertiary text-center py-4">Нет данных</p>
            )}
          </div>
        </div>
      </div>

      {/* By assignee — only admin */}
      {isAdmin && (
        <div className="card-premium p-5">
          <h2 className="text-heading-3 text-text-primary mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-text-tertiary" />
            По исполнителям
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-text-tertiary text-caption border-b border-border">
                  <th className="text-left py-2 pr-3 font-medium">Исполнитель</th>
                  <th className="text-right py-2 px-3 font-medium">Назначено</th>
                  <th className="text-right py-2 px-3 font-medium">Закрыто</th>
                  <th className="text-right py-2 px-3 font-medium">Конверсия</th>
                  <th className="text-right py-2 pl-3 font-medium">Ср. дней</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.byAssignee.map(a => {
                  const conv = a.total > 0 ? Math.round(a.completed / a.total * 100) : 0
                  return (
                    <tr key={a.name} className="border-b border-border/30 hover:bg-surface-elevated/20">
                      <td className="py-2 pr-3 text-text-primary">{a.name}</td>
                      <td className="py-2 px-3 text-right text-text-secondary">{a.total}</td>
                      <td className="py-2 px-3 text-right text-text-secondary">{a.completed}</td>
                      <td className="py-2 px-3 text-right text-text-primary font-medium">{conv}%</td>
                      <td className="py-2 pl-3 text-right text-text-secondary">{a.avgDays || '—'}</td>
                    </tr>
                  )
                })}
                {aggregates.byAssignee.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-text-tertiary">Нет данных</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Excel exports — без изменений, фильтры периода берутся из общего фильтра */}
      <div className="card-premium p-5 space-y-5">
        <div>
          <h2 className="text-heading-3 text-text-primary flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-accent" />
            Excel экспорт
          </h2>
          <p className="text-caption text-text-tertiary mt-1">
            Период из фильтров выше применяется к выгрузке заявок
          </p>
        </div>

        <div className="rounded-xl border border-surface-elevated/40 p-4 space-y-3">
          <h3 className="text-body-sm font-semibold text-text-primary">Отчёт по заявкам за период</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-text-tertiary">Что выгружать</span>
              <select
                value={exportScope}
                onChange={e => setExportScope(e.target.value as 'all' | 'active' | 'completed')}
                className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
              >
                <option value="all">Все заявки</option>
                <option value="active">Действующие</option>
                <option value="completed">Выполненные</option>
              </select>
            </label>
            <div className="flex flex-col gap-1 justify-end text-caption text-text-tertiary">
              <span>{filterFrom} → {filterTo}</span>
            </div>
            <button
              onClick={handleTicketsExport}
              disabled={downloading !== null}
              className="gradient-accent text-white rounded-lg px-4 py-2 text-body-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FileDown className="w-4 h-4" />
              {downloading === 'tickets' ? 'Формирую…' : 'Скачать Excel'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-surface-elevated/40 p-4 space-y-3">
          <h3 className="text-body-sm font-semibold text-text-primary">Шаблон сметы за месяц</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-text-tertiary">Месяц</span>
              <select
                value={templateMonth}
                onChange={e => setTemplateMonth(e.target.value)}
                className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
              >
                {monthOptions(12).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-text-tertiary">Пустых строк на ТЦ</span>
              <input
                type="number"
                min={3}
                max={30}
                value={exportRows}
                onChange={e => setExportRows(Math.max(3, Math.min(30, parseInt(e.target.value || '8', 10))))}
                className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
              />
            </label>
            <div className="lg:col-span-2 flex items-end">
              <button
                onClick={handleTemplateExport}
                disabled={downloading !== null}
                className="w-full gradient-accent text-white rounded-lg px-4 py-2 text-body-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                {downloading === 'template' ? 'Формирую…' : 'Скачать шаблон'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
