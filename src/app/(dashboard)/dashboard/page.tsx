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
  Siren,
  TrendingUp,
  ArrowRight,
  ChevronRight,
  Inbox,
} from 'lucide-react'

export default function DashboardPage() {
  const { user, profile, role, isDirector, isContractor } = useAuth()
  const supabase = createClient()

  const [recentTickets, setRecentTickets] = useState<Ticket[]>([])
  const [counts, setCounts] = useState({ new: 0, in_progress: 0, completed: 0, emergency: 0, total_active: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user, role]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!user) return

    // Build all 5 queries up front, then fire them in parallel. Previously this
    // ran sequentially (recent tickets → then counts), which doubled the
    // perceived load time on every dashboard render. The counts query also
    // pulled every ticket row just to count statuses in JS — now we use HEAD
    // requests with count=exact, so PostgREST returns just a number.
    //
    // Same role-scope is applied to each query. RLS already enforces this on
    // the server (since the 2026-04-27 tighten_rls migration); the client
    // filter still helps PostgREST pick the right index.
    let recent = supabase
      .from('tickets')
      .select('*, store:stores(id, store_number, name), category:ticket_categories(id, name, color)')
      .order('created_at', { ascending: false })
      .limit(5)
    let cNew         = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'new')
    let cInProg      = supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', ['assigned', 'in_progress'])
    let cDone        = supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', ['completed', 'verified'])
    // "Аварийные" used to mean priority=urgent, which magazines abused. Now
    // it's the per-ticket emergency flag — admin-curated, accurate.
    let cEmergency   = supabase.from('tickets').select('id', { count: 'exact', head: true })
      .eq('is_emergency', true)
      .not('status', 'in', '(verified,rejected,merged)')
    // "Всего активных" — anything that isn't already closed/merged. Lets the
    // user immediately see workload without doing the math.
    let cTotalActive = supabase.from('tickets').select('id', { count: 'exact', head: true })
      .not('status', 'in', '(verified,rejected,merged)')

    if (role === 'employee') {
      recent = recent.eq('created_by', user.id)
      cNew = cNew.eq('created_by', user.id)
      cInProg = cInProg.eq('created_by', user.id)
      cDone = cDone.eq('created_by', user.id)
      cEmergency = cEmergency.eq('created_by', user.id)
      cTotalActive = cTotalActive.eq('created_by', user.id)
    } else if (role === 'contractor') {
      recent = recent.eq('assigned_to', user.id)
      cNew = cNew.eq('assigned_to', user.id)
      cInProg = cInProg.eq('assigned_to', user.id)
      cDone = cDone.eq('assigned_to', user.id)
      cEmergency = cEmergency.eq('assigned_to', user.id)
      cTotalActive = cTotalActive.eq('assigned_to', user.id)
    } else if (isDirector && profile?.division_id) {
      recent = recent.eq('division_id', profile.division_id)
      cNew = cNew.eq('division_id', profile.division_id)
      cInProg = cInProg.eq('division_id', profile.division_id)
      cDone = cDone.eq('division_id', profile.division_id)
      cEmergency = cEmergency.eq('division_id', profile.division_id)
      cTotalActive = cTotalActive.eq('division_id', profile.division_id)
    }

    const [recentRes, newRes, inProgRes, doneRes, emRes, totalRes] = await Promise.all([
      recent, cNew, cInProg, cDone, cEmergency, cTotalActive,
    ])

    setRecentTickets(recentRes.data || [])
    setCounts({
      new: newRes.count || 0,
      in_progress: inProgRes.count || 0,
      completed: doneRes.count || 0,
      emergency: emRes.count || 0,
      total_active: totalRes.count || 0,
    })
    setLoading(false)
  }

  const baseList = role === 'employee' ? '/my-tickets' : role === 'contractor' ? '/work' : '/tickets'
  const isAdminOrDir = role === 'admin' || role === 'director'

  const stats = [
    {
      label: 'Всего активных',
      value: counts.total_active,
      icon: Inbox,
      color: 'text-text-primary',
      bg: 'bg-surface-elevated/40',
      href: baseList,
    },
    {
      label: 'Новые',
      value: counts.new,
      icon: TicketPlus,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      href: isAdminOrDir ? `${baseList}?status=new` : baseList,
    },
    {
      label: 'В работе',
      value: counts.in_progress,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      href: isAdminOrDir ? `${baseList}?status=in_progress` : baseList,
    },
    {
      label: 'Выполнено',
      value: counts.completed,
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      href: isAdminOrDir ? `${baseList}?status=completed` : baseList,
    },
    {
      label: 'Аварийные',
      value: counts.emergency,
      icon: Siren,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      href: isAdminOrDir ? `${baseList}?emergency=1` : baseList,
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-heading-1 text-text-primary">
            {profile?.full_name
              ? `Привет, ${profile.full_name.split(' ')[0]}!`
              : 'Привет!'}
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="card-interactive p-4 lg:p-5 block transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            {loading ? (
              <div className="h-9 w-12 rounded-md bg-surface-elevated/50 animate-pulse" />
            ) : (
              <p className="text-heading-1 text-text-primary">{stat.value}</p>
            )}
            <p className="text-body-sm text-text-secondary mt-1">{stat.label}</p>
          </Link>
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
                  {ticket.status === 'new' && ticket.category ? (
                    <span
                      className="px-2 py-0.5 rounded-md text-caption font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: (ticket.category.color || '#64748B') + '20',
                        color: ticket.category.color || '#94a3b8',
                      }}
                    >
                      {ticket.category.name}
                    </span>
                  ) : (
                    <Badge
                      variant={statusInfo.color as 'info' | 'warning' | 'success' | 'danger' | 'accent'}
                      size="sm"
                    >
                      {statusInfo.label}
                    </Badge>
                  )}
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
