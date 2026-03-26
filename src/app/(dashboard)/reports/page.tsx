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
} from 'lucide-react'

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
