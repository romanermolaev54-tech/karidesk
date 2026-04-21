'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatTicketNumber } from '@/lib/utils'
import { TICKET_STATUSES } from '@/lib/constants'
import Link from 'next/link'
import type { Ticket, TicketStatus } from '@/types/database'
import {
  MapPin,
  ChevronRight,
  Inbox,
  Route as RouteIcon,
  Calendar,
} from 'lucide-react'
import type { Route } from '@/types/database'

export default function WorkPage() {
  const { user } = useAuth()
  const supabase = createClient()

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'completed'>('active')
  const [routes, setRoutes] = useState<(Route & { tickets: { position: number; ticket: Ticket }[] })[]>([])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const todayIso = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('routes')
        .select(`
          *,
          tickets:route_tickets(
            position,
            ticket:tickets(
              id, ticket_number, description, status, store_id,
              store:stores(store_number, name, city, address)
            )
          )
        `)
        .eq('assigned_to', user.id)
        .gte('route_date', todayIso)
        .in('status', ['planned', 'in_progress'])
        .order('route_date', { ascending: true })
      const normalized = (data || []).map(r => ({
        ...r,
        tickets: (r.tickets || []).sort((a: { position: number }, b: { position: number }) => a.position - b.position),
      })) as unknown as (Route & { tickets: { position: number; ticket: Ticket }[] })[]
      setRoutes(normalized)
    }
    load()
  }, [user, supabase])

  useEffect(() => {
    if (!user) return
    loadTickets()
  }, [user, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTickets() {
    if (!user) return
    setLoading(true)

    const activeStatuses: TicketStatus[] = ['assigned', 'in_progress']
    const completedStatuses: TicketStatus[] = ['completed', 'verified']

    const { data } = await supabase
      .from('tickets')
      .select(`
        *,
        store:stores(id, store_number, name, city, address),
        category:ticket_categories(id, name, icon, color)
      `)
      .eq('assigned_to', user.id)
      .in('status', tab === 'active' ? activeStatuses : completedStatuses)
      .order('created_at', { ascending: false })

    setTickets(data || [])
    setLoading(false)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-heading-2 text-text-primary">Мои задания</h1>
        <p className="text-body-sm text-text-tertiary">Назначенные вам заявки</p>
      </div>

      {/* Routes */}
      {routes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-heading-3 text-text-primary flex items-center gap-2">
            <RouteIcon className="w-5 h-5 text-accent" />
            Мои маршруты
          </h2>
          {routes.map(r => {
            const d = new Date(r.route_date + 'T00:00:00')
            const dateLabel = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', weekday: 'short' })
            return (
              <div key={r.id} className="card-premium p-4 border-l-4 border-l-accent">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-accent" />
                    <span className="text-body-sm font-semibold text-text-primary">{dateLabel}</span>
                    {r.name && <span className="text-caption text-text-tertiary">· {r.name}</span>}
                  </div>
                  <Badge variant={r.status === 'in_progress' ? 'accent' : 'info'} size="sm">
                    {r.status === 'in_progress' ? 'В работе' : 'Запланирован'}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {r.tickets.map((rt, idx) => {
                    const t = rt.ticket
                    if (!t) return null
                    return (
                      <Link
                        key={t.id}
                        href={`/tickets/${t.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg bg-surface-elevated/20 hover:bg-surface-elevated/40 transition-colors"
                      >
                        <span className="w-7 h-7 rounded-lg gradient-accent text-white text-caption font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-caption font-semibold text-text-primary">
                            {formatTicketNumber(t.ticket_number)} · #{t.store?.store_number} {t.store?.name}
                          </p>
                          <p className="text-micro text-text-tertiary line-clamp-1">{t.description}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-elevated/30 border border-border">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 py-2 px-4 rounded-lg text-body-sm font-medium transition-all ${
            tab === 'active' ? 'gradient-accent text-white shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Активные
        </button>
        <button
          onClick={() => setTab('completed')}
          className={`flex-1 py-2 px-4 rounded-lg text-body-sm font-medium transition-all ${
            tab === 'completed' ? 'gradient-accent text-white shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Выполненные
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-premium p-4 animate-pulse">
              <div className="h-4 bg-surface-elevated/60 rounded w-1/3 mb-3" />
              <div className="h-3 bg-surface-elevated/40 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
          <p className="text-body text-text-secondary">
            {tab === 'active' ? 'Нет активных заданий' : 'Нет выполненных заданий'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => {
            const statusInfo = TICKET_STATUSES[ticket.status]
            return (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="block card-interactive p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body-sm font-semibold text-accent/80">
                        {formatTicketNumber(ticket.ticket_number)}
                      </span>
                      <Badge
                        variant={statusInfo.color as 'info' | 'warning' | 'success' | 'danger' | 'accent'}
                        dot
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <p className="text-body-sm text-text-primary mt-1.5 line-clamp-2">{ticket.description}</p>
                    {ticket.store && (
                      <span className="flex items-center gap-1 text-caption text-text-tertiary mt-2">
                        <MapPin className="w-3 h-3" />
                        #{ticket.store.store_number} {ticket.store.name}
                        {ticket.store.address && ` — ${ticket.store.address}`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-caption text-text-tertiary">{formatRelative(ticket.created_at)}</span>
                    <ChevronRight className="w-4 h-4 text-text-tertiary mt-1" />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
