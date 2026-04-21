'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { TICKET_STATUSES } from '@/lib/constants'
import type { TicketStatus } from '@/types/database'
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Building2,
  FileSpreadsheet,
  FileDown,
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

export default function ReportsPage() {
  const { profile, isDirector } = useAuth()
  const supabase = createClient()

  const [stats, setStats] = useState({
    total: 0,
    byStatus: {} as Record<string, number>,
    byDivision: [] as { name: string; count: number }[],
    byCategory: [] as { name: string; count: number }[],
    avgCompletionDays: 0,
  })
  const [loading, setLoading] = useState(true)

  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000)
  const [exportFrom, setExportFrom] = useState<string>(isoDate(thirtyDaysAgo))
  const [exportTo, setExportTo] = useState<string>(isoDate(today))
  const [exportScope, setExportScope] = useState<'all' | 'active' | 'completed'>('all')
  const [exportRows, setExportRows] = useState(8)
  const [templateMonth, setTemplateMonth] = useState<string>(previousMonthValue())
  const [downloading, setDownloading] = useState<'tickets' | 'template' | null>(null)

  async function handleTicketsExport() {
    try {
      setDownloading('tickets')
      const qs = new URLSearchParams({ scope: exportScope, from: exportFrom, to: exportTo })
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

  useEffect(() => {
    loadStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStats() {
    let query = supabase.from('tickets').select(`
      status, priority, division_id, category_id, created_at, completed_at,
      division:divisions(name),
      category:ticket_categories(name)
    `)

    if (isDirector && profile?.division_id) {
      query = query.eq('division_id', profile.division_id)
    }

    const { data: tickets } = await query
    if (!tickets) { setLoading(false); return }

    const byStatus: Record<string, number> = {}
    const divMap: Record<string, number> = {}
    const catMap: Record<string, number> = {}
    let totalDays = 0
    let completedCount = 0

    tickets.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1
      const divName = (t.division as unknown as { name: string } | null)?.name || 'Не указано'
      divMap[divName] = (divMap[divName] || 0) + 1
      const catName = (t.category as unknown as { name: string } | null)?.name || 'Не указано'
      catMap[catName] = (catMap[catName] || 0) + 1

      if (t.completed_at && t.created_at) {
        const days = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24)
        totalDays += days
        completedCount++
      }
    })

    setStats({
      total: tickets.length,
      byStatus,
      byDivision: Object.entries(divMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byCategory: Object.entries(catMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      avgCompletionDays: completedCount > 0 ? Math.round(totalDays / completedCount * 10) / 10 : 0,
    })
    setLoading(false)
  }

  const summaryCards = [
    { label: 'Всего заявок', value: stats.total, icon: BarChart3, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Новых', value: stats.byStatus['new'] || 0, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Выполнено', value: (stats.byStatus['completed'] || 0) + (stats.byStatus['verified'] || 0), icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Ср. дней', value: stats.avgCompletionDays, icon: Clock, color: 'text-accent', bg: 'bg-accent/10' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-heading-2 text-text-primary">Отчёты</h1>
        <p className="text-body-sm text-text-tertiary">Аналитика по заявкам</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map(card => (
          <div key={card.label} className="card-premium p-4">
            <div className={`p-2 rounded-xl ${card.bg} w-fit mb-3`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <p className="text-heading-2 text-text-primary">{loading ? '—' : card.value}</p>
            <p className="text-caption text-text-tertiary mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Excel exports */}
      <div className="card-premium p-5 space-y-5">
        <div>
          <h2 className="text-heading-3 text-text-primary flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-accent" />
            Excel экспорт
          </h2>
          <p className="text-caption text-text-tertiary mt-1">
            Отчёт по заявкам за период или шаблон сметы за завершённый месяц
          </p>
        </div>

        {/* Tickets export */}
        <div className="rounded-xl border border-surface-elevated/40 p-4 space-y-3">
          <h3 className="text-body-sm font-semibold text-text-primary">Отчёт по заявкам за период</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-text-tertiary">Период</span>
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
            <label className="flex flex-col gap-1">
              <span className="text-caption text-text-tertiary">
                {exportScope === 'completed' ? 'Выполнены с' : 'Созданы с'}
              </span>
              <input
                type="date"
                value={exportFrom}
                onChange={e => setExportFrom(e.target.value)}
                className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-text-tertiary">По</span>
              <input
                type="date"
                value={exportTo}
                onChange={e => setExportTo(e.target.value)}
                className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
              />
            </label>
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

        {/* Estimate template */}
        <div className="rounded-xl border border-surface-elevated/40 p-4 space-y-3">
          <h3 className="text-body-sm font-semibold text-text-primary">Шаблон сметы за месяц</h3>
          <p className="text-caption text-text-tertiary">
            Для каждого магазина, где были выполнены заявки в выбранном месяце, формируется блок
            с датой, названием ТЦ, номером магазина и пустыми строками для заполнения работ.
          </p>
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

      {/* By status */}
      <div className="card-premium p-5">
        <h2 className="text-heading-3 text-text-primary mb-4">По статусам</h2>
        <div className="space-y-3">
          {(Object.keys(TICKET_STATUSES) as TicketStatus[]).map(status => {
            const count = stats.byStatus[status] || 0
            const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
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

      {/* By division */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-premium p-5">
          <h2 className="text-heading-3 text-text-primary mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-text-tertiary" />
            По подразделениям
          </h2>
          <div className="space-y-2">
            {stats.byDivision.map(d => (
              <div key={d.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-elevated/20">
                <span className="text-body-sm text-text-secondary">{d.name}</span>
                <span className="text-body-sm font-semibold text-text-primary">{d.count}</span>
              </div>
            ))}
            {stats.byDivision.length === 0 && !loading && (
              <p className="text-body-sm text-text-tertiary text-center py-4">Нет данных</p>
            )}
          </div>
        </div>

        <div className="card-premium p-5">
          <h2 className="text-heading-3 text-text-primary mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-text-tertiary" />
            По категориям
          </h2>
          <div className="space-y-2">
            {stats.byCategory.map(c => (
              <div key={c.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-elevated/20">
                <span className="text-body-sm text-text-secondary">{c.name}</span>
                <span className="text-body-sm font-semibold text-text-primary">{c.count}</span>
              </div>
            ))}
            {stats.byCategory.length === 0 && !loading && (
              <p className="text-body-sm text-text-tertiary text-center py-4">Нет данных</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
