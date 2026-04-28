'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatTicketNumber } from '@/lib/utils'
import { TICKET_STATUSES, TICKET_PRIORITIES, PRIORITY_SHOWS_BADGE } from '@/lib/constants'
import Link from 'next/link'
import type { Ticket, TicketStatus } from '@/types/database'
import {
  TicketPlus,
  MapPin,
  User,
  ChevronRight,
  Inbox,
} from 'lucide-react'

export default function MyTicketsPage() {
  const { user } = useAuth()
  const supabase = createClient()

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'completed'>('active')

  useEffect(() => {
    if (!user) return
    loadTickets()
  }, [user, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTickets() {
    if (!user) return
    setLoading(true)

    const activeStatuses: TicketStatus[] = ['new', 'assigned', 'in_progress', 'info_requested']
    const completedStatuses: TicketStatus[] = ['completed', 'verified', 'rejected']

    const { data } = await supabase
      .from('tickets')
      .select(`
        *,
        store:stores(id, store_number, name, city),
        category:ticket_categories(id, name, icon, color),
        assignee:profiles!tickets_assigned_to_fkey(id, full_name)
      `)
      .eq('created_by', user.id)
      .in('status', tab === 'active' ? activeStatuses : completedStatuses)
      .order('created_at', { ascending: false })
      .limit(50)

    setTickets(data || [])
    setLoading(false)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-heading-2 text-text-primary">Мои заявки</h1>
          <p className="text-body-sm text-text-tertiary">Ваши созданные заявки</p>
        </div>
        <Link href="/tickets/new">
          <Button>
            <TicketPlus className="w-4 h-4" />
            Новая заявка
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-elevated/30 border border-border">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 py-2 px-4 rounded-lg text-body-sm font-medium transition-all ${
            tab === 'active'
              ? 'gradient-accent text-white shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Активные
        </button>
        <button
          onClick={() => setTab('completed')}
          className={`flex-1 py-2 px-4 rounded-lg text-body-sm font-medium transition-all ${
            tab === 'completed'
              ? 'gradient-accent text-white shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Завершённые
        </button>
      </div>

      {/* Tickets */}
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
            {tab === 'active' ? 'Нет активных заявок' : 'Нет завершённых заявок'}
          </p>
          {tab === 'active' && (
            <Link href="/tickets/new" className="inline-block mt-3">
              <Button variant="outline" size="sm">
                <TicketPlus className="w-4 h-4" />
                Создать заявку
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => {
            const statusInfo = TICKET_STATUSES[ticket.status]
            const priorityInfo = TICKET_PRIORITIES[ticket.priority]
            return (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="block card-interactive p-4 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body-sm font-semibold text-accent/80">
                        {formatTicketNumber(ticket.ticket_number)}
                      </span>
                      {ticket.status === 'new' && ticket.category ? (
                        <span
                          className="px-2 py-0.5 rounded-md text-caption font-semibold"
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
                          dot
                        >
                          {statusInfo.label}
                        </Badge>
                      )}
                      {PRIORITY_SHOWS_BADGE[ticket.priority] && (
                        <Badge variant={priorityInfo.color as 'warning' | 'danger'}>
                          {priorityInfo.label}
                        </Badge>
                      )}
                      {ticket.is_emergency && (
                        <span className="px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[10px] font-bold uppercase tracking-wide">
                          🚨 Авария
                        </span>
                      )}
                    </div>
                    <p className="text-body-sm text-text-primary mt-1.5 line-clamp-2">
                      {ticket.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      {ticket.store && (
                        <span className="flex items-center gap-1 text-caption text-text-tertiary">
                          <MapPin className="w-3 h-3" />
                          #{ticket.store.store_number} {ticket.store.name}
                        </span>
                      )}
                      {ticket.category && (
                        <span className="text-caption text-text-tertiary">
                          {ticket.category.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-caption text-text-tertiary">
                      {formatRelative(ticket.created_at)}
                    </span>
                    {ticket.assignee && (
                      <span className="flex items-center gap-1 text-caption text-text-tertiary">
                        <User className="w-3 h-3" />
                        {ticket.assignee.full_name?.split(' ')[0]}
                      </span>
                    )}
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
