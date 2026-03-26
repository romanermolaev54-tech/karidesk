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
} from 'lucide-react'

export default function WorkPage() {
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
