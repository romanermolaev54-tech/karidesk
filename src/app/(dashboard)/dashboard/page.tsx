'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatTicketNumber } from '@/lib/utils'
import { TICKET_STATUSES } from '@/lib/constants'
import Link from 'next/link'
import type { Ticket } from '@/types/database'
import {
  TicketPlus,
  ClipboardList,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'

export default function DashboardPage() {
  const { user, profile, role, isDirector, isContractor } = useAuth()
  const supabase = createClient()

  const [recentTickets, setRecentTickets] = useState<Ticket[]>([])
  const [counts, setCounts] = useState({ new: 0, in_progress: 0, completed: 0, urgent: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user, role]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!user) return

    // Load recent tickets
    let query = supabase
      .from('tickets')
      .select(`
        *,
        store:stores(id, store_number, name),
        category:ticket_categories(id, name, color)
      `)
      .order('created_at', { ascending: false })
      .limit(5)

    if (role === 'employee') {
      query = query.eq('created_by', user.id)
    } else if (role === 'contractor') {
      query = query.eq('assigned_to', user.id)
    } else if (isDirector && profile?.division_id) {
      query = query.eq('division_id', profile.division_id)
    }

    const { data: tickets } = await query
    setRecentTickets(tickets || [])

    // Load counts
    let countQuery = supabase.from('tickets').select('status, priority')
    if (role === 'employee') {
      countQuery = countQuery.eq('created_by', user.id)
    } else if (role === 'contractor') {
      countQuery = countQuery.eq('assigned_to', user.id)
    } else if (isDirector && profile?.division_id) {
      countQuery = countQuery.eq('division_id', profile.division_id)
    }

    const { data: allTickets } = await countQuery
    if (allTickets) {
      setCounts({
        new: allTickets.filter(t => t.status === 'new').length,
        in_progress: allTickets.filter(t => ['assigned', 'in_progress'].includes(t.status)).length,
        completed: allTickets.filter(t => ['completed', 'verified'].includes(t.status)).length,
        urgent: allTickets.filter(t => t.priority === 'urgent').length,
      })
    }

    setLoading(false)
  }

  const stats = [
    { label: 'Новые', value: counts.new, icon: TicketPlus, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'В работе', value: counts.in_progress, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Выполнено', value: counts.completed, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Срочные', value: counts.urgent, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-heading-1 text-text-primary">
            Привет, {profile?.full_name?.split(' ')[0] || 'Пользователь'}!
          </h1>
          <p className="text-body text-text-secondary mt-1">
            Обзор заявок и активности
          </p>
        </div>
        {(role === 'employee' || role === 'admin') && (
          <Link href="/tickets/new">
            <Button size="lg">
              <TicketPlus className="w-5 h-5" />
              Новая заявка
            </Button>
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card-premium p-4 lg:p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-heading-1 text-text-primary">
              {loading ? '—' : stat.value}
            </p>
            <p className="text-body-sm text-text-secondary mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card-premium p-5 lg:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-heading-3 text-text-primary">Быстрые действия</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {role === 'employee' && (
            <>
              <Link href="/tickets/new" className="card-interactive p-4 flex items-center gap-3">
                <div className="p-2 rounded-xl gradient-accent-soft">
                  <TicketPlus className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-body-sm font-medium text-text-primary">Создать заявку</p>
                  <p className="text-caption text-text-tertiary">Подать новую заявку</p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-tertiary" />
              </Link>
              <Link href="/my-tickets" className="card-interactive p-4 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/10">
                  <ClipboardList className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-body-sm font-medium text-text-primary">Мои заявки</p>
                  <p className="text-caption text-text-tertiary">Отслеживать статус</p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-tertiary" />
              </Link>
            </>
          )}
          {(role === 'admin' || role === 'director') && (
            <>
              <Link href="/tickets" className="card-interactive p-4 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/10">
                  <ClipboardList className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-body-sm font-medium text-text-primary">Все заявки</p>
                  <p className="text-caption text-text-tertiary">Управление заявками</p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-tertiary" />
              </Link>
              <Link href="/reports" className="card-interactive p-4 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-body-sm font-medium text-text-primary">Отчёты</p>
                  <p className="text-caption text-text-tertiary">Аналитика и статистика</p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-tertiary" />
              </Link>
            </>
          )}
          {isContractor && (
            <Link href="/work" className="card-interactive p-4 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-body-sm font-medium text-text-primary">Мои задания</p>
                <p className="text-caption text-text-tertiary">Назначенные заявки</p>
              </div>
              <ArrowRight className="w-4 h-4 text-text-tertiary" />
            </Link>
          )}
        </div>
      </div>

      {/* Recent tickets */}
      <div className="card-premium p-5 lg:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-heading-3 text-text-primary">Последние заявки</h2>
          <Link href={role === 'employee' ? '/my-tickets' : role === 'contractor' ? '/work' : '/tickets'}>
            <Button variant="ghost" size="sm">
              Все заявки
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex gap-3 p-3">
                <div className="h-3 bg-surface-elevated/60 rounded w-16" />
                <div className="h-3 bg-surface-elevated/40 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : recentTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated/50 flex items-center justify-center mb-4">
              <ClipboardList className="w-8 h-8 text-text-tertiary" />
            </div>
            <p className="text-body text-text-secondary">Заявок пока нет</p>
            <p className="text-body-sm text-text-tertiary mt-1">Создайте первую заявку</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTickets.map(ticket => {
              const statusInfo = TICKET_STATUSES[ticket.status]
              return (
                <Link
                  key={ticket.id}
                  href={`/tickets/${ticket.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-elevated/20 transition-colors"
                >
                  <span className="text-body-sm font-semibold text-accent/80 w-14 flex-shrink-0">
                    {formatTicketNumber(ticket.ticket_number)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm text-text-primary truncate">{ticket.description}</p>
                    {ticket.store && (
                      <p className="text-caption text-text-tertiary">
                        #{ticket.store.store_number} {ticket.store.name}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={statusInfo.color as 'info' | 'warning' | 'success' | 'danger' | 'accent'}
                    size="sm"
                  >
                    {statusInfo.label}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
