'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatTicketNumber } from '@/lib/utils'
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/lib/constants'
import Link from 'next/link'
import type { Ticket, TicketStatus } from '@/types/database'
import {
  Search,
  Filter,
  TicketPlus,
  MapPin,
  User,
  ChevronRight,
  ClipboardList,
} from 'lucide-react'

export default function TicketsPage() {
  const { profile, isAdmin, isDirector } = useAuth()
  const supabase = createClient()

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadTickets()
  }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTickets() {
    setLoading(true)
    let query = supabase
      .from('tickets')
      .select(`
        *,
        store:stores(id, store_number, name, city),
        category:ticket_categories(id, name, icon, color),
        division:divisions(id, name),
        creator:profiles!tickets_created_by_fkey(id, full_name),
        assignee:profiles!tickets_assigned_to_fkey(id, full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    // Directors see only their division
    if (isDirector && profile?.division_id) {
      query = query.eq('division_id', profile.division_id)
    }

    const { data } = await query
    setTickets(data || [])
    setLoading(false)
  }

  const filtered = search.trim()
    ? tickets.filter(t =>
        t.ticket_number?.toString().includes(search) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.store?.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.store?.store_number?.includes(search)
      )
    : tickets

  const statusCounts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-heading-2 text-text-primary">Заявки</h1>
          <p className="text-body-sm text-text-tertiary">{tickets.length} заявок</p>
        </div>
        {(isAdmin || profile?.role === 'employee') && (
          <Link href="/tickets/new">
            <Button>
              <TicketPlus className="w-4 h-4" />
              Новая заявка
            </Button>
          </Link>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Поиск по номеру, описанию, магазину..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2.5 rounded-xl border transition-colors ${
            showFilters || statusFilter !== 'all'
              ? 'border-accent/40 bg-accent/5 text-accent'
              : 'border-border text-text-tertiary hover:border-border-strong'
          }`}
        >
          <Filter className="w-5 h-5" />
        </button>
      </div>

      {/* Status filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 animate-fade-in">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'gradient-accent text-white'
                : 'bg-surface-elevated/40 text-text-tertiary hover:text-text-secondary'
            }`}
          >
            Все ({tickets.length})
          </button>
          {(Object.keys(TICKET_STATUSES) as TicketStatus[]).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'gradient-accent text-white'
                  : 'bg-surface-elevated/40 text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {TICKET_STATUSES[status].label} ({statusCounts[status] || 0})
            </button>
          ))}
        </div>
      )}

      {/* Tickets list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-premium p-4 animate-pulse">
              <div className="h-4 bg-surface-elevated/60 rounded w-1/3 mb-3" />
              <div className="h-3 bg-surface-elevated/40 rounded w-2/3 mb-2" />
              <div className="h-3 bg-surface-elevated/40 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
          <p className="text-body text-text-secondary">Заявок не найдено</p>
          {search && (
            <button onClick={() => setSearch('')} className="text-body-sm text-accent mt-2 hover:underline">
              Сбросить поиск
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ticket => {
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
                      <Badge
                        variant={statusInfo.color as 'info' | 'warning' | 'success' | 'danger' | 'accent'}
                        dot
                      >
                        {statusInfo.label}
                      </Badge>
                      {ticket.priority !== 'normal' && (
                        <Badge variant={priorityInfo.color as 'warning' | 'danger'}>
                          {priorityInfo.label}
                        </Badge>
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
